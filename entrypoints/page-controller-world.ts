import { PageController } from "@page-agent/page-controller";

export default defineUnlistedScript(() => {
  const REQ = "SPIRD_PC_REQ";
  const RES = "SPIRD_PC_RES";

  const pc = new PageController({ enableMask: true });

  function reply(id: number, ok: boolean, payload: unknown) {
    window.postMessage(
      ok
        ? { channel: RES, id, ok: true, result: payload }
        : { channel: RES, id, ok: false, error: String(payload) },
      "*",
    );
  }

  window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.channel !== REQ) return;

    const { id, method, args } = data as {
      id: number;
      method: string;
      args?: Record<string, unknown>;
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
        case "click":
          result = await pc.clickElement(Number(args?.index));
          break;
        case "input":
          result = await pc.inputText(Number(args?.index), String(args?.text));
          break;
        case "scroll":
          result = await pc.scroll({
            down: args?.down !== false,
            numPages: Number(args?.numPages ?? 0.7),
            pixels: args?.pixels as number | undefined,
            index: args?.index as number | undefined,
          });
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
