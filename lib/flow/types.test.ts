import { describe, it, expect } from "vitest";
import { Flow, Step } from "./types";

describe("Flow validation", () => {
  it("validates minimal flow", () => {
    const flow = {
      id: "abc",
      name: "test",
      createdAt: Date.now(),
      match: { domain: "example.com", urlPattern: "https://example.com" },
      steps: [],
    };
    expect(() => Flow.parse(flow)).not.toThrow();
  });

  it("validates click step", () => {
    const step = {
      type: "click",
      locator: { strategy: "css", value: "#btn" },
    };
    expect(() => Step.parse(step)).not.toThrow();
  });

  it("validates extract step", () => {
    const step = {
      type: "extract",
      itemSelector: ".product-card",
      fields: [
        { name: "title", selector: "h3", attr: "text" },
        { name: "link", attr: "href" },
      ],
    };
    expect(() => Step.parse(step)).not.toThrow();
  });

  it("validates fetchJson step", () => {
    const step = {
      type: "fetchJson",
      endpointUrl: "https://api.example.com/items?page=$1",
      responseMapper: { name: "data.name", price: "data.price" },
    };
    const parsed = Step.parse(step);
    expect(parsed.type).toBe("fetchJson");
    if (parsed.type === "fetchJson") {
      expect(parsed.paramStart).toBe(0);
      expect(parsed.paramStep).toBe(1);
      expect(parsed.stopWhen).toBe("empty");
    }
  });

  it("validates scrollCollect step with defaults", () => {
    const step = {
      type: "scrollCollect",
      itemSelector: ".item",
      fields: [{ name: "title" }],
    };
    const parsed = Step.parse(step);
    expect(parsed.type).toBe("scrollCollect");
    if (parsed.type === "scrollCollect") {
      expect(parsed.triggerPages).toBe(0.7);
      expect(parsed.maxScrolls).toBe(50);
      expect(parsed.waitMs).toBe(800);
    }
  });

  it("rejects invalid step type", () => {
    expect(() => Step.parse({ type: "unknown" })).toThrow();
  });

  it("rejects extract without itemSelector", () => {
    expect(() => Step.parse({ type: "extract", fields: [] })).toThrow();
  });

  it("validates paginate with urlTemplate", () => {
    const step = {
      type: "paginate",
      urlTemplate: "https://example.com?page=$1",
      itemSelector: ".card",
      fields: [{ name: "name" }],
    };
    expect(() => Step.parse(step)).not.toThrow();
  });

  it("validates forEachPage", () => {
    const step = {
      type: "forEachPage",
      urlSelector: "a.detail-link",
      urlAttr: "href",
      fields: [{ name: "desc" }],
      itemSelector: ".content",
    };
    expect(() => Step.parse(step)).not.toThrow();
  });
});
