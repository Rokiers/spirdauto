import { useRef, useState } from "react";
import { loadConfig, runToolLoop, type ChatMessage } from "@/lib/llm";
import { BROWSER_TOOLS, executeBrowserTool } from "@/lib/tools/browser";

const SYSTEM_PROMPT: ChatMessage = {
  role: "system",
  content:
    "你是浏览器助手，可调用工具查看和控制用户当前浏览器的标签页：" +
    "list_tabs 列出所有标签页，get_current_page 获取当前活动页的标题/URL/主要标题，" +
    "switch_tab 切换到指定标签页。切换前若不知道 tabId，先调用 list_tabs 获取。" +
    "用中文简洁回答。",
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
      await runToolLoop(config, [SYSTEM_PROMPT, ...history], {
        tools: BROWSER_TOOLS,
        execute: executeBrowserTool,
        onStep: (step) => {
          if (step.kind === "assistant") {
            appendMsg(step.message);
          } else if (step.kind === "tool_result") {
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
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}>清空</button>
        )}
      </div>

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
