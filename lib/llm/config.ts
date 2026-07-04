import { z } from "zod";
import { PROVIDERS } from "./providers";

export const LLMConfig = z.object({
  providerId: z.string(),
  model: z.string(),
  apiKey: z.string(),
});
export type LLMConfig = z.infer<typeof LLMConfig>;

const STORAGE_KEY = "spirdauto.llm";

export const DEFAULT_CONFIG: LLMConfig = {
  providerId: PROVIDERS[0].id,
  model: "",
  apiKey: "",
};

export async function loadConfig(): Promise<LLMConfig> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = LLMConfig.safeParse(raw[STORAGE_KEY]);
  return parsed.success ? parsed.data : DEFAULT_CONFIG;
}

export async function saveConfig(config: LLMConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}
