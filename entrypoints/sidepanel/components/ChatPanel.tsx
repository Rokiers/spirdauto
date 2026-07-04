import { useRef, useState } from "react";
import { loadConfig, chatCompletion, type ChatMessage } from "@/lib/llm";

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

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const config = await loadConfig();
    if (!config.apiKey || !config.model) {
      setError("请先到「设置」填写 API Key 并选择模型");
      return;
    }

    setError("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    scrollToBottom();

    try {
      const reply = await chatCompletion(config, next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(`请求失败：${String(e)}`);
      setMessages(next);
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
          <p className="hint">发一句话试试，验证模型是否接通。</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="msg assistant thinking">思考中…</div>}
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
