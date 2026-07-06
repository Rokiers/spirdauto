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

  // ---------- 数据提取 ----------
  function simplifyHtml(root: Element, maxChars = 15000): string {
    const KEEP_ATTR = ["class", "id", "href", "src", "role", "aria-label", "data-testid"];
    const SKIP = new Set(["SCRIPT", "STYLE", "SVG", "NOSCRIPT", "PATH", "IFRAME", "CANVAS"]);
    let out = "";

    function walk(node: Node, depth: number) {
      if (out.length > maxChars || depth > 12) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? "").trim();
        if (t) out += " " + t.slice(0, 60);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (SKIP.has(el.tagName)) return;

      const tag = el.tagName.toLowerCase();
      let attrs = "";
      for (const a of KEEP_ATTR) {
        const v = el.getAttribute(a);
        if (v) attrs += ` ${a}="${v.slice(0, 80)}"`;
      }
      out += `\n${"  ".repeat(Math.min(depth, 8))}<${tag}${attrs}>`;
      for (const child of Array.from(el.childNodes)) walk(child, depth + 1);
    }

    walk(root, 0);
    return out.slice(0, maxChars);
  }

  interface FieldSpec {
    name: string;
    selector?: string;
    attr?: string;
  }

  function extractField(item: Element, f: FieldSpec): string {
    const target = f.selector ? item.querySelector(f.selector) : item;
    if (!target) return "";
    if (!f.attr || f.attr === "text") return (target.textContent ?? "").trim();
    if (f.attr === "href" || f.attr === "src") {
      return (target as HTMLElement).getAttribute(f.attr) ?? "";
    }
    return target.getAttribute(f.attr) ?? "";
  }

  function extractList(itemSelector: string, fields: FieldSpec[], maxRows = 2000) {
    let items: Element[] = [];
    try {
      items = Array.from(document.querySelectorAll(itemSelector));
    } catch {
      throw new Error(`itemSelector 非法: ${itemSelector}`);
    }
    const rows: Record<string, string>[] = [];
    for (const item of items.slice(0, maxRows)) {
      const row: Record<string, string> = {};
      for (const f of fields) row[f.name] = extractField(item, f);
      rows.push(row);
    }
    return { count: rows.length, sample: rows.slice(0, 3), rows };
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

        // ---------- 数据提取 ----------
        case "inspectHtml": {
          const sel = args?.selector as string | undefined;
          const root = sel
            ? (document.querySelector(sel) ?? document.body)
            : document.body;
          result = { html: simplifyHtml(root) };
          break;
        }
        case "extractList": {
          result = extractList(
            String(args?.itemSelector),
            (args?.fields ?? []) as FieldSpec[],
          );
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
