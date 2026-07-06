import { FlowList, type Flow } from "./types";

const STORAGE_KEY = "spirdauto.flows";

export async function loadFlows(): Promise<Flow[]> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = FlowList.safeParse(raw[STORAGE_KEY]);
  return parsed.success ? parsed.data : [];
}

export async function saveFlow(flow: Flow): Promise<void> {
  const flows = await loadFlows();
  const idx = flows.findIndex((f) => f.id === flow.id);
  if (idx >= 0) flows[idx] = flow;
  else flows.unshift(flow);
  await chrome.storage.local.set({ [STORAGE_KEY]: flows });
}

export async function deleteFlow(id: string): Promise<void> {
  const flows = (await loadFlows()).filter((f) => f.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: flows });
}
