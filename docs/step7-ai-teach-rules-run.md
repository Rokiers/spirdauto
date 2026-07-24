# 步骤 7：AI 只教学、规则全接管（设计重规划）

> 核心转变：AI 只用来**检测页面结构、分析网络请求、构建方案**；方案产出后是一个**不依赖 AI 的纯规则 Flow**（选择器 + 循环 + 请求 + 数据清洗），重播时彻底不需要 AI，也不用限制步数。

---

## 1. 核心理念

```
            ┌── 教学阶段（AI，一次性） ──┐
            │                            │
            │  inspect_html 看 DOM 结构   │
            │  start_intercept 抓 XHR     │
            │  get_page_elements 看交互    │
            │                            │
            │  AI 综合判断 → 写方案       │
            │                            │
            └──────────────┬─────────────┘
                           │
                           ▼
              ┌── Flow（纯规则，无 AI）──┐
              │                          │
              │  itemSelector + 字段       │
              │  scrollCollect(until)     │
              │  paginate(urlTemplate)    │
              │  fetchJson(endpoint)      │
              │  forEachPage(linkList)    │
              │  dedupKey                 │
              │                          │
              └──────────────┬───────────┘
                             │
                             ▼
              重播 = 规则引擎顺序执行
               • 不限步数
               • 不调 LLM
               • 快（和 hand-written py 爬虫一样）
```

---

## 2. 关键规则

### 2.1 AI 只做三件事（教学阶段）
1. **识别数据来源**：DOM 渲染数据 / XHR fetch 接口 / 页面内嵌 JSON
2. **分析加载方式**：进入即全量 / 分页器 / 无限滚动 / 多静态页
3. **生成方案**：写出 itemSelector、字段选择器、循环方式、停止条件、去重键

### 2.2 教学阶段不限制 maxSteps
- AI 可以慢慢看、多试几次，只要最终产出正确的 Flow
- 上下文问题通过**历史裁剪**解决：**只保留"产出"（工具结果），剔除"思考"（assistant 文本）**
  - 裁剪规则：assistant 消息仅保留 `tool_calls`，去掉 `content` 文本；对 `get_page_elements`/`inspect_html` 的结果，旧快照替换为占位符 `"[已过期]"`，只保留最新一份
  - 这样上下文中 95% 都是"数据结果"，10 步和 40 步的 token 开销几乎相同

### 2.3 产出的 Flow 完全不依赖 AI
- 滚动 → `scrollCollect` 函数原语（边滚边取 + 去重，直到不再增长）
- 翻页 → `paginate` 函数原语（URL 模板 或 点下一页 + 停止条件）
- 多页 → `forEachPage` 函数原语（收链接列表 → 逐个采集）
- 接口 → `fetchJson` 函数原语（按分页循环请求端点）
- 提取 → `extract` 步骤（选择器 + 字段 → 入数据集）

### 2.4 重播不限制步数
- 重播时流控由**停止条件**决定（翻页按钮消失、数据不再增长、接口返回空），不是硬上限

---

## 3. AI 教学时的工具箱

| 工具 | 类型 | 用途 |
|------|------|------|
| `get_page_elements` | 观察 | 看当前视口的可交互元素，判断是否有翻页、加载更多等 |
| `inspect_html(selector?)` | 观察 | 看真实 HTML 结构（tag/class/id），写选择器 |
| `start_intercept` | 录制 | 开启 monkey-patch，捕获 fetch/XHR |
| `stop_intercept` | 录制 | 停止捕获 |
| `get_intercepted` | 观察 | 查看捕获到的网络请求列表 |
| `click_element(index)` | 动作（录） | 点击，同时生成耐用 locator |
| `input_text(index,text)` | 动作（录） | 输入，同时生成耐用 locator |
| `scroll(down,numPages)` | 动作（录） | 教学期滚动探索页面 |
| `extract_list(itemSelector,fields)` | 动作（录+数据） | 选择器提取数据并入库 |

### 3.1 AI 自校验工具
教学中 AI 产出 Flow 后，需要自己去页面跑一遍、对比数据、确认正确：
- `run_flow_test(flow)`：教学阶段跑一遍刚产出的 Flow → 返回样本行
- AI 拿到样本后对照页面：不吻合则调选择器 / 调字段取值 → 再跑再验 → 直到匹配

```
AI 自校验流程:
  ① AI 构建 Flow（含 extract/fetchJson/scollCollect 等步骤）
  ② 调用 run_flow_test(Flow) → 执行一遍，拿到前几行样本
  ③ AI 对照当前页面：「第一条名称是X，对上了」「价格是Y，也对上了」
  ④ 若不对 → 调整选择器 → 更新 Flow → 再跑再验
  ⑤ 全部对上 → Flow 校验通过，保存
```

### 3.2 场景通用性
- 无限滚动只是一个具体场景，和"分页器""多静态页""进入即全量""接口驱动"并列
- 处理流程统一：AI 识别属哪种 → 选对应原语 → 填参数 → 校验 → 生成 Flow
- 不针对某一个页面做特殊优化

---

## 4. Flow 原语（纯规则，重播不调 AI）

| 原语 | 说明 | 停止条件 |
|------|------|---------|
| `extract` | 一次性选择器提取 | 无（单次） |
| `fetchJson` | 按分页参数循环请求接口，用 responseMapper 取字段 | 响应空 / 出错 / 达到安全上限 |
| `scrollCollect` | 规则循环：滚动(或点加载更多) → 等增长 → 选择器提取 → 去重 | 条目不再增长 / 加载按钮消失 |
| `paginate` | 优先 URL 模板 `?page=n`，否则点"下一页" | 下一页消失/禁用 / 无新数据 |
| `forEachPage` | 收 URL 列表(从链接提取 `/ 直接 navigate`) → 逐个采集 | 列表尽头 |

每个原语都自带：
- `itemSelector` + `fields（字段选择器 + 取值方式）`
- `dedupKey`（跨批次去重键）
- 停止条件（翻页按钮消失 / 不再增长 / 接口返回空）

---

## 5. AI 教学流程（以 items7 无限滚动为例）

```
用户: "把这个类的所有物品、名称、详情、价格都抓下来"

AI 步骤（教学，不限步数）:

① inspect_html          → 看到 ul#load_data > li.cfix 卡片结构
② start_intercept       → 开启网络捕获
③ scroll * 2            → 触发 XHR 加载
④ stop_intercept        → 停止捕获
⑤ get_intercepted       → 看到 /load_data?page=1&type=xxx&offset=20
                           识别为 "接口驱动的无限滚动"
⑥ 构造 fetchJson:        endpointUrl 用参数化 URL，responseMapper 从 JSON 路径提取
⑦ 或者构造 scrollCollect: itemSelector, fields, dedupKey=链接, 滚动触发放新数据
⑧ 生成 Flow
```

方案产出后就是纯规则重播，不依赖 AI。

---

## 6. 具体实现计划

### 6.1 历史裁剪 + 不限制 maxSteps（先做，解决基础问题）
- `runToolLoop` 加 `trimHistory`：assistant 消息仅保留 `tool_calls`（去掉 `content` 文本）；旧 `get_page_elements`/`inspect_html` 结果替换为 `"[已过期]"`
- `get_page_elements` 内容硬上限：约 8000 字符 / 100 元素
- 录制模式下 **maxSteps 移除或设为极大值**，靠超上下文兜底 + 裁剪保证不崩

### 6.2 接口引擎（核心新增）
- 主世界 monkey-patch：`startIntercept / stopIntercept / getIntercepted`
- 工具：`start_intercept / stop_intercept / get_intercepted / fetch_json / run_flow_test`
- Flow 新增 `fetchJson` 步
- 重播支持

### 6.3 DOM 引擎完善
- `scrollCollect` 原语（纯规则：滚→等→取→去重→直到不再增长）
- `paginate` 原语（URL 模板 / 点按钮）
- `forEachPage` 原语（URL 列表 / 逐个点按钮）
- Flow 类型扩展，replay 新增处理

### 6.4 AI 自校验
- 新增 `run_flow_test` 工具：教学中 AI 产出的 Flow 本地执行一遍 → 返回样本
- 系统提示教 AI：产出 Flow 后必须运行校验，不匹配则重新调整

### 6.5 录制校验
- 停止录制时，如果没录到 `extract / fetchJson / scrollCollect / paginate / forEachPage` 任一数据步，警告"未录到数据采集步骤，重播不会产出数据"

### 6.5 滚动 → 函数（而非工具调用）
- 重播时 `scrollCollect` 内部的滚动是**纯 JS 调用 `domScroll`**，不走消息桥接
- scrollCollect 作为**主世界的函数**闭包执行（sendMessage 开销只在 collect 前/后用来通信）

---

## 7. 文件改动清单

| 文件 | 改动 |
|------|------|
| `lib/llm/client.ts` | `runToolLoop` 加历史裁剪、录制时 maxSteps 不限制 |
| `lib/tools/page.ts` | 新增 `start_intercept / stop_intercept / get_intercepted / fetch_json` |
| `entrypoints/page-controller-world.ts` | 新增 monkey-patch (`startIntercept`) + `fetchJson` + `scrollCollect` 规则函数 |
| `lib/flow/types.ts` | 新增 `fetchJson / scrollCollect / paginate / forEachPage` 步类型 |
| `lib/flow/replay.ts` | 新增对应的重播逻辑 |
| `ChatPanel.tsx` | 系统提示升级（AI 是分析者不是执行者）、录制校验（必须有数据步）、录制时 maxSteps 加大 |

---

## 8. 和 step6 的关系

step6 是详细设计和分阶段规划，step7 是在你最新想法下做了两个关键调整：
1. **AI 的角色限定**：从"操作者+决策者"升级到**"分析者+方案构建者"**，执行权交给规则
2. **不限制步数**：教学时可以做任意多步分析，通过历史裁剪保证不崩

step6 的接口引擎 / DOM 引擎 / 结构化采集的具体实现方案不变，在此文档就不再重写。

---

## 9. 待定事项

- `run_flow_test` 工具是在 sidepanel 本地执行还是需要主世界配合？倾向于本地（直接调 replay.ts），但跨页导航 Flow 需等页面加载完毕后恢复执行
- monkey-patch 拦截时可能包括广告/分析/静态资源 URL，去重和滤噪需要验证
- 结构化原语内部的错误处理（如某页请求失败、某条滚动无新数据但有网络波动）需定义清楚
- 大型站点多类型多页面的采集（列表页→详情页→列表页交替）需评估 forEachPage 对嵌套子列表的扩展性
