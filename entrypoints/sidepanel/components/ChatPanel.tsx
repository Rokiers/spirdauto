import { useRef, useState } from "react";
import { loadConfig, runToolLoop, type ChatMessage } from "@/lib/llm";
import { BROWSER_TOOLS, executeBrowserTool } from "@/lib/tools/browser";
import { PAGE_TOOLS, PAGE_TOOL_NAMES, executePageTool } from "@/lib/tools/page";
import { pcCall } from "@/lib/pc";

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
      await pcCall("showMask").catch(() => {});
      await runToolLoop(config, [SYSTEM_PROMPT, ...history], {
        tools: ALL_TOOLS,
        execute: executeTool,
        maxSteps: 15,
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
