# 步骤 5：实现进展 + 关键讨论沉淀（为下一步规划做准备）

> 本文把「接入 page-agent controller + AI 对话工具 + AI 录制/单页重播」这一阶段的实现现状，以及过程中关于架构、生命周期、纯重播可行性的关键交流，沉淀下来，作为下一步规划的依据。

---

## 1. 当前已完成（代码现状）

### 1.1 插件骨架（step3）
- WXT + React 19 + Vite + zod，pnpm
- 底部 Tab：首页 / 流程 / 数据 / 设置
- LLM 接入：DeepSeek / Kimi（OpenAI 兼容），设置页填 Key 失焦自动拉模型
- 对话：原生 tool_calls 循环 `runToolLoop`

### 1.2 接入 page-agent 的 PageController（controller）
- 依赖 `@page-agent/page-controller`（含 `ai-motion`）
- **主世界脚本** `entrypoints/page-controller-world.ts`：`new PageController({ enableMask:true })`，暴露 `getBrowserState / click / input / scroll / showMask / hideMask`
- **隔离世界中继** `entrypoints/content.ts`：用 `injectScript` 注入主世界脚本，`chrome.runtime` ↔ `window.postMessage` 桥接
- `background` 转发 `PC_CALL` 到活动标签页；`lib/pc.ts` 提供 `pcCall`
- **光标动画**（SimulatorMask）已生效

### 1.3 AI 对话接入页面操作工具
- `lib/tools/page.ts`：`get_page_elements / click_element / input_text / scroll`
- `lib/tools/browser.ts`：`list_tabs / get_current_page / switch_tab`
- 系统提示强调「先读元素拿序号 → 再操作 → 页面变了重读」，一次一个动作；循环期间显示光标

### 1.4 AI 录制 → Flow → 单页纯重播
- 主世界动作时用**事件捕获**拿到真实元素 → `buildLocator()` 生成**耐用 CSS locator**（`#id` → `data-testid/name/aria-label` → `nth-of-type` 路径）
- 重播方法 `replayClick / replayInput / replayScroll`：按 locator 现场解析元素执行，并驱动光标飞行 + 点击波纹
- `lib/flow/`：`types.ts`（Flow/Step/Locator，zod）、`store.ts`（chrome.storage）、`replay.ts`（sidepanel 逐步重播）
- ChatPanel「录制流程」：采集 AI 的 click/input/scroll → 存 Flow
- 「流程」tab：列表 / 运行 / 删除

---

## 2. 关键技术讨论与结论

### 2.1 page-agent 靠 DOM 引用操作，且引用是临时的
- `PageController.updateTree()` 每次重建 `selectorMap = Map<index, 真实DOM节点>`
- `clickElement(index)` 拿真实元素引用派发事件
- **索引 `[33]` 不稳定**，DOM 变/导航就失效 → 它每步都重新 `getBrowserState()` 重新索引
- **对重播的硬约束**：绝不能录索引/元素引用，必须录耐用 locator，重播时每步现场重新解析

### 2.2 content script / 隔离世界 / 主世界 / 桥接
- content script：注入网页的 JS，能访问 DOM；**随页面刷新/导航被销毁重建，内存清零**
- 隔离世界：与网页共享 DOM 但不共享 JS 变量 → 看不到页面 React 内部
- 主世界：网页自身 JS 环境，能碰 React 内部 / eval
- page-agent 把 PageController 放**主世界**（为了 `patchReact` 改 React 受控输入 + `eval`）
- 主世界**用不了 `chrome.*` API** → 必须保留一个薄薄的隔离中继转发消息
- 链路：`sidepanel ⇄ background ⇄ content(隔离,中继) ⇄ 主世界(PageController)`

### 2.3 跨刷新怎么做得稳（本轮先单页，未来要做）
- "大脑和记忆"（当前步号、已采数据）放 **sidepanel + chrome.storage**，不放页面内
- 每步：sidepanel → content 执行**一个原子动作** → 返回；若触发跳转 → 监听 `chrome.tabs.onUpdated` 等 `complete` → 继续；每步重新解析 locator
- 即 Selenium/Playwright 的"驱动器在外部"模式

### 2.4 纯重播（不靠 AI）可行性
- 可行，是成熟套路；真正风险不是刷新，而是**定位符脆性**（改版 / hash 类名 / 必须点击返回的站点）
- 本轮策略：**纯重播，失败就停下报第几步、让用户重录**（AI 自愈留未来）

### 2.5 循环不能硬编码数量（下一步要做）
- 分类/翻页不能记"循环 N 次"，要**结构驱动**：
  - `forEach(overLocator)`：重播时现场解析集合，有几个跑几个
  - `paginate` 用**停止条件**（下一页消失/禁用、无新数据、URL 不变），页数仅作安全上限
- 跨导航不能持元素引用 → 集合转**稳定 key**（优先 href/URL）；**能 URL 驱动就 URL**（先收 URL 再逐个 navigate），绕开"点击+返回"脆性

### 2.6 视口变化 / 懒加载 / 无限滚动（下一步要做）
- 提取不能"抓一次全拿到"：`collectList` 要**滚动收集**（滚→抽新项→重复到不再增长/到底），虚拟列表**边滚边抽 + 按 key 去重**

### 2.7 "没有分页器" / "先点 N 次加载更多，分页器才出现"（下一步要做）
- 加一个通用 `repeat` 原语 + 扩充停止条件（尤其"直到某元素出现" `selectorAppears`）：
  - 场景 A（只有加载更多/无限滚动）：`repeat { click 加载更多 } until selectorGone(按钮) 或 noNewItems`
  - 场景 B（先点若干次展示更多，分页器才出现，再翻页）：
    - 阶段1 `repeat { click 展示更多 } until selectorAppears(分页器)`
    - 阶段2 `paginate { next } until selectorGone(下一页)`
- 每轮 `waitBetween`（等条目数增长/网络空闲）处理异步 XHR；加载更多按钮每轮重新解析 locator

---

## 3. 当前限制（已知）
- 重播只支持 **click / input / scroll**，**没有 extract**（还不能把数据抓进「数据」tab）
- 只支持**单页**，不处理跨页导航 / 刷新续跑
- 只**纯重播**，locator 失效即停，无自愈
- 循环/翻页/加载更多等结构化控制**尚未实现**（Flow schema 目前只有三种 Step）
- locator 仅 css/text，无 fallback 备选
- PageController 跑在隔离世界还是主世界：当前用**主世界**（React 输入更稳）

---

## 4. 下一步待规划（候选方向）
1. **extract 提取**：`extract`/`collectList` 节点 + 字段选择（AI 识别 or 手动圈选）→ 数据进「数据」tab → 导出 CSV/Excel
2. **结构化控制**：`repeat` / `paginate(until)` / `forEach` / 停止条件（含 `selectorAppears`）/ 去重键 / `waitBetween`
3. **跨页重播**：sidepanel 编排 + 等加载续跑 + 状态持久化断点续跑
4. **爬虫广场**：本地流程库导入/导出 + 静态 JSON 索引 + URL 匹配推荐
5. **健壮性**：locator fallback 备选；（更远期）失败时 AI 自愈单步

## 5. 待决问题（下次规划先定）
- 先做 **extract（能出数据）** 还是先做 **结构化循环（能翻页/加载更多）**？
- extract 的字段选择：AI 自动识别 vs 用户手动圈选？
- 何时引入跨页重播（很多电商翻页是整页跳转，不做的话覆盖面有限）？
- 爬虫广场托管形态（GitHub 仓库 JSON vs 简单站点）？
