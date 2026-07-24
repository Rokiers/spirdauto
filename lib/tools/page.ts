import type { ToolDef } from "@/lib/llm";
import { pcCall } from "@/lib/pc";
import { appendRows, loadDataset, clearDataset, type DataRow } from "@/lib/data/store";
import { Flow } from "@/lib/flow/types";
import { replayFlow } from "@/lib/flow/replay";

interface BrowserState {
  url: string;
  title: string;
  header: string;
  content: string;
  footer: string;
}

export const PAGE_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_page_elements",
      description:
        "读取当前活动标签页的可交互元素（每个元素带 [序号]）以及页面内容和滚动位置。" +
        "在执行任何 click_element / input_text 之前必须先调用它拿到最新序号；" +
        "页面发生变化（点击、输入、滚动、跳转）后需要重新调用，因为序号会重新编号。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: "按序号点击元素。序号来自最近一次 get_page_elements 的结果。",
      parameters: {
        type: "object",
        properties: { index: { type: "number", description: "元素序号" } },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "input_text",
      description: "按序号在输入框内输入文本。序号来自最近一次 get_page_elements。",
      parameters: {
        type: "object",
        properties: {
          index: { type: "number", description: "输入框序号" },
          text: { type: "string", description: "要输入的文本" },
        },
        required: ["index", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "垂直滚动当前页面。down=true 向下、false 向上；numPages 为滚动的页数（如 0.7）。",
      parameters: {
        type: "object",
        properties: {
          down: { type: "boolean" },
          numPages: { type: "number" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_by_selector",
      description:
        "用 CSS 选择器直接定位并点击元素（不依赖序号）。适合分页器按钮（如 [data-page=\"5\"]）、" +
        "或任何有稳定属性/class 的按钮。先用 inspect_html 找到正确的选择器。",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS 选择器，如 [data-page=\"5\"]" },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_html",
      description:
        "查看当前页面的简化 HTML 结构（保留标签、class、id、href、src），用于分析列表/卡片的结构以便编写提取选择器。" +
        "不传 selector 时返回整页；可传一个 CSS selector 聚焦到某区域再细看。这是观察工具，不会改变页面。",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "可选，聚焦查看的 CSS 选择器" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_list",
      description:
        "从当前页提取重复的列表数据并存入数据集。itemSelector 匹配每一条（如商品卡片）；" +
        "fields 定义每条要取的字段：name 为字段名，selector 为相对该条目的 CSS 选择器（省略则取条目本身），" +
        "attr 为取值方式（text 默认 / href / src / 其它属性名）。先用 inspect_html 看结构再调用。",
      parameters: {
        type: "object",
        properties: {
          itemSelector: { type: "string", description: "每条数据的 CSS 选择器" },
          fields: {
            type: "array",
            description: "字段定义列表",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                selector: { type: "string" },
                attr: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["itemSelector", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_intercept",
      description: "开启网络请求拦截，开始捕获页面的 fetch/XHR 请求。录制时用于发现数据接口。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_intercept",
      description: "停止网络请求拦截。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_intercepted",
      description:
        "查看拦截到的网络请求列表（去重后），含 URL、方法、状态码、响应大小和预览。" +
        "用于分析哪些请求是数据接口（JSON 响应、XHR 触发、分页参数等）。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_json",
      description:
        "按分页参数循环请求接口端点，用路径映射提取字段存入数据集。使用前先用 get_intercepted 分析接口。" +
        "endpointUrl 中用 $1 占位分页参数值；responseMapper 是 {字段名: json路径} 的映射。" +
        "stopWhen 为 empty(返回空停)/error(出错停)/noNew(无新数据停)。数据会自动入库。",
      parameters: {
        type: "object",
        properties: {
          endpointUrl: { type: "string", description: "接口 URL，$1 为分页参数占位符" },
          paramStart: { type: "number", description: "分页参数起始值" },
          paramStep: { type: "number", description: "分页参数步长" },
          stopWhen: { type: "string", description: "停止条件：empty/error/noNew" },
          maxPages: { type: "number", description: "安全上限（默认200）" },
          responseMapper: {
            type: "object",
            description: "{字段名: json路径}，如 {\"name\": \"data.items.0.name\"}",
          },
        },
        required: ["endpointUrl", "responseMapper"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_flow_test",
      description:
        "运行一个已构造的 Flow（JSON），返回结果样本用于自校验。教学阶段 AI 产出流程后调用此工具验证数据是否正确。",
      parameters: {
        type: "object",
        properties: {
          flowJson: { type: "string", description: "Flow 的 JSON 字符串" },
        },
        required: ["flowJson"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description:
        "所有任务已完成，结束采集。只有确认已提取全部所需数据后才调用。",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "简述完成了什么" },
        },
        required: ["summary"],
      },
    },
  },
];

export const PAGE_TOOL_NAMES = new Set(PAGE_TOOLS.map((t) => t.function.name));

export async function executePageTool(
  name: string,
  argsJson: string,
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  if (argsJson?.trim()) {
    try {
      args = JSON.parse(argsJson);
    } catch {
      throw new Error(`工具参数不是合法 JSON: ${argsJson}`);
    }
  }

  switch (name) {
    case "get_page_elements": {
      const s = (await pcCall("getBrowserState")) as BrowserState;
      return {
        url: s.url,
        title: s.title,
        header: s.header,
        elements: (s.content || "").slice(0, 8000),
        footer: s.footer,
      };
    }
    case "click_element": {
      if (typeof args.index !== "number") {
        throw new Error("click_element 需要数字类型的 index");
      }
      return await pcCall("click", { index: args.index });
    }
    case "input_text": {
      if (typeof args.index !== "number") {
        throw new Error("input_text 需要数字类型的 index");
      }
      return await pcCall("input", {
        index: args.index,
        text: String(args.text ?? ""),
      });
    }
    case "scroll": {
      return await pcCall("scroll", {
        down: args.down !== false,
        numPages: Number(args.numPages ?? 0.7),
      });
    }
    case "click_by_selector": {
      const res = await pcCall("clickBySelector", { selector: String(args.selector ?? "") });
      return res;
    }
    case "input_by_selector": {
      const res = await pcCall("inputBySelector", { selector: String(args.selector ?? ""), text: String(args.text ?? "") });
      return res;
    }
    case "inspect_html": {
      return await pcCall("inspectHtml", { selector: args.selector });
    }
    case "extract_list": {
      const res = (await pcCall("extractList", {
        itemSelector: String(args.itemSelector ?? ""),
        fields: args.fields ?? [],
      })) as { count: number; sample: DataRow[]; rows: DataRow[] };
      await appendRows(res.rows);
      return { count: res.count, sample: res.sample, saved: true };
    }
    case "start_intercept": {
      return await pcCall("startIntercept");
    }
    case "stop_intercept": {
      return await pcCall("stopIntercept");
    }
    case "get_intercepted": {
      return await pcCall("getIntercepted");
    }
    case "fetch_json": {
      const res = (await pcCall("fetchJson", {
        endpointUrl: String(args.endpointUrl ?? ""),
        paramStart: Number(args.paramStart ?? 0),
        paramStep: Number(args.paramStep ?? 1),
        stopWhen: String(args.stopWhen ?? "empty"),
        maxPages: Number(args.maxPages ?? 200),
        responseMapper: args.responseMapper ?? {},
      })) as { count: number; sample: DataRow[]; rows: DataRow[] };
      await appendRows(res.rows);
      return { count: res.count, sample: res.sample, saved: true };
    }
    case "run_flow_test": {
      let flow: Flow;
      try {
        const parsed = JSON.parse(String(args.flowJson ?? "{}"));
        flow = Flow.parse(parsed);
      } catch {
        return { error: "Flow JSON 格式不合法，请检查步骤结构" };
      }
      await clearDataset();
      const result = await replayFlow(flow, {
        onStep: () => {},
        onError: (i, s, e) => console.warn(`[run_flow_test] 步${i} ${s.type} 失败:`, e),
      });
      const rows = await loadDataset();
      return {
        ok: result.ok,
        failedAt: result.failedAt,
        totalRows: rows.length,
        sample: rows.slice(0, 5),
      };
    }
    case "done":
      return { done: true, summary: args.summary };
    default:
      throw new Error(`未知页面工具: ${name}`);
  }
}
