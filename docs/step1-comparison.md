# 步骤 1：alibaba/page-agent 与 SpirdAuto 方案对比

> 结论：**基于 page-agent 改造**，保留其页面控制 + 浏览器插件 + MCP 能力，补充爬虫所需的流程编排、数据收集和导出功能。

---

## 1. alibaba/page-agent 核心原理

### 1.1 一句话总结

**纯页面内 JavaScript 的 AI 浏览器代理** — 不需要 Python、不需要 CDP、不需要无头浏览器。

### 1.2 工作方式

```
用户指令："点击登录按钮，输入用户名 admin"
    ↓
PageAgentCore 循环
    ↓
PageController.getBrowserState()
    → 把当前页 DOM 转成简化文本（扁平化树）
    → 每个可交互元素分配一个整数索引
    ↓
LLM 收到：文本 DOM + 工具列表（click_element_by_index / input_text / scroll / ...）
    ↓
LLM 返回工具调用：click_element_by_index(42)
    ↓
PageController 在页面内直接执行 DOM 操作
    ↓
重新读取状态 → 循环 → 直到 done
```

### 1.3 关键技术细节

| 技术点 | 实现 |
|--------|------|
| DOM 抽取 | `getFlatTree` 遍历 DOM → 生成简化 HTML 字符串（抄自 browser-use 的思路） |
| 元素定位 | 索引映射 `Map<index, element>`，LLM 指索引不指 CSS 选择器 |
| DOM 操作 | 原生 DOM API，派发真实事件；还有 `patchReact` 兼容 React 受控组件 |
| LLM 调用 | OpenAI 兼容接口（DashScope / Ollama / 任何兼容 API 都行） |
| 循环控制 | Agent Loop：读状态 → 调 LLM → 执行工具 → 读状态 → ... 直到 done |
| 视觉遮挡 | SimulatorMask 可选遮罩，防止用户误操作 |

### 1.4 Chrome 插件

**有**。`packages/extension` — Manifest V3，技术栈 WXT + React + Tailwind + shadcn/ui。

- **不是 CDP 控制**，用的是标准 `chrome.runtime.sendMessage` + content script 注入。
- 原理：把 `PageController` 注入到每个 tab 里，通过 `RemotePageController` 用消息传递来操作，和 CDP 控制是两个思路。
- 多标签页协调：`MultiPageAgent` + `TabsController`，状态存 `chrome.storage.local`，历史记录存 IndexedDB。

### 1.5 MCP 支持

**有**。`packages/mcp` — MCP Server（beta），通过 WebSocket 桥接插件的 hub，让外部工具（Claude/IDE/Dify 等）远程控制用户浏览器。

---

## 2. 与 SpirdAuto 原设计对比

| 维度 | SpirdAuto 原设计 | alibaba/page-agent |
|------|-------------------|--------------------|
| **运行方式** | Python 后端 + CDP 控制浏览器 | 纯页面内 JS，零外部依赖 |
| **浏览器插件** | 自己写的 DevTools Panel | ✅ 已有成熟 MV3 插件（WXT + React） |
| **页面操作** | CDP 协议（最小化也能跑） | 原生 DOM 事件（需要页面在前台） |
| **AI 参与** | 步骤执行时按需调 AI | **全程 LLM 循环决策**每一步操作 |
| **流程编排** | 步骤列表 + 节点（打开/循环/提取/点击） | ❌ 无（只有单次 prompt → 执行） |
| **数据提取** | AI 分析 DOM 提取字段 → 累积 | ❌ 没有提取/存储的概念 |
| **数据导出** | CSV / Excel | ❌ 无 |
| **翻页/遍历** | 流程引擎内置循环节点 | ❌ 无 |
| **人工介入** | `wait_human` 节点暂停 | `ask_user` 工具可暂停询问 |
| **过 CF/验证码** | 人工介入后继续 | ✅ 天然过，就是普通浏览器操作 |
| **MCP 支持** | 无 | ✅ 已有 MCP Server |
| **跨标签页** | CDP 多 target | ✅ MultiPageAgent |
| **代码成熟度** | 仅设计文档 | 已发布 npm，有测试、文档、demo |

---

## 3. page-agent 缺什么（我们需要补充的）

| 缺失能力 | 我们需要的 |
|----------|------------|
| ❌ 数据累积存储 | ✅ 每个爬取步骤的结果缓存在内存/IndexedDB |
| ❌ 流程可视化 | ✅ 步骤列表 + 流程图展示（类似 Dify 简化版） |
| ❌ 翻页/遍历循环 | ✅ 自动检测翻页按钮、自动翻页并继续提取 |
| ❌ 分类切换 | ✅ 遍历分类 → 进入子页面 → 继续提取 |
| ❌ 数据导出 | ✅ 添加 `export_csv` / `export_excel` 工具调用 |
| ❌ 字段映射 | ✅ 用户指定要提取哪些字段，AI 识别对应元素 |

---

## 4. 结论：基于 page-agent 改造

**page-agent 解决了最难的"AI 控制浏览器页面"问题**，且已有成熟的插件 + MCP 架构。我们不需要重新造 CDP 和插件。

改造方向：

```
page-agent（保留）              我们新增
─────────────                   ─────────
• PageController (DOM操控)     • 数据收集器（内存 + IndexedDB）
• PageAgentCore (Agent循环)    • 流程引擎（步骤列表 + 循环翻页）
• LLM Client (AI调用)          • 提取工具（ai_extract_fields）
• Chrome Extension (UI基础)    • 导出工具（export_csv / export_excel）
• MCP Server (外部控制)        • 流程图 UI（步骤可视化 + 执行进度）
                               • DashScope Flash 接入
```

---

## 5. 参考项目

- **alibaba/page-agent**：https://github.com/alibaba/page-agent
  - AI 浏览器代理内核 + Chrome 插件 + MCP Server
  - License: MIT

---

## 6. 最终交付物

结合 page-agent 的页面操控能力 + 我们的流程编排与数据管线，产出一个**可对话编排的电商数据爬取 Chrome 插件**：

- 用户和 AI 对话描述要爬什么
- AI 生成步骤流程（打开页面 → 翻页循环 → 提取字段）
- 流程可视化展示在插件面板中
- 每步实时展示当前进度和已收集数据
- 最终一键导出 CSV/Excel
- 通过 MCP 可被外部工具（Dify 等）调用
- 使用 DashScope Flash 作为 AI 后端（低成本）
