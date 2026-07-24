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
    const path = cssPath(el);
    // 如果 css path 太泛（只剩一个标签名如 "div" 或 "span"），
    // 且元素有文本内容，改用文本策略定位
    const isVague = /^[a-z]+$/.test(path); // e.g. just "div" or "span"
    if (isVague && text) {
      return { strategy: "css", value: path, text };
    }
    return { strategy: "css", value: path, text };
  }

  function resolveLocator(loc: {
    strategy: string;
    value: string;
    text?: string;
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
      // 扩大到所有元素，不仅限 a/button/input
      const all = document.querySelectorAll("*");
      for (const n of all) {
        if ((n.textContent ?? "").trim() === loc.value) {
          return n as HTMLElement;
        }
      }
      // 宽松匹配：包含文本
      for (const n of all) {
        if ((n.textContent ?? "").trim().includes(loc.value)) {
          return n as HTMLElement;
        }
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
    let beforeEl = document.activeElement as Element;
    // 记录操作前被 focus 的元素作为兜底
    const cap = (e: Event) => {
      const t = e.target as Element;
      if (t && t.nodeType === 1 && !captured) captured = t;
    };
    types.forEach((t) => document.addEventListener(t, cap, true));
    return fn().then(
      (result) => {
        types.forEach((t) => document.removeEventListener(t, cap, true));
        // 兜底：如果没捕获到，用操作前的 activeElement
        const el = captured || beforeEl;
        return { result, element: el !== document.body ? el : null };
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

        // ---------- 按选择器点击 ----------
        case "clickBySelector": {
          const sel = String(args?.selector ?? "");
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) throw new Error(`未找到元素: ${sel}`);
          await animateCursorTo(el);
          await domClick(el);
          const loc = buildLocator(el);
          result = { success: true, message: `✅ Clicked ${sel}`, locator: loc, selector: sel };
          break;
        }
        case "inputBySelector": {
          const sel = String(args?.selector ?? "");
          const text = String(args?.text ?? "");
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) throw new Error(`未找到元素: ${sel}`);
          await animateCursorTo(el);
          await domInput(el, text);
          const loc = buildLocator(el);
          result = { success: true, message: `✅ Input ${sel}`, locator: loc, selector: sel };
          break;
        }

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

  // ---------- 网络拦截 ----------
  interface InterceptedRequest {
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody: string | null;
    responseStatus: number;
    responseHeaders: Record<string, string>;
    responseBody: string | null;
    timestamp: number;
  }

  let intercepted: InterceptedRequest[] = [];
  let intercepting = false;
  let _origFetch: typeof fetch | null = null;
  let _origXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  let _origXhrSend: typeof XMLHttpRequest.prototype.send | null = null;

  function startIntercept() {
    if (intercepting) return;
    intercepting = true;
    intercepted = [];

    _origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const [url, init] = args;
      const start = Date.now();
      let resp: Response;
      try {
        resp = await _origFetch!.apply(this, args as [RequestInfo | URL, RequestInit?]);
      } catch {
        intercepted.push({
          url: String(url),
          method: init?.method || "GET",
          requestHeaders: {},
          requestBody: null,
          responseStatus: 0,
          responseHeaders: {},
          responseBody: null,
          timestamp: Date.now() - start,
        });
        throw new Error("fetch intercepted error");
      }
      const clone = resp.clone();
      let body: string | null = null;
      try {
        body = await clone.text();
      } catch {
        /* ignore */
      }
      const hdr: Record<string, string> = {};
      resp.headers.forEach((v, k) => { hdr[k] = v; });
      intercepted.push({
        url: String(url),
        method: init?.method || "GET",
        requestHeaders: (init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init?.headers as Record<string, string>) || {}),
        requestBody: null,
        responseStatus: resp.status,
        responseHeaders: hdr,
        responseBody: body?.slice(0, 50000) ?? null,
        timestamp: Date.now() - start,
      });
      return resp;
    };

    _origXhrOpen = XMLHttpRequest.prototype.open;
    _origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async = true,
      user?: string | null,
      password?: string | null,
    ) {
      (this as any).__spird = { method, url: String(url), start: Date.now(), headers: {} };
      return _origXhrOpen!.call(this, method, url, async as boolean, user, password);
    };
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as any;
      const oldO = xhr.onreadystatechange;
      xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === 4) {
          let respBody: string | null = null;
          try { respBody = (xhr as XMLHttpRequest).responseText?.slice(0, 50000) ?? null; } catch { /* */ }
          const hdr: Record<string, string> = {};
          try {
            (xhr as XMLHttpRequest).getAllResponseHeaders()
              .split("\r\n")
              .forEach((l: string) => {
                const [k, v] = l.split(": ");
                if (k) hdr[k] = v || "";
              });
          } catch { /* */ }
          intercepted.push({
            url: xhr.__spird?.url || "",
            method: xhr.__spird?.method || "GET",
            requestHeaders: xhr.__spird?.headers || {},
            requestBody: body ? String(body).slice(0, 10000) : null,
            responseStatus: (xhr as XMLHttpRequest).status,
            responseHeaders: hdr,
            responseBody: respBody,
            timestamp: Date.now() - (xhr.__spird?.start || Date.now()),
          });
        }
      });
      if (oldO) xhr.onreadystatechange = oldO;
      return _origXhrSend!.call(this, body);
    };
  }

  function stopIntercept() {
    intercepting = false;
    if (_origFetch) { window.fetch = _origFetch; _origFetch = null; }
    if (_origXhrOpen) { XMLHttpRequest.prototype.open = _origXhrOpen; _origXhrOpen = null; }
    if (_origXhrSend) { XMLHttpRequest.prototype.send = _origXhrSend; _origXhrSend = null; }
  }

  function getIntercepted() {
    const deduped: InterceptedRequest[] = [];
    const seen = new Set<string>();
    for (const r of intercepted) {
      const key = r.url + r.method;
      if (!seen.has(key)) { seen.add(key); deduped.push(r); }
    }
    return deduped.map((r) => ({
      url: r.url,
      method: r.method,
      status: r.responseStatus,
      contentType: r.responseHeaders["content-type"] || "",
      bodyPreview: (r.responseBody || "").slice(0, 500),
      size: (r.responseBody || "").length,
      time: r.timestamp,
    }));
  }

  async function fetchJson(
    endpointUrl: string,
    paramStart: number,
    paramStep: number,
    stopWhen: string,
    maxPages: number,
    responseMapper: Record<string, string>,
  ) {
    const rows: Record<string, string>[] = [];
    let param = paramStart;
    const limit = maxPages > 0 ? maxPages : 200;
    for (let p = 0; p < limit; p++) {
      const url = endpointUrl.replace(/\$1/g, String(param));
      let res: Response;
      try {
        res = await window.fetch(url, { credentials: "include" });
      } catch {
        if (stopWhen === "error") break;
        throw new Error(`请求失败: ${url}`);
      }
      if (!res.ok) {
        if (stopWhen === "error") break;
        throw new Error(`HTTP ${res.status}: ${url}`);
      }
      const data = await res.json();
      const mapped = resolveJsonPaths(data, responseMapper);
      if (mapped.length === 0 && stopWhen === "empty") break;
      for (const row of mapped) rows.push(row);
      param += paramStep;
    }
    return { count: rows.length, sample: rows.slice(0, 3), rows };
  }

  function resolveJsonPaths(
    data: unknown,
    mapper: Record<string, string>,
  ): Record<string, string>[] {
    const arrayPath = Object.values(mapper)[0] || "";
    const prefix = arrayPath.replace(/\.[^.]+$/, "");
    let arr: unknown[] = [];
    if (prefix) {
      const parts = prefix.split(".");
      let node: any = data;
      for (const p of parts) {
        if (node == null) break;
        node = Array.isArray(node) ? node[0]?.[p] : node[p];
      }
      arr = Array.isArray(node) ? node : [];
    } else {
      arr = Array.isArray(data) ? data : [];
    }

    return arr.map((item: any) => {
      const row: Record<string, string> = {};
      for (const [fieldName, path] of Object.entries(mapper)) {
        const leaf = path.split(".").pop() || path;
        let value: any = item;
        const fieldPath = path.replace(prefix ? prefix + "." : "", "");
        for (const seg of fieldPath.split(".")) value = value?.[seg];
        row[fieldName] = value != null ? String(value) : "";
      }
      return row;
    });
  }

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

        // ---------- 网络拦截 ----------
        case "startIntercept":
          startIntercept();
          result = { ok: true };
          break;
        case "stopIntercept":
          stopIntercept();
          result = { ok: true };
          break;
        case "getIntercepted":
          result = { requests: getIntercepted() };
          break;
        case "fetchJson":
          result = await fetchJson(
            String(args?.endpointUrl),
            Number(args?.paramStart ?? 0),
            Number(args?.paramStep ?? 1),
            String(args?.stopWhen ?? "empty"),
            Number(args?.maxPages ?? 200),
            (args?.responseMapper ?? {}) as Record<string, string>,
          );
          break;
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
