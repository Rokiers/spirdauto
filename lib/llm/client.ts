import { getProvider } from "./providers";
import type { LLMConfig } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function resolveBaseURL(config: LLMConfig): string {
  const provider = getProvider(config.providerId);
  if (!provider) throw new Error(`未知 provider: ${config.providerId}`);
  return provider.baseURL.replace(/\/$/, "");
}

async function readError(res: Response): Promise<string> {
  let detail = "";
  try {
    const data = await res.json();
    detail = data?.error?.message ?? JSON.stringify(data);
  } catch {
    detail = await res.text().catch(() => "");
  }
  return `${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`;
}

export async function listModels(
  config: Pick<LLMConfig, "providerId" | "apiKey">,
  signal?: AbortSignal,
): Promise<string[]> {
  const baseURL = resolveBaseURL(config as LLMConfig);
  const res = await fetch(`${baseURL}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const ids: string[] = Array.isArray(data?.data)
    ? data.data.map((m: { id: string }) => m.id).filter(Boolean)
    : [];
  return ids.sort();
}

export async function chatCompletion(
  config: LLMConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const baseURL = resolveBaseURL(config);
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
