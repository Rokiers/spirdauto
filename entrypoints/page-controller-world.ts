import {
  PageController,
  clickElement as domClick,
  inputTextElement as domInput,
  scrollVertically as domScroll,
} from "@page-agent/page-controller";

export default defineUnlistedScript(() => {
  const REQ = "SPIRD_PC_REQ";
  const RES = "SPIRD_PC_RES";

  const pc = new PageController({ enableMask: true });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function reply(id: number, ok: boolean, payload: unknown) {
    window.postMessage(
      ok
        ? { channel: RES, id, ok: true, result: payload }
        : { channel: RES, id, ok: false, error: String(payload) },
      "*",
    );
  }

  // ---------- 耐用 locator ----------
  function uniq(sel: string): boolean {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function escAttr(v: string): string {
    return v.replace(/(["\\])/g, "\\$1");
  }

  function cssPath(el: Element): string {
    if (el.id && uniq("#" + CSS.escape(el.id))) return "#" + CSS.escape(el.id);
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
      if (node.id && uniq("#" + CSS.escape(node.id))) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
      let sel = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node!.tagName,
        );
        if (sameTag.length > 1) {
          sel += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
      parts.unshift(sel);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function buildLocator(
    el: Element | null,
  ): { strategy: "css"; value: string; text?: string } | null {
    if (!el || el.nodeType !== 1) return null;
    const text = (el.textContent ?? "").trim().slice(0, 40);
    if (el.id && uniq("#" + CSS.escape(el.id))) {
      return { strategy: "css", value: "#" + CSS.escape(el.id), text };
    }
    for (const attr of ["data-testid", "data-test", "name", "aria-label"]) {
      const v = el.getAttribute?.(attr);
      if (v) {
        const sel = `${el.tagName.toLowerCase()}[${attr}="${escAttr(v)}"]`;
        if (uniq(sel)) return { strategy: "css", value: sel, text };
      }
    }
    return { strategy: "css", value: cssPath(el), text };
  }

  function resolveLocator(loc: {
    strategy: string;
    value: string;
  }): HTMLElement | null {
    if (!loc || !loc.value) return null;
    if (loc.strategy === "css") {
      try {
        return document.querySelector(loc.value) as HTMLElement | null;
      } catch {
        return null;
      }
    }
    if (loc.strategy === "text") {
      const all = document.querySelectorAll(
        'a,button,[role="button"],[role="link"],input',
      );
      for (const n of all) {
        if ((n.textContent ?? "").trim() === loc.value) return n as HTMLElement;
      }
    }
    return null;
  }

  // 记录动作时真正被操作的元素
  function withCapture<T>(
    types: string[],
    fn: () => Promise<T>,
  ): Promise<{ result: T; element: Element | null }> {
    let captured: Element | null = null;
    const cap = (e: Event) => {
      const t = e.target as Element;
      if (t && t.nodeType === 1 && !captured) captured = t;
    };
    types.forEach((t) => document.addEventListener(t, cap, true));
    return fn().then(
      (result) => {
        types.forEach((t) => document.removeEventListener(t, cap, true));
        return { result, element: captured };
      },
      (err) => {
        types.forEach((t) => document.removeEventListener(t, cap, true));
        throw err;
      },
    );
  }

  // 重播时让光标飞过去 + 点击波纹
  async function animateCursorTo(el: Element): Promise<void> {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    window.dispatchEvent(new CustomEvent("PageAgent::MovePointerTo", { detail: { x, y } }));
    await sleep(450);
    window.dispatchEvent(new Event("PageAgent::ClickPointer"));
    await sleep(120);
  }

  window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.channel !== REQ) return;

    const { id, method, args } = data as {
      id: number;
      method: string;
      args?: Record<string, any>;
    };

    try {
      let result: unknown;
      switch (method) {
        case "ping":
          result = { pong: true };
          break;
        case "getBrowserState":
          result = await pc.getBrowserState();
          break;
        case "showMask":
          await pc.showMask();
          result = { ok: true };
          break;
        case "hideMask":
          await pc.hideMask();
          result = { ok: true };
          break;
        case "click": {
          const { result: r, element } = await withCapture(
            ["pointerdown", "mousedown", "click"],
            () => pc.clickElement(Number(args?.index)),
          );
          result = { ...r, locator: buildLocator(element) };
          break;
        }
        case "input": {
          const { result: r, element } = await withCapture(
            ["focusin", "input", "pointerdown"],
            () => pc.inputText(Number(args?.index), String(args?.text)),
          );
          result = { ...r, locator: buildLocator(element) };
          break;
        }
        case "scroll":
          result = await pc.scroll({
            down: args?.down !== false,
            numPages: Number(args?.numPages ?? 0.7),
            pixels: args?.pixels,
            index: args?.index,
          });
          break;

        // ---------- 重播 ----------
        case "replayClick": {
          const el = resolveLocator(args?.locator);
          if (!el) throw new Error(`未找到元素: ${JSON.stringify(args?.locator)}`);
          await animateCursorTo(el);
          await domClick(el);
          result = { ok: true };
          break;
        }
        case "replayInput": {
          const el = resolveLocator(args?.locator);
          if (!el) throw new Error(`未找到元素: ${JSON.stringify(args?.locator)}`);
          await animateCursorTo(el);
          await domInput(el, String(args?.text ?? ""));
          result = { ok: true };
          break;
        }
        case "replayScroll": {
          const amount =
            Number(args?.numPages ?? 0.7) *
            window.innerHeight *
            (args?.down !== false ? 1 : -1);
          await domScroll(amount);
          result = { ok: true };
          break;
        }
        default:
          throw new Error(`未知方法: ${method}`);
      }
      reply(id, true, result);
    } catch (err) {
      reply(id, false, err);
    }
  });

  window.postMessage({ channel: RES, id: 0, ok: true, result: { ready: true } }, "*");
});
