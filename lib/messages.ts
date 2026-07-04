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
]);
export type Request = z.infer<typeof Request>;

export const ListTabsResponse = z.object({ tabs: z.array(TabInfo) });
export type ListTabsResponse = z.infer<typeof ListTabsResponse>;

export const OkResponse = z.object({ ok: z.boolean() });
export type OkResponse = z.infer<typeof OkResponse>;

export const ErrorResponse = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;
