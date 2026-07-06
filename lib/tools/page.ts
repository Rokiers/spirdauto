import type { ToolDef } from "@/lib/llm";
import { pcCall } from "@/lib/pc";
import { appendRows, type DataRow } from "@/lib/data/store";

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
        elements: s.content,
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
    default:
      throw new Error(`未知页面工具: ${name}`);
  }
}
