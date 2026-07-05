import type { ToolDef } from "@/lib/llm";
import {
  ListTabsResponse,
  PageInfo,
  OkResponse,
  type Request,
} from "@/lib/messages";

export const BROWSER_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "list_tabs",
      description:
        "列出当前浏览器窗口的所有标签页，返回每个标签页的 id、标题、URL、是否为当前活动页。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_page",
      description:
        "获取当前活动标签页的内容信息：标题、URL 以及页面主要标题元素(h1/h2)。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "switch_tab",
      description:
        "切换到指定 id 的标签页并使其成为活动页。tabId 需从 list_tabs 的结果中获取。",
      parameters: {
        type: "object",
        properties: {
          tabId: { type: "number", description: "目标标签页的 id" },
        },
        required: ["tabId"],
      },
    },
  },
];

async function send(req: Request): Promise<unknown> {
  return chrome.runtime.sendMessage(req);
}

export async function executeBrowserTool(
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
    case "list_tabs": {
      const res = ListTabsResponse.parse(await send({ type: "LIST_TABS" }));
      return res.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        active: t.active,
      }));
    }
    case "get_current_page": {
      return PageInfo.parse(await send({ type: "GET_PAGE_INFO" }));
    }
    case "switch_tab": {
      const tabId = args.tabId;
      if (typeof tabId !== "number") {
        throw new Error("switch_tab 需要数字类型的 tabId");
      }
      const res = OkResponse.parse(await send({ type: "SWITCH_TAB", tabId }));
      return { ok: res.ok, tabId };
    }
    default:
      throw new Error(`未知工具: ${name}`);
  }
}
