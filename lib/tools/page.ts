import type { ToolDef } from "@/lib/llm";
import { pcCall } from "@/lib/pc";

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
    default:
      throw new Error(`未知页面工具: ${name}`);
  }
}
