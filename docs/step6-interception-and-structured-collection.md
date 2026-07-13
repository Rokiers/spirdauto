# 步骤 6：接口引擎 + 结构化采集 + 抗大变长（规划）

> 目标：让爬虫在"教一次、重播多次"的前提下，做到和传统手写 Python 爬虫一样快——**按站点加载方式自动选策略、两套引擎覆盖所有数据来源、重播纯规则不调模型**。

---

## 1. 缘起与问题定位

### 1.1 当前限制
- `runToolLoop` 每步**全量保留历史**，`get_page_elements` 返回整页文本**没有截断**，长列表反复叠加 → 突破模型上下文上限 → 中断
- `maxSteps=15` 硬上限，无限滚动时容易用满
- AI 录制时可能**绕开 `extract_list`**（直接从页面文本读数据口头回答），导致 Flow 里没有 extract 步 → 重播无数据
- 所有操作都走"读全页文本 → 喂模型 → 决策"的贵路径

### 1.2 根治方案（四个联动）
| 问题 | 措施 |
|------|------|
| 超上下文 | `runToolLoop` 历史**只留最新页面快照**（旧 ones 替换为占位符） |
| 大页面 | `get_page_elements` 内容加**硬上限**（~8000 字符 / ~100 元素） |
| 录制绕过 extract | 录制模式系统提示要求"捕捉数据必须用 extract_list"；停止时**校验必须有 extract 步** |
| 重复"读→滚"低效 | **结构化采集原语**：滚动收集 / 分页 / 多页面遍历，**全程不重喂整列** |
| 接口站点绕开 DOM | 录制时**捕获数据 XHR**，重播直接拉 JSON |

---

## 2. 采集策略分类（按站点加载方式）

### 2.1 两个正交维度
- **数据来源**：DOM（渲染后 HTML）/ 接口 JSON（XHR fetch）/ 内嵌大 JSON（页面 `<script>` 里）
- **加载方式**：进入即全量 / 分页器 / 无限滚动 / 多静态页（点按钮换页）

### 2.2 站点类型 → 采集策略

| 站点类型 | 首选策略 | 上哪个引擎 | 重播速度 |
|---------|---------|----------|---------|
| 接口驱动（~5MB 全量/无限滚动 XHR） | **捕获数据接口 → 重播直接拉 JSON** | 接口引擎 | ⭐ 最快 |
| 进入即全量（纯 DOM） | 一次性 `extract`（CSS 选择器） | DOM 引擎 | 快 |
| 分页器（URL 模板 `?page=n`） | 优先 URL 模板，其次点"下一页" | DOM 引擎 | 快（URL 模板最快） |
| 无限滚动（无接口、纯 DOM 渲染） | `scrollCollect`：规则滚动 → 选择器提取 → 去重 → 直到不再增长 | DOM 引擎 | 中（每滚要等渲染） |
| 纯静态多页（点按钮/链接进不同页） | `forEachPage`：收 URL 列表或按选择器点按钮 | DOM 引擎 | 中 |

> 接口引擎是首选——如 items7 这类 XHR 无限滚动站点，接口引擎能直接跳过所有滚动直接用 JSON。

---

## 3. 接口引擎设计（本轮优先）

### 3.1 录制侧：monkey-patch 捕获数据请求
录制开始后，在**主世界**对 `window.fetch` 和 `XMLHttpRequest` 做 monkey-patch：
- 拦截所有网络请求 → 记录 `{url, method, headers, requestBody?}`
- 去重后展示给 AI，让它**识别**哪个/哪些是"加载数据的请求"
- 帮助 AI 分析请求结构：分页参数（`?page=1`、`offset=20`）、每页/每次的页大小
- **鉴权不录**（cookie/动态 token 是浏览器原生带的，接口重放也直接借浏览器）

### 3.2 录制期：AI 生成接口规则
AI 从捕获的请求中提取：
- `endpointUrl`：接口地址（参数化，如 `?page=$1` 或 `&offset=$1`）
- `paramName`：分页参数名
- `paramStart/paramStep`：起始值、步长
- `responseMapper`：响应 JSON → 数据行（`data.results.name` 这种路径 → 字段名）

### 3.3 重播侧：纯规则拉 JSON
Flow 里 `fetchJson` 步：按参数递增循环请求 → `responseMapper` 取值 → 直到返回空/报错/达到安全上限 → 入库。

### 3.4 Flow Step 定义
```
| { type:"fetchJson",
    endpointUrl: string,     // 含参数占位符，如 "...?page=$1"
    paramStart: number, paramStep: number,
    stopWhen: "empty" | "error" | "noNew",  // 停止条件
    maxPages?: number,
    responseMapper: { [fieldName]: "json.path" },
    dedupKey?: string,
  }
```

### 3.5 录制期 monkey-patch 涉及文件
- 主世界 `page-controller-world.ts`：新增 `startIntercept()` / `stopIntercept()` / `getIntercepted()` 方法
- `lib/tools/page.ts`：新增录制期工具 `start_intercept / stop_intercept / get_intercepted / fetch_json`
- Flow 类型新增 `fetchJson` 步；replay 新增对应处理
- 录制时系统提示教 AI：打开拦截 → 滚动触发请求 → 停止拦截 → 查看捕获结果 → 生成 `fetchJson` 规则

---

## 4. DOM 引擎设计（本轮配合，完善覆盖面）

### 4.1 scrollCollect（无限滚动 / 加载更多）
纯规则循环，**不调模型**：
1. 滚动（`scroll` 或点"加载更多"）
2. 等条目数增长（`waitItemsGrow`）
3. `document.querySelectorAll(itemSelector)` 提取
4. 按 `dedupKey` 去重
5. 直到 `noNewItems` 或 `selectorGone(加载更多按钮)`

```
| { type:"scrollCollect",
    itemSelector, fields:[{name, selector?, attr?}],
    dedupKey,
    trigger: { kind:"scroll", down:true, pages } | { kind:"click", locator },
    maxScrolls?: number,
    waitItemsGrow?: boolean,
  }
```

### 4.2 forEachPage（多静态页遍历）
- `{ kind:"urls", selector, attr:"href" }`：从列表页提取所有详情页链接 → 逐个 navigate → 每页 extract → 数据合并
- `{ kind:"click", itemLocator, key }`：在列表页逐个点回顾

```
| { type:"forEachPage",
    over: { kind:"urls", selector, attr } | { kind:"click", itemLocator, key },
    body: Step[],   // 每页要执行的步骤（extract 等）
  }
```

### 4.3 extract_list 增强
由用户在录制时**显式确认字段**（防止 AI 含糊），同时明确去重键。

---

## 5. AI 自动识别站点类型并生成策略（录制时）

### 5.1 录制入口
用户点「录制流程」→ 系统提示升级：
> 你是爬虫录制助手。请先判断目标网站属于哪种模式：
> 1. 接口驱动（XHR/JSON）：用 start_intercept 捕获请求 → 识别数据接口 → 生成 fetchJson 规则 *
> 2. 进入即全量：直接用 extract_list 提取 *
> 3. 分页器：判断 URL 可分页还是需点击下一页 → 选对应策略
> 4. 无限滚动（纯 DOM）：用 inspect_html 看结构 → 写 scrollCollect 规则 *
> 5. 多静态页：收链接/按钮 → forEachPage
> 强制规则：数据必须通过 extract_list 或 fetchJson 收集，禁止直接读取文本罗列数值。
> 每次只做一个动作，做完观察结果。用中文简洁回答。

### 5.2 选择器字段确认
AI 调用 `extract_list` 或 `fetchJson` 后，返回前几行样例 → 侧边栏**弹出确认框**（字段名、值），用户可改名/删除/重排字段。确认后字段固定进入 Flow。

---

## 6. 数据去重

所有采集策略共享一个去重机制：
- 录制时 AI 指定 `dedupKey`（如 `链接`、`名称+价格`、`商品ID`）
- 重播时每次提取结果进 collector，按 key 去重后再入库
- 同一 `dedupKey` 在不同策略间**跨批次通用**（scrollCollect 来回滚不会重复入库）

---

## 7. 实施顺序

### 阶段 1（本轮）：接口引擎
- 主世界 monkey-patch：`startIntercept/stopIntercept/getIntercepted`
- 新增工具：`start_intercept / stop_intercept / get_intercepted / fetch_json`
- Flow 新增 `fetchJson` 步 + replay + 录制
- 系统提示优先级：**接口引擎为第一选择**（识别到 XHR 就直接用）

### 阶段 2（本轮后半）：DOM 引擎做全
- `scrollCollect` 工具 + Flow 步 + 重播
- `forEachPage` 工具 + Flow 步 + 重播
- 现有 `extract` 增强（字段确认 + 去重键）
- 历史裁剪 + `get_page_elements` 硬上限（解决超上下文）
- 录制校验（必须有 extract/fetchJson 步）

### 阶段 3（后继）：接口引擎进阶
- JSON 响应路径自动推断（AI 辅助 + 规则兜底）
- 鉴权重放策略（非 cookie 的 token 刷新等）
- 内嵌大 JSON 识别（页面 `<script>` 标签）

---

## 8. 待定事项

- monkey-patch 的性能影响：录制期间拦截所有 `fetch` 有开销，需确保不拖慢页面
- 接口鉴权续期：接口引擎重播时若 token 过期（非 cookie 型），需自动刷新还是暂停提示？
- AI 识别的可靠性：monkey-patch 录下来的请求可能很多（广告/分析/静态资源），AI 识别"哪个是数据接口"的准确度需要验证
- 接口请求去重：同一页面刷新可能产生重复请求，需在捕获层去重
- 爬虫广场托管静态方案时间点

---

## 9. 开发环境请求捕获的查看方法

当前 F12（网页 DevTools）看不到插件内部的 LLM 请求，因为它们在 sidepanel 里执行：
- **侧边栏内部右键 → Inspect** 看侧边栏的 Network/Console
- `chrome://extensions/` → Service Worker 的 DevTools 看后台请求
- 网页 F12 仅看网页自身的 XHR（如滚动加载的 `load_data`）

---

## 10. 下一步

你审确认后，我切执行模式，按「实施顺序」的阶段 1 开始写代码：主世界 monkey-patch → 接口引擎工具 → `fetchJson` 步 → 录制支持。阶段 1 跑通后接阶段 2 (DOM 引擎做全)。
