import type { PageInfo } from "@/lib/messages";
import { injectScript } from "wxt/utils/inject-script";

export default defineContentScript({
  matches: ["<all_urls>"],
  async main() {
    // 读取页面基础信息（旧工具）
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "GET_PAGE_INFO") return false;

      const headings = Array.from(document.querySelectorAll("h1, h2"))
        .map((h) => (h.textContent ?? "").trim())
        .filter(Boolean)
        .slice(0, 10);

      const info: PageInfo = {
        title: document.title,
        url: location.href,
        headings,
      };
      sendResponse(info);
      return true;
    });

    // 注入主世界的 PageController 脚本
    try {
      await injectScript("/page-controller-world.js", { keepInDom: true });
    } catch (err) {
      console.error("[spirdauto] 注入 page-controller 失败", err);
    }

    // 主世界 <-> 隔离世界 的调用桥接
    const REQ = "SPIRD_PC_REQ";
    const RES = "SPIRD_PC_RES";
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    let seq = 1;

    window.addEventListener("message", (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.channel !== RES || typeof d.id !== "number") return;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      d.ok ? p.resolve(d.result) : p.reject(new Error(d.error));
    });

    function callPageController(
      method: string,
      args?: Record<string, unknown>,
    ): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = seq++;
        pending.set(id, { resolve, reject });
        window.postMessage({ channel: REQ, id, method, args }, "*");
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error("PageController 调用超时"));
          }
        }, 15000);
      });
    }

    // sidepanel/background → 中继到主世界
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "PC_CALL") return false;
      callPageController(msg.method, msg.args)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    });
  },
});
