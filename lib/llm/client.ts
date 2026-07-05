import { getProvider } from "./providers";
import type { LLMConfig } from "./config";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolExecutor = (
  name: string,
  argsJson: string,
) => Promise<unknown>;

export type ToolLoopStep =
  | { kind: "assistant"; message: ChatMessage }
  | { kind: "tool_call"; call: ToolCall }
  | { kind: "tool_result"; call: ToolCall; result: unknown };

export interface ToolLoopResult {
  messages: ChatMessage[];
  text: string;
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

async function postChat(
  config: LLMConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ChatMessage> {
  const baseURL = resolveBaseURL(config);
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ ...body, model: config.model, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const msg = data?.choices?.[0]?.message ?? {};
  return {
    role: "assistant",
    content: msg.content ?? null,
    tool_calls: msg.tool_calls,
  };
}

export async function runToolLoop(
  config: LLMConfig,
  messages: ChatMessage[],
  options: {
    tools: ToolDef[];
    execute: ToolExecutor;
    signal?: AbortSignal;
    maxSteps?: number;
    onStep?: (step: ToolLoopStep) => void;
  },
): Promise<ToolLoopResult> {
  const { tools, execute, signal, maxSteps = 5, onStep } = options;
  const history = [...messages];

  for (let step = 0; step < maxSteps; step++) {
    const assistant = await postChat(
      config,
      { messages: history, tools, tool_choice: "auto" },
      signal,
    );
    history.push(assistant);
    onStep?.({ kind: "assistant", message: assistant });

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      return { messages: history, text: assistant.content ?? "" };
    }

    for (const call of calls) {
      onStep?.({ kind: "tool_call", call });
      let result: unknown;
      try {
        result = await execute(call.function.name, call.function.arguments);
      } catch (e) {
        result = { error: String(e) };
      }
      onStep?.({ kind: "tool_result", call, result });
      history.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    messages: history,
    text: "（已达到最大工具调用步数，已停止）",
  };
}
