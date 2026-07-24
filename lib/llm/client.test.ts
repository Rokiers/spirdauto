import { describe, it, expect } from "vitest";
import { trimHistory, type ChatMessage } from "./client";

describe("trimHistory", () => {
  it("strips assistant content but keeps tool_calls", () => {
    const msgs: ChatMessage[] = [
      { role: "assistant", content: "I will click the button", tool_calls: [{ id: "c1", type: "function", function: { name: "click", arguments: "{}" } }] },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content).toBeNull();
    expect(trimmed[0].tool_calls).toEqual(msgs[0].tool_calls);
  });

  it("keeps latest get_page_elements but replaces old ones", () => {
    const msgs: ChatMessage[] = [
      { role: "tool", name: "get_page_elements", content: "first snapshot", tool_call_id: "t1" },
      { role: "tool", name: "click_element", content: '{"ok":true}', tool_call_id: "t2" },
      { role: "tool", name: "get_page_elements", content: "latest snapshot", tool_call_id: "t3" },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content).toBe('"[已过期]"');
    expect(trimmed[1].content).toBe('{"ok":true}'); // non-big tool untouched
    expect(trimmed[2].content).toBe("latest snapshot");
  });

  it("replaces old inspect_html too", () => {
    const msgs: ChatMessage[] = [
      { role: "tool", name: "inspect_html", content: "html v1", tool_call_id: "t1" },
      { role: "tool", name: "inspect_html", content: "html v2", tool_call_id: "t2" },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content).toBe('"[已过期]"');
    expect(trimmed[1].content).toBe("html v2");
  });

  it("truncates large tool result", () => {
    const big = "x".repeat(13000);
    const msgs: ChatMessage[] = [
      { role: "tool", name: "extract_list", content: big, tool_call_id: "t1" },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content?.length).toBeLessThanOrEqual(12001);
    expect(trimmed[0].content).toContain("…");
  });

  it("does not truncate small tool result", () => {
    const msgs: ChatMessage[] = [
      { role: "tool", name: "extract_list", content: "small", tool_call_id: "t1" },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content).toBe("small");
  });

  it("preserves system and user messages untouched", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "you are a helpful assistant" },
      { role: "user", content: "hello" },
    ];
    const trimmed = trimHistory(msgs);
    expect(trimmed[0].content).toBe("you are a helpful assistant");
    expect(trimmed[1].content).toBe("hello");
  });
});
