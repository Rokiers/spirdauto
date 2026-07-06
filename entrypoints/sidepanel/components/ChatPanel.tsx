import { useRef, useState } from "react";
import { loadConfig, runToolLoop, type ChatMessage } from "@/lib/llm";
import { BROWSER_TOOLS, executeBrowserTool } from "@/lib/tools/browser";
import { PAGE_TOOLS, PAGE_TOOL_NAMES, executePageTool } from "@/lib/tools/page";
import { pcCall } from "@/lib/pc";
import { saveFlow } from "@/lib/flow/store";
import type { Flow, Step, Locator } from "@/lib/flow/types";

const ALL_TOOLS = [...BROWSER_TOOLS, ...PAGE_TOOLS];

async function executeTool(name: string, argsJson: string): Promise<unknown> {
  if (PAGE_TOOL_NAMES.has(name)) return executePageTool(name, argsJson);
  return executeBrowserTool(name, argsJson);
}

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "你是浏览器助手，可调用工具查看和控制用户当前浏览器。\n" +
    "标签页级：list_tabs 列出所有标签页，get_current_page 获取当前页标题/URL，switch_tab 切换标签页。\n" +
    "页面操作级：get_page_elements 读取当前页带[序号]的可交互元素，click_element 按序号点击，input_text 按序号输入，scroll 滚动。\n" +
    "重要规则：要操作页面时，先调用 get_page_elements 拿到最新序号，再用 click_element/input_text；" +
    "每次点击/输入/滚动/跳转后，页面会变、序号会重编，必须重新 get_page_elements 再继续。" +
    "一次只做一个动作，做完观察结果。用中文简洁回答。",
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
      setError("没有录到任何可重播的动作（点击/输入/滚动）");
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
        maxSteps: 15,
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
