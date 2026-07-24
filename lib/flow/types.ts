import { z } from "zod";

export const Locator = z.object({
  strategy: z.enum(["css", "text"]),
  value: z.string(),
  text: z.string().optional(),
});
export type Locator = z.infer<typeof Locator>;

export const ExtractField = z.object({
  name: z.string(),
  selector: z.string().optional(),
  attr: z.string().optional(),
});
export type ExtractField = z.infer<typeof ExtractField>;

export const Step = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), locator: Locator, note: z.string().optional() }),
  z.object({ type: z.literal("input"), locator: Locator, text: z.string() }),
  z.object({ type: z.literal("scroll"), down: z.boolean(), numPages: z.number() }),
  z.object({
    type: z.literal("extract"),
    itemSelector: z.string(),
    fields: z.array(ExtractField),
  }),
  z.object({
    type: z.literal("fetchJson"),
    endpointUrl: z.string(),
    paramStart: z.number().default(0),
    paramStep: z.number().default(1),
    stopWhen: z.enum(["empty", "error", "noNew"]).default("empty"),
    maxPages: z.number().default(200),
    responseMapper: z.record(z.string(), z.string()),
    dedupKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("scrollCollect"),
    itemSelector: z.string(),
    fields: z.array(ExtractField),
    dedupKey: z.string().optional(),
    triggerDown: z.boolean().default(true),
    triggerPages: z.number().default(0.7),
    maxScrolls: z.number().default(50),
    waitMs: z.number().default(800),
  }),
  z.object({
    type: z.literal("paginate"),
    urlTemplate: z.string().optional(),
    nextLocator: Locator.optional(),
    fields: z.array(ExtractField).optional(),
    itemSelector: z.string().optional(),
    maxPages: z.number().default(50),
    untilSelectorGone: z.string().optional(),
  }),
  z.object({
    type: z.literal("forEachPage"),
    urlSelector: z.string(),
    urlAttr: z.string().default("href"),
    fields: z.array(ExtractField),
    itemSelector: z.string(),
  }),
]);
export type Step = z.infer<typeof Step>;

export const Flow = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  match: z.object({ domain: z.string(), urlPattern: z.string() }),
  steps: z.array(Step),
});
export type Flow = z.infer<typeof Flow>;

export const FlowList = z.array(Flow);
export type FlowList = z.infer<typeof FlowList>;
