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
