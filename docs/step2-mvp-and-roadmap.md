# 步骤 2：MVP 跑通 + 魔改路线

> 基于 alibaba/page-agent（MIT License），先原版跑通，再逐步加入爬虫能力。

---

## 1. MVP：原版插件跑起来

### 1.1 获取代码

```bash
git clone https://github.com/alibaba/page-agent.git
cd page-agent
```

### 1.2 安装 + 构建

```bash
npm install           # monorepo 全量安装
npm run dev:ext       # 开发模式，热更新
```

或直接出构建产物：

```bash
npm run build:ext     # → packages/extension/.output/chrome-mv3/
```

### 1.3 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `packages/extension/.output/chrome-mv3/`
5. 点击工具栏扩展图标 → Sidepanel 从右侧滑出

### 1.4 配置 LLM

在 Sidepanel 的 Settings 里填写：

| 配置项 | 值 |
|--------|-----|
| Base URL | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| API Key | 你的 DashScope API Key |
| Model | `qwen-flash` |

### 1.5 测试

打开任意网页（如淘宝搜索页），在 Sidepanel 输入指令：

> "把当前页面的所有商品名称列出来"

### 1.6 预期效果

```
你: 把当前页面所有商品名称列出来

[AI 正在分析页面...]

AI Step 1: 获取浏览器状态 → 识别到页面结构
AI Step 2: 滚动查看更多商品
AI Step 3: 提取商品名称列表
AI done: "当前页面包含以下商品:
  1. 机械键盘 RGB 青轴
  2. 无线鼠标 蓝牙5.0
  3. ..."
```

---

## 2. 项目结构（我们关心的部分）

```
page-agent/
├── packages/
│   ├── page-controller/     ← DOM遍历、元素操作、文本化
│   │   └── src/
│   │       ├── PageController.ts     ← 核心控制器
│   │       ├── dom/index.ts          ← flatTreeToString() 转文本
│   │       └── dom/dom_tree/index.js ← DOM扁平化遍历（53KB）
│   │
│   ├── core/                ← Agent循环、工具定义、系统Prompt
│   │   └── src/
│   │       ├── PageAgentCore.ts      ← Agent主循环
│   │       ├── tools/index.ts        ← 9个工具定义（click/input/scroll...）
│   │       └── prompts/system_prompt.md  ← LLM系统指令
│   │
│   ├── llms/                ← LLM客户端（OpenAI兼容）
│   │
│   ├── ui/                  ← 页面内嵌入的聊天面板
│   │   └── src/
│   │       └── panel/Panel.ts        ← 浮动聊天窗口（页面内）
│   │
│   └── extension/           ← ★ 我们的主战场
│       └── src/
│           ├── entrypoints/
│           │   ├── background.ts     ← Service Worker, 消息路由
│           │   ├── content.ts        ← Content Script, 注入Agent
│           │   ├── main-world.ts     ← 暴露 window.PAGE_AGENT_EXT
│           │   └── sidepanel/
│           │       ├── App.tsx       ← Sidepanel聊天UI
│           │       ├── main.tsx      ← React入口
│           │       └── index.html    ← HTML模板
│           └── agent/
│               ├── MultiPageAgent.ts         ← 多标签页Agent调度
│               ├── RemotePageController.ts   ← 远程DOM控制
│               ├── useAgent.ts               ← React Hook
│               ├── tabTools.ts               ← 跨标签页工具
│               └── system_prompt.md          ← 插件的系统Prompt
```

---

## 3. 插件架构（通信流程）

```
┌─ Chrome 浏览器 ───────────────────────────────────────────┐
│                                                           │
│  ┌─ Sidepanel (React App) ──────────────────────────┐    │
│  │  App.tsx                                          │    │
│  │  [输入指令] [发送] [停止] [历史] [配置]            │    │
│  │       ↕ useAgent.ts                               │    │
│  │       ↕ chrome.runtime.sendMessage                │    │
│  └──────────────────┬────────────────────────────────┘    │
│                     ↕                                      │
│  ┌─ Background Service Worker ───────────────────────┐   │
│  │  background.ts: TAB_CONTROL / PAGE_CONTROL 路由    │   │
│  └──────────────────┬────────────────────────────────┘   │
│                     ↕ chrome.runtime.sendMessage          │
│  ┌─ Content Script (Isolated World) ────────────────┐   │
│  │  content.ts                                       │   │
│  │  ┌ MultiPageAgent ────────────────────────────┐  │   │
│  │  │  → TabsController（管理多个标签页）         │  │   │
│  │  │  → RemotePageController（控制当前页DOM）    │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  │       ↕ postMessage                              │   │
│  └──────────────────┬────────────────────────────────┘   │
│                     ↕                                      │
│  ┌─ Main World (页面主世界) ──────────────────────┐     │
│  │  main-world.ts                                   │     │
│  │  → window.PAGE_AGENT_EXT = { execute, stop }     │     │
│  │                                                   │     │
│  │  PageController（核心，页面内运行）               │     │
│  │  → DOM遍历 → flatTree → 文本化 → 索引映射        │     │
│  │  → click / input / scroll / extract              │     │
│  └──────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

---

## 4. 魔改路线

### 4.1 总体原则

- **page-controller 包不动** — 它的 DOM 遍历和元素操作是核心，已经做得很完善
- **core/tools 包扩展** — 新增爬虫专用工具
- **extension/sidepanel 大改** — 拆分页面，新增爬虫模式 UI
- **extension/agent 改造** — MultiPageAgent 加翻页循环逻辑

### 4.2 阶段规划

| 阶段 | 做什么 | 改哪些文件 |
|------|--------|-----------|
| **P0** | 原版跑通，验证效果 | 不改代码，只构建+加载插件 |
| **P1** | Sidepanel 拆分视图（普通模式 / 爬虫模式切换） | `sidepanel/App.tsx` |
| **P2** | 新增爬虫工具：`extract_page_fields`、`paginate_next`、`export_csv` | `core/src/tools/index.ts`、`agent/tabTools.ts` |
| **P3** | MultiPageAgent 加翻页循环 + 数据累积逻辑 | `agent/MultiPageAgent.ts` |
| **P4** | Sidepanel 加步骤可视面板 `StepPanel` | 新增 `components/StepPanel.tsx` |
| **P5** | Sidepanel 加数据预览表格 `DataPreview` | 新增 `components/DataPreview.tsx` |
| **P6** | 爬虫专用系统 Prompt（告诉 LLM 爬虫模式行为规范） | `agent/system_prompt.md` |
| **P7** | 导出：CSV / Excel / 复制 | 已有 `export_csv` 工具，加格式选项 |

### 4.3 P2 新增工具详表

| 工具名 | 功能 | LLM 何时调用 |
|--------|------|-------------|
| `extract_page_fields` | 从当前页提取指定字段到数据累积区 | 每翻到新页面时 |
| `paginate` | 翻到上一页/下一页/指定页 | 提取完当前页数据后 |
| `list_pagination` | 分析当前页的分页器结构 | 首次进入列表页时 |
| `export_csv` | 将累积数据导出为 CSV 下载 | 所有页面提取完毕后 |
| `export_excel` | 将累积数据导出为 Excel 下载 | 用户指定 Excel 格式时 |
| `get_collected_data` | 查看当前已收集的数据概览（条数、字段） | LLM 自检进度时 |

### 4.4 P3 翻页循环逻辑

```
MultiPageAgent 新增 crawl() 方法:

1. 打开起始页
2. Agent Loop 分析页面结构，识别：
   - 数据区域（商品列表）
   - 分页器位置
   - 每页条数
3. 对每一页：
   a. 等待加载完成
   b. 调用 extract_page_fields 提取数据
   c. 数据累积到内存
   d. 调用 paginate 翻到下一页
   e. 检测是否到达最后一页（分页按钮 disabled / 无下一页链接）
4. 全部提取完毕 → 导出 CSV
```

---

## 5. 参考项目

- **alibaba/page-agent**：https://github.com/alibaba/page-agent
  - License: MIT — 可自由修改、分发、商用
  - 核心能力：AI 浏览器代理 + Chrome 插件 + MCP Server
  - 技术栈：TypeScript + WXT + React + Vite + Tailwind

---

## 6. 最终交付物

一个基于 page-agent 魔改的 Chrome 插件：

> AI 对话 → 编排爬取步骤 → 自动翻页提取 → 数据累计预览 → 一键导出 CSV/Excel
