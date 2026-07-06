import { PcResponse } from "@/lib/messages";

export async function pcCall(
  method: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const raw = await chrome.runtime.sendMessage({ type: "PC_CALL", method, args });
  const res = PcResponse.parse(raw);
  if (!res.ok) throw new Error(res.error || "PageController 调用失败");
  return res.result;
}
