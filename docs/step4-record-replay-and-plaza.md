# 步骤 4：录制-重播流程 + 爬虫广场（规划）

> 目标：AI 摸索一次 → 冻结成可重播的 Flow（流程图）→ 之后爬同类页面直接重播、不再调 AI。并建立按站点分类的"爬虫广场"共享配方。

---

## 1. 背景

当前已有：WXT + React 插件、原生 tool_calls 对话循环、三个标签页级工具（`list_tabs` / `get_current_page` / `switch_tab`）。缺页面内真实操作能力（点击 / 输入 / 提取）。录制-重播的前提是先有"页面控制层"。

---

## 2. page-agent 对比与借用

| 维度 | page-agent（PageAgentCore） | 我们现在（runToolLoop） | 借用与否 |
|------|-----------------------------|--------------------------|---------|
| **循环** | ReAct：观测→思考→执行，每步重读 DOM，`maxSteps=40` | 不重读页面，`maxSteps=5` | 录制期借用其循环理念 |
| **LLM 调用** | 每步 1 次，`tool_choice` 强制单个 MacroTool，只出 1 个 action + 反思字段 | 原生 `tool_calls`，一轮可多个 | 录制期借鉴"一步一动作"（保证每步可记录） |
| **历史** | 压缩成文本 `<step_N>`(评估/记忆/目标/结果)，只带最新 browser_state | 保留完整 messages 数组 | 视需要借鉴（省 token） |
| **元素定位** | 扁平化 DOM + 整数索引 `[33]<button>` | 无 | **借用其 DOM 引擎**，但录制时转成耐用 locator |
| **工具集** | done/wait/ask_user/click_element_by_index/input_text/select_dropdown_option/scroll/scroll_horizontally/execute_javascript | list_tabs/get_current_page/switch_tab | 借用页面级动作 |
| **system prompt** | ~9.8KB（browser-use 派生）：输入格式/浏览器规则/完成规则/推理规则/输出 schema | 一小段 | 录制期借鉴其浏览器规则 |
| **反思字段** | evaluation_previous_goal/memory/next_goal | 无 | 可选借鉴 |
| **光标动画** | showMask/hideMask 包住整个 task | 无 | 借用（SimulatorMask） |

**为什么他这么设计**：页面每次操作后都会变、元素索引会失效，所以"每步重新观测 + 索引化元素 + 强制一步一动作 + 压缩历史"是核心哲学（browser-use 前端移植版）。

**结论**：引入 `@page-agent/page-controller`（DOM 扁平化 + 索引 + actions + 光标），保留我们自己的 UI / LLM / 工具编排。

---

## 3. 页面控制层集成

- `pnpm add @page-agent/page-controller`（含 `ai-motion`）
- 在 content script / main world 注入 `PageController`（参考 page-agent extension 的 main-world 注入方式）
- 新增运行时工具（接入现有 runToolLoop）：`get_page_elements`、`click_element(index)`、`input_text(index, text)`、`select_option`、`scroll`
- 光标动画随 actions 自动播放（page-controller 内部 dispatch `PageAgent::MovePointerTo` / `PageAgent::ClickPointer`，SimulatorMask 监听）

---

## 4. 录制-重播设计（本轮定为**纯重播**）

### 4.1 耐用 Locator（关键）

不录临时索引，录稳定定位符，优先级：`id` → 唯一 CSS → `role` + 文本 → 相对锚点。

```
Locator { strategy: "css" | "xpath" | "text" | "role", value: string }
```

> page-agent 的 `[33]` 索引是每次重建的、临时的，重播时早失效，所以录制时必须转成耐用 locator。

### 4.2 Flow JSON schema

```
Flow {
  id, name, version, createdAt,
  match: { domain: string, urlPattern: string },
  steps: Step[]
}

Step =
  | { type:"navigate",  url, waitFor? }
  | { type:"click",     locator }
  | { type:"input",     locator, text }
  | { type:"select",    locator, optionText }
  | { type:"scroll",    down, pages?, locator? }
  | { type:"wait",      seconds?, forSelector? }
  | { type:"extract",   itemLocator, fields:[{ name, locator, attr? }] }
  | { type:"paginate",  nextLocator, maxPages, untilSelectorGone? }
  | { type:"loop",      overLocator, body: Step[] }
```

### 4.3 录制流程

1. 进入"录制模式"，AI 用 page-controller 操作页面完成一次任务
2. 每执行一个动作，从被操作元素**反推耐用 locator**，追加成 Step
3. 翻页 / 列表 / 字段提取需 AI 用专门的录制期工具显式标注：`mark_pagination`、`mark_item_list`、`extract_fields` → 落成 paginate / loop / extract 节点
4. 保存为 Flow（IndexedDB）

### 4.4 重播引擎（无 LLM）

- content script 按 steps 顺序执行：解析 locator → 执行 DOM 动作
- `extract` 收集成行 → 数据管线（数据 tab 预览 + 导出 CSV / Excel）
- `paginate` / `loop` 确定性重复

### 4.5 失败处理

- 纯重播：某步 locator 找不到 → **停下报错并高亮是哪一步**，提示用户重新录制
- （"调 AI 修单步"的自愈策略列为**未来可选**，本轮不做）

---

## 5. 爬虫广场

- **本地流程库**：自己录的 Flow 存 IndexedDB，支持导入 / 导出 JSON
- **广场**：托管一个**静态 Flow 索引 JSON**（GitHub Pages，无需后端），条目 `{ name, domain, urlPattern, author, flowUrl }`，一键下载导入本地
- **匹配推荐**：打开页面时按 `domain / urlPattern` 推荐可用 Flow

---

## 6. 架构影响（UI）

- 底部 Tab 增加「流程」页（StepPanel）：录制 / 重播 / 编辑 / 流程列表 +「广场」入口
- 「数据」页接重播产出的表格 + 导出
- 首页对话保持；录制模式在对话里发起

---

## 7. 分阶段路线

1. 接入 page-controller + 光标，补页面级工具（click / input / scroll / extract）
2. 动作补耐用 locator 记录
3. 录制 → Flow(JSON) 落库
4. 重播引擎（纯重播）+ 数据提取 → 导出
5. 本地流程库（导入 / 导出）
6. 爬虫广场（静态 JSON 索引 + 导入 + URL 匹配推荐）

---

## 8. 待定事项

- Flow 编辑器要多可视化（列表够用 vs 拖拽流程图）
- extract 的字段选择：AI 自动识别 vs 用户手动圈选
- 广场托管形态（GitHub 仓库 JSON vs 简单站点）
- 多站点 locator 稳健性策略（是否给 fallback 备选）

---

## 9. 风险（浏览器生命周期）

- content script 方案：目标标签页后台可能被**冻结 / 丢弃**，重播长任务需页面保持前台 / 活动
- MV3 service worker 空闲约 30s 回收 → 重播循环放 sidepanel 更稳
- 最小化窗口一般不影响 DOM 读取；切走的后台 tab 有风险
