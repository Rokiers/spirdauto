import { z } from 'zod';

export const TabInfo = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  active: z.boolean(),
  favIconUrl: z.string().optional(),
});
export type TabInfo = z.infer<typeof TabInfo>;

export const PageInfo = z.object({
  title: z.string(),
  url: z.string(),
  headings: z.array(z.string()),
});
export type PageInfo = z.infer<typeof PageInfo>;

export const Request = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LIST_TABS') }),
  z.object({ type: z.literal('SWITCH_TAB'), tabId: z.number() }),
  z.object({ type: z.literal('GET_PAGE_INFO') }),
  z.object({
    type: z.literal('PC_CALL'),
    method: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type Request = z.infer<typeof Request>;

export const PcResponse = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});
export type PcResponse = z.infer<typeof PcResponse>;

export const ListTabsResponse = z.object({ tabs: z.array(TabInfo) });
export type ListTabsResponse = z.infer<typeof ListTabsResponse>;

export const OkResponse = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof OkResponse>;

export const ErrorResponse = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;
