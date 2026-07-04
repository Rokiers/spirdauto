# 步骤 3：搭建插件骨架 + 接入 AI

> 自建 WXT + React 插件骨架跑通，实现底部 Tab 导航、浏览器控制演示，并接入国内 LLM（DeepSeek / Kimi）对话能力。

---

## 1. 本步做了什么

在决定「基于 page-agent 魔改」之后，为了先把开发链路和 UI 形态跑通，这一步**从零搭建了自己的插件骨架**（page-agent 作为后续参考，clone 进来并已 gitignore），并完成了 AI 接口的抽象与接入。

成果概览：

- ✅ WXT + React 19 + Vite + zod 技术栈，`pnpm` 管理
- ✅ Sidepanel 侧边栏（不受页面刷新/切换影响）
- ✅ 后台 Service Worker + Content Script，演示「切换 tab / 读取页面 DOM」
- ✅ 底部 Tab 导航：首页 / 数据 / 设置
- ✅ AI 接口统一抽象 + 服务商下拉选择（DeepSeek、Kimi）
- ✅ 在线拉取模型列表（`GET /models`）+ 内置兜底
- ✅ 首页简单聊天框，端到端验证模型接通

---

## 2. 技术选型

| 组件 | 选择 | 说明 |
|------|------|------|
| 插件框架 | **WXT** 0.20 | 「插件界的 Nuxt」，底层就是 Vite，自动生成 manifest、热更新、约定式入口 |
| UI | **React 19** | 官方模块 `@wxt-dev/module-react` |
| 样式 | 纯 CSS / CSS 变量 | 不用 tailwind |
| 打包 | **Vite**（WXT 内置） | 无需额外配置 |
| 校验 | **zod** 4 | 消息协议 + LLM 配置校验 |
| 包管理 | pnpm | — |

---

## 3. 目录结构

```
spirdauto/
├── wxt.config.ts              # WXT 配置 + manifest 权限
├── tsconfig.json              # 继承 .wxt 生成配置 + jsx
├── lib/
│   ├── messages.ts            # zod 消息 schema（sidepanel↔background↔content）
│   └── llm/                   # ★ AI 接口抽象
│       ├── providers.ts       # 服务商预设注册表
│       ├── config.ts          # LLMConfig + chrome.storage 读写
│       ├── client.ts          # listModels() / chatCompletion()
│       └── index.ts
└── entrypoints/
    ├── background.ts          # Service Worker：tab 控制 + 消息转发
    ├── content.ts             # Content Script：读取页面 DOM
    └── sidepanel/
        ├── index.html / main.tsx
        ├── App.tsx            # 底部 Tab 导航 + 各页面
        ├── style.css          # 纯 CSS
        └── components/
            ├── ChatPanel.tsx      # 首页聊天框
            └── SettingsPanel.tsx  # 模型设置页
```

---

## 4. 插件骨架

### 4.1 三个入口

| 入口 | 职责 |
|------|------|
| `background.ts`（Service Worker） | 点图标打开侧边栏；处理 `LIST_TABS / SWITCH_TAB / GET_PAGE_INFO`；转发到 content script |
| `content.ts`（Content Script） | 注入页面，读取 `title / url / h1h2` 返回 |
| `sidepanel/`（React） | 侧边栏 UI，通过 `chrome.runtime.sendMessage` 与后台通信 |

权限：`tabs / activeTab / scripting / storage / sidePanel` + `host_permissions: <all_urls>`。

### 4.2 消息协议（zod）

`lib/messages.ts` 用 `z.discriminatedUnion` 定义请求类型，后台 `safeParse` 校验后处理，保证类型安全。

### 4.3 底部 Tab 导航

- **首页**：AI 对话 + 标签页列表 + 读取当前页
- **数据**：已收集数据预览（占位，后续接爬虫数据）
- **设置**：模型配置

Sidepanel 属于浏览器级 UI，页面刷新 / 切 tab 都不影响，正好满足需求。

> 说明：Chrome 侧边栏顶部「固定/关闭」那一行是浏览器原生 UI，扩展无法注入按钮，故所有自定义控件都放在下方内容区。

---

## 5. AI 接口接入

### 5.1 为什么只接 DeepSeek 和 Kimi

调研了四家国内服务商的 `GET {baseURL}/models` 在线拉取支持情况：

| 服务商 | baseURL | `/models` | 结论 |
|--------|---------|:--------:|------|
| **DeepSeek** | `https://api.deepseek.com` | ✅ | 接入 |
| **Kimi/Moonshot** | `https://api.moonshot.cn/v1` | ✅ | 接入 |
| Qwen/DashScope | `.../compatible-mode/v1` | ⚠️ 未确认 | 暂缓 |
| GLM/智谱 | `https://open.bigmodel.cn/api/paas/v4` | ❌ 无该接口 | 暂缓 |

四家都是 **OpenAI 兼容**的 `/chat/completions`（`Authorization: Bearer`），故用一套抽象即可。本步先接支持在线拉取模型的 DeepSeek 和 Kimi。

### 5.2 模块设计

- **`providers.ts`**：`Provider { id, label, baseURL, apiKeyUrl, fallbackModels }` 注册表
- **`config.ts`**：`LLMConfig { providerId, model, apiKey }`，存 `chrome.storage.local`（key `spirdauto.llm`，本地不同步）
- **`client.ts`**（纯函数，无 chrome 依赖，后续后台 Agent 可复用）：
  - `listModels(config)` → `GET {baseURL}/models`，解析 `data[].id`
  - `chatCompletion(config, messages)` → `POST {baseURL}/chat/completions`（非流式）

### 5.3 使用流程

```
设置页：选服务商 → 填 API Key → 点「拉取模型」
   ├─ 成功：填充模型下拉（顺带验证 key，401=key 错）
   └─ 失败：回退内置 fallbackModels，并提示
→ 选模型 → 保存

首页：AI 对话框发消息 → 读取配置 → chatCompletion → 显示回复
   （未配置时提示去设置填 key）
```

### 5.4 关于 CORS

LLM 请求从 sidepanel（扩展页）直接 `fetch`。MV3 扩展页带 `host_permissions` 时跨域请求不受网页 CORS 限制，故可直连这些 API。后续建议把 `<all_urls>` 收窄为具体 API 域名。

---

## 6. 常用命令

```bash
pnpm install      # 安装依赖（含 wxt prepare）
pnpm dev          # 开发模式，热更新，自动拉起带插件的 Chrome
pnpm build        # 构建到 .output/chrome-mv3/
pnpm compile      # tsc 类型检查
```

加载：`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选 `.output/chrome-mv3/`。

---

## 7. 下一步

- P1：首页拆分「普通模式 / 爬虫模式」
- P2：新增爬虫工具（`extract_page_fields` / `paginate` / `export_csv`）
- 视需要补接 Qwen / GLM（用「失败即兜底」策略）
- 对话改为流式输出（`stream: true`）
