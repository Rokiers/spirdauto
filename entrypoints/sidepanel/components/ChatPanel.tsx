import { useRef, useState } from "react";
import { loadConfig, runToolLoop, type ChatMessage } from "@/lib/llm";
import { BROWSER_TOOLS, executeBrowserTool } from "@/lib/tools/browser";
import { PAGE_TOOLS, PAGE_TOOL_NAMES, executePageTool } from "@/lib/tools/page";
import { pcCall } from "@/lib/pc";
import { saveFlow } from "@/lib/flow/store";
import type { Flow, Step, Locator, ExtractField } from "@/lib/flow/types";

const ALL_TOOLS = [...BROWSER_TOOLS, ...PAGE_TOOLS];

async function executeTool(name: string, argsJson: string): Promise<unknown> {
  if (PAGE_TOOL_NAMES.has(name)) return executePageTool(name, argsJson);
  return executeBrowserTool(name, argsJson);
}

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "你是爬虫录制助手。你的任务是分析页面结构和网络请求，构建可复用的采集方案，而不是执行采集循环本身。\n" +
    "\n" +
    "工作流程：\n" +
    "1. 用 get_page_elements / inspect_html 了解页面结构\n" +
    "2. 如果需要找数据接口：start_intercept → 滚动/操作触发请求 → stop_intercept → get_intercepted 查看请求列表\n" +
    "3. 构造采集方案：\n" +
    "   - 页面数据用 extract_list(itemSelector, fields)\n" +
    "   - 接口数据用 fetch_json(endpointUrl, responseMapper, ...)\n" +
    "4. 方案产出后调用 run_flow_test(flowJson) 验证数据是否正确，不对则调整\n" +
    "\n" +
    "关键规则：\n" +
    "- 数据必须通过 extract_list / fetch_json 收集，禁止直接读取文本罗列数值\n" +
    "- 一次只做一个动作，做完观察结果\n" +
    "- 遇到无限滚动列表：用 inspect_html 看结构 → 写 extract_list 试提取 → 确认选择器正确后告知用户\n" +
    "- 用中文简洁回答",
};

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function compactArgs(argsJson: string): string {
  if (!argsJson?.trim() || argsJson.trim() === "{}") return "";
  try {
    return JSON.stringify(JSON.parse(argsJson));
  } catch {
    return argsJson;
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const recordedRef = useRef<Step[]>([]);
  const recordingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function appendMsg(m: ChatMessage) {
    setMessages((prev) => [...prev, m]);
    scrollToBottom();
  }

  function recordStep(name: string, argsJson: string, result: unknown) {
    if (!recordingRef.current) return;
    let a: Record<string, unknown> = {};
    try {
      a = JSON.parse(argsJson || "{}");
    } catch {
      /* ignore */
    }
    const res = result as { locator?: Locator };
    let step: Step | null = null;
    if (name === "click_element" && res?.locator) {
      step = { type: "click", locator: res.locator, note: res.locator.text };
    } else if (name === "input_text" && res?.locator) {
      step = { type: "input", locator: res.locator, text: String(a.text ?? "") };
    } else if (name === "scroll") {
      step = {
        type: "scroll",
        down: a.down !== false,
        numPages: Number(a.numPages ?? 0.7),
      };
    } else if (name === "extract_list") {
      step = {
        type: "extract",
        itemSelector: String(a.itemSelector ?? ""),
        fields: Array.isArray(a.fields) ? (a.fields as ExtractField[]) : [],
      };
    } else if (name === "fetch_json") {
      step = {
        type: "fetchJson",
        endpointUrl: String(a.endpointUrl ?? ""),
        paramStart: Number(a.paramStart ?? 0),
        paramStep: Number(a.paramStep ?? 1),
        stopWhen: (a.stopWhen as "empty" | "error" | "noNew") ?? "empty",
        responseMapper: (a.responseMapper ?? {}) as Record<string, string>,
      } as Step;
    }
    if (step) {
      recordedRef.current.push(step);
      setRecordCount(recordedRef.current.length);
    }
  }

  function startRecording() {
    recordedRef.current = [];
    recordingRef.current = true;
    setRecordCount(0);
    setRecording(true);
    setError("");
  }

  async function stopRecording() {
    recordingRef.current = false;
    setRecording(false);
    const steps = recordedRef.current;
    if (steps.length === 0) {
      setError("没有录到任何动作");
      return;
    }
    const hasData = steps.some((s) =>
      ["extract", "fetchJson", "scrollCollect", "paginate", "forEachPage"].includes(s.type),
    );
    if (!hasData) {
      setError("未录到数据采集步骤（extract/fetchJson/scollCollect 等），重播不会产出数据");
      return;
    }
    const name = window.prompt(`给这个流程起个名字（共 ${steps.length} 步）`, "");
    if (!name) return;

    let domain = "";
    let urlPattern = "";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const u = new URL(tab.url);
        domain = u.hostname;
        urlPattern = u.origin + u.pathname;
      }
    } catch {
      /* ignore */
    }

    const flow: Flow = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      match: { domain, urlPattern },
      steps,
    };
    await saveFlow(flow);
    recordedRef.current = [];
    setRecordCount(0);
    setError("");
    window.alert(`已保存流程「${name}」（${steps.length} 步）`);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const config = await loadConfig();
    if (!config.apiKey || !config.model) {
      setError("请先到「设置」填写 API Key 并选择模型");
      return;
    }

    setError("");
    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);
    scrollToBottom();

    try {
      await pcCall("showMask").catch(() => {});
      await runToolLoop(config, [SYSTEM_PROMPT, ...history], {
        tools: ALL_TOOLS,
        execute: executeTool,
        maxSteps: recording ? 0 : 15,  // 录制时不限步数
        onStep: (step) => {
          if (step.kind === "assistant") {
            appendMsg(step.message);
          } else if (step.kind === "tool_result") {
            recordStep(
              step.call.function.name,
              step.call.function.arguments,
              step.result,
            );
            appendMsg({
              role: "tool",
              tool_call_id: step.call.id,
              name: step.call.function.name,
              content: JSON.stringify(step.result),
            });
          }
        },
      });
    } catch (e) {
      setError(`请求失败：${String(e)}`);
    } finally {
      await pcCall("hideMask").catch(() => {});
      setSending(false);
      scrollToBottom();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function renderMsg(m: ChatMessage, i: number) {
    if (m.role === "user") {
      return (
        <div key={i} className="msg user">
          {m.content}
        </div>
      );
    }
    if (m.role === "tool") {
      return (
        <div key={i} className="tool-result">
          ↳ {m.name} 结果：{truncate(m.content ?? "")}
        </div>
      );
    }
    // assistant
    return (
      <div key={i} className="assistant-turn">
        {m.content && <div className="msg assistant">{m.content}</div>}
        {m.tool_calls?.map((c) => (
          <div key={c.id} className="tool-step">
            🔧 {c.function.name}
            {compactArgs(c.function.arguments) && (
              <span className="tool-args">({compactArgs(c.function.arguments)})</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="chat">
      <div className="section-head">
        <h2>AI 对话</h2>
        <div className="chat-actions">
          {recording ? (
            <button className="recording" onClick={stopRecording}>
              ● 停止录制 ({recordCount})
            </button>
          ) : (
            <button onClick={startRecording}>录制流程</button>
          )}
          {messages.length > 0 && (
            <button onClick={() => setMessages([])}>清空</button>
          )}
        </div>
      </div>

      {recording && (
        <div className="rec-banner">
          录制中：AI 的点击/输入/滚动会被记录成流程，完成后点「停止录制」保存。
        </div>
      )}

      <div className="msg-list" ref={listRef}>
        {messages.length === 0 && (
          <p className="hint">
            试试「列出我打开的所有标签页」或「切换到某个标签页」。
          </p>
        )}
        {messages.map(renderMsg)}
        {sending && <div className="msg assistant thinking">执行中…</div>}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="send-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
          rows={2}
        />
        <button className="primary" onClick={send} disabled={sending}>
          发送
        </button>
      </div>
    </section>
  );
}
