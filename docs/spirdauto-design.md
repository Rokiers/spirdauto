# SpirdAuto 设计文档

> 一个 AI 驱动的 Chrome 浏览器数据爬取插件，结合 Python 本地服务实现自动化数据提取与 CSV 导出。

---

## 1. 项目目标

面向电商页面商品数据爬取，利用日常使用的 Chrome 浏览器（保留登录态与指纹）配合 AI 分析页面结构，通过可视化步骤编排实现半自动化数据采集，最终输出 CSV/Excel。

**核心场景：**
- 电商商品列表页翻页爬取（名称、价格、图片、链接）
- 多分类遍历
- 点击进入详情页获取规格信息
- 人机协作过 CF / 验证码
- Session 状态保持（登录、购物车等）

---

## 2. 架构总览

```
┌─ 你的日常 Chrome 浏览器 ──────────────────────────────────────┐
│  启动参数: --remote-debugging-port=9222                        │
│                                                                │
│  ┌─ 爬虫插件 ──────────────────────────────────────────────┐   │
│  │  DevTools Panel:                                        │   │
│  │  ┌──────────────────┬──────────────────────────────┐    │   │
│  │  │ AI 对话面板      │ 流程步骤列表 + 运行控制      │    │   │
│  │  │                  │                              │    │   │
│  │  │ 页面预览 /       │ ① 打开商品列表页            │    │   │
│  │  │ 字段选择映射     │ ② 循环翻页 + 提取           │    │   │
│  │  │                  │ ③ 保存到 CSV                │    │   │
│  │  └──────────────────┴──────────────────────────────┘    │   │
│  │                                                         │   │
│  │  Service Worker (WebSocket 长连接)                      │   │
│  │  Content Script (页面注入: 元素高亮 / 区域圈选)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│    WebSocket ──────────────────────────────┐                   │
│    CDP ────────────────────────────────────┤                   │
└────────────────────────────────────────────┼───────────────────┘
                                             │
┌─ Python 本地服务 ──────────────────────────┼───────────────────┐
│                                            │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────┴──────────┐       │
│  │  AI 引擎     │  │  流程引擎    │  │  CDP 控制器   │       │
│  │              │  │              │  │               │       │
│  │ • 页面结构   │  │ • 步骤编排   │  │ • 页面导航    │       │
│  │   分析       │  │ • 条件判断   │  │ • 点击/滚动   │       │
│  │ • 字段识别   │  │ • 循环控制   │  │ • 数据提取    │       │
│  │ • DOM 解析   │  │ • 异常处理   │  │ • 最小化运行  │       │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘       │
│         │                 │                                   │
│         └──────┬──────────┘                                   │
│                │                                              │
│  ┌─────────────┴──────────────────────────────────────────┐   │
│  │  数据管线                                              │   │
│  │  • 字段映射  • 数据去重  • 规格遍历  • CSV/Excel 导出  │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. 核心设计理念："步骤骨架 + AI 肌肉"

用户定义流程的**骨架**（到哪、干什么），AI 负责每步的**肌肉**（怎么识别、如何应对变化）。

| 层 | 职责 | 谁做 |
|----|------|------|
| 骨架层 | 定义步骤顺序、循环条件、分支逻辑 | 用户在步骤列表中编排 |
| 肌肉层 | 每步执行时分析页面、定位元素、处理动态内容 | AI 接收当前页 DOM + 步骤描述，实时解析 |

### 执行流程

```
步骤列表                                      运行时 Prompt 生成
─────────                                    ─────────────────────
① 打开商品列表页  ──→  "导航到 https://xxx"
② 循环翻页 + 提取 ──→  "当前页 DOM: <截取>，请从商品卡片中提取：
    ├ 等待加载          名称、价格、图片URL、链接。返回 JSON。"
    ├ 提取商品
    └ 点下一页
③ 保存 CSV                              ──→  收集所有数据 → 写入文件
```

---

## 4. 技术选型

| 组件 | 技术 | 原因 |
|------|------|------|
| Chrome 插件 | Manifest V3 + DevTools Panel + Side Panel | 官方 API，UI 嵌入 DevTools，不受页面刷新影响 |
| 插件-后端通信 | WebSocket | 实时双向，插件常驻 Service Worker 维持连接 |
| 浏览器自动化 | CDP (Chrome DevTools Protocol) | 不依赖鼠标，最小化窗口也能操作；直接控制日常浏览器 |
| Python 后端框架 | FastAPI + websockets | 轻量异步，适合长连接 |
| CDP 客户端 | `pychrome` 或直接 `websockets` 连 CDP | Python 生态成熟 |
| AI 引擎 | OpenAI API / 本地 LLM（如 Ollama） | 可选云端或本地，灵活部署 |
| DOM 分析 | Python BeautifulSoup + AI 辅助 | 先用 AI 理解语义，再用代码精准提取 |
| 数据导出 | `openpyxl` / `csv` 标准库 | 简单可靠 |

---

## 5. Chrome 插件设计

### 5.1 面板布局

```
┌───────────────────────────────────────────────────────┐
│  [SpirdAuto]                              [_] [□] [×] │
├─────────┬──────────────────────┬───────────────────────┤
│ AI 对话 │  页面预览 + 字段映射 │  流程步骤列表         │
│         │                      │                       │
│ "分析这  │ ┌────────────────┐  │  ① 打开商品列表页    │
│  个页面  │ │                │  │  ② 循环：翻页+提取   │
│  的商品  │ │   页面截图 /    │  │    ├ 等待页面加载    │
│  列表"   │ │   元素高亮      │  │    ├ 提取当前页商品  │
│         │ │                │  │    └ 点击下一页      │
│ ──────── │ └────────────────┘  │  ③ 如有分类→循环分类 │
│ AI 回复  │                      │  ④ 保存到 CSV       │
│ "识别到  │ 提取字段：           │                       │
│  商品卡  │ ☑ 名称 .product-tl │  [▶ 运行] [⏸ 暂停]    │
│  片区域" │ ☑ 价格 .price      │  [+ 添加步骤]         │
│         │ ☐ 销量 .sales      │                       │
│         │ ☑ 图片 img.prod-img │                       │
│         │ ☑ 链接 a.card-link  │                       │
│         │                      │                       │
│ [发送]   │ [手动圈选] [AI重分析]│                       │
└─────────┴──────────────────────┴───────────────────────┘
```

### 5.2 步骤节点类型

| 节点类型 | 说明 | 配置项 |
|----------|------|--------|
| **打开页面** | 导航到指定 URL | URL、等待条件（选择器 / 时间） |
| **循环** | 重复执行子步骤直到条件满足 | 循环条件（翻页按钮消失 / 达到最大页数 / 数据重复） |
| **提取数据** | 从当前页提取指定字段 | 当前步骤的 Prompt 描述，AI 自动分析 |
| **点击元素** | 点击指定元素 | 元素描述（AI 定位）或手动圈选 |
| **条件分支** | 根据页面状态走不同路径 | 条件表达式（如"页面存在 .pagination"） |
| **等待** | 等待特定条件 | 等待时间 / 元素出现 / 网络空闲 |
| **子循环** | 遍历当前页的每个子项 | 如：遍历所有分类链接、遍历所有规格组合 |
| **保存数据** | 将累积数据输出为 CSV/Excel | 文件名、格式、字段排序 |
| **等待人工** | 暂停等待用户手动操作（过验证码等） | 提示文字 |

### 5.3 不受页面刷新影响

- 使用 **DevTools Panel**（非 popup），刷新页面不影响面板
- Service Worker 维持 WebSocket 连接
- 页面刷新后 AI 自动识别状态，从当前步骤恢复

---

## 6. Python 后端设计

### 6.1 模块划分

```
spirdauto/
├── server.py              # FastAPI 入口，WebSocket 端点
├── flow_engine/
│   ├── __init__.py
│   ├── engine.py          # 流程引擎核心：解析步骤列表 → 按序执行
│   ├── nodes.py           # 节点定义与执行器
│   └── context.py         # 运行上下文（URL、已提取数据、状态）
├── ai_engine/
│   ├── __init__.py
│   ├── analyzer.py        # 页面结构分析、字段识别
│   ├── prompt_builder.py  # 根据步骤 + DOM 生成 Prompt
│   └── client.py          # AI API 调用（OpenAI / Ollama）
├── cdp_controller/
│   ├── __init__.py
│   ├── browser.py         # CDP 连接管理
│   ├── page.py            # 页面操作（导航、点击、等待）
│   └── dom_tools.py       # DOM 获取、元素定位
├── data_pipeline/
│   ├── __init__.py
│   ├── collector.py       # 数据收集与去重
│   ├── mapper.py          # 字段映射标准化
│   └── exporter.py        # CSV / Excel 导出
└── requirements.txt
```

### 6.2 流程引擎工作流

```python
# 伪代码示意

class FlowEngine:
    def __init__(self, steps: List[Step], context: RunContext):
        self.steps = steps
        self.context = context
    
    async def run(self):
        for step in self.steps:
            if step.type == "navigate":
                await self.cdp.navigate(step.url)
                await self.cdp.wait_for(step.wait_condition)
            
            elif step.type == "loop":
                while True:
                    # 执行循环体子步骤
                    await self.run_substeps(step.children)
                    # 检查循环结束条件
                    if await self.check_condition(step.exit_condition):
                        break
            
            elif step.type == "extract":
                # 获取当前页 DOM
                dom = await self.cdp.get_dom()
                # 构建 Prompt 发给 AI
                prompt = self.ai.build_extraction_prompt(dom, step.fields)
                result = await self.ai.analyze(prompt)
                # 收集数据
                self.collector.add_batch(result)
            
            elif step.type == "click":
                # 用 AI 定位元素
                selector = await self.ai.find_element(
                    await self.cdp.get_dom(), step.element_desc
                )
                await self.cdp.click(selector)
            
            elif step.type == "wait_human":
                # 通知插件：等待用户手动操作
                await self.ws.send({"type": "wait_human", "message": step.hint})
                # 等待用户确认继续
                await self.context.wait_for_continue()
            
            elif step.type == "save":
                self.exporter.export(self.collector.data, step.filepath)
```

### 6.3 AI Prompt 传递链路

```
步骤描述: "提取当前页所有商品: 名称、价格、图片、链接"
          +
当前页 DOM 结构 (截取 body>main 内容，去除 script/style)
          ↓
       prompt_builder.py
          ↓
      构造 Prompt:
        "你是一个数据提取助手。请分析以下 HTML 片段，这是一个电商
         商品列表页。请从每个商品卡片中提取: 商品名称、当前价格、
         商品主图 URL、商品详情链接。
         返回 JSON 格式: [{name, price, image, link}, ...]
         
         HTML: <paste DOM here>"
          ↓
       AI 返回:
         [{"name": "机械键盘X1", "price": "299", "image": "https://...", "link": "https://..."}, ...]
          ↓
       存入 collector → 最终 CSV 导出
```

---

## 7. 启动方式

### 用户操作流程

1. **关闭所有 Chrome 窗口**

2. **启动 Python 服务**
   ```bash
   cd spirdauto
   python server.py --ai-backend openai
   ```

3. **用调试模式打开 Chrome**
   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```
   手动安装插件后即可开始使用。

4. **在 DevTools 中打开 SpirdAuto 面板** → 与 AI 对话 → 编排步骤 → 运行

---

## 8. 关键场景处理

### 8.1 过 CF / 验证码

- 流程引擎执行到页面时，AI 检测到验证码 → 步骤自动暂停
- 插件面板弹出提示："检测到人机验证，请手动完成"
- 用户切到浏览器主体窗口手动完成验证
- 点击"继续"按钮 → 流程恢复

### 8.2 分类切换

```
步骤编排:
 ① 打开店铺首页
 ② 提取当前页
 ③ AI 分析: "找到所有分类链接并返回"
 ④ 循环: 遍历每个分类
      ├ 点击分类
      ├ 等待页面加载
      └ 子循环: 翻页提取 (同翻页逻辑)
 ⑤ 保存 CSV
```

### 8.3 规格切换（点击进详情页）

```
翻页循环内:
  ②b 提取列表页数据 (AI 自动获取基本字段)
  ②c 子循环: 遍历当前页每个商品
        ├ 点击商品链接 (新标签页)
        ├ 等待详情页加载
        ├ AI 分析: "识别规格选项区域(颜色、容量等)"
        ├ 子子循环: 遍历规格组合
        │    ├ 选择规格 → 提取价格/库存
        │    └ 下一个组合
        ├ 关闭标签页
        └ 回到列表页
```

### 8.4 最小化运行

CDP 所有操作均不依赖鼠标位置，通过 DOM 级别操作实现。Chrome 最小化到任务栏也能正常翻页、提取。

---

## 9. 待定事项

- [ ] AI 后端选型：OpenAI API 还是本地 Ollama ？（OpenAI 更准，Ollama 免费离线）
- [ ] 插件打包方式：手动开发者模式加载 还是 打包 .crx ？
- [ ] 是否需要分页时自动滚动加载（Lazy Load / 无限滚动）的支持？
- [ ] 数据导出格式：仅 CSV 还是同时支持 Excel（多 Sheet / 带格式）？
- [ ] 是否需要多标签页并发爬取？

---

## 10. 实现优先级

| 阶段 | 内容 |
|------|------|
| **P0 核心** | Python CDP 连接 → 页面导航 → DOM 获取 → AI 字段提取 → CSV 导出 |
| **P1 插件 UI** | DevTools Panel → 步骤列表 → AI 对话 → 字段映射 → 元素圈选 |
| **P2 流程引擎** | 步骤节点执行 → 循环翻页 → 条件分支 → 子循环 |
| **P3 进阶** | 人工介入暂停 → 规格遍历 → 分类切换 → Dify 式可视化流程 |
| **P4 打磨** | 错误重试 → 数据去重 → Excel 多 Sheet → 多标签页并发 |
