export interface Provider {
  id: string;
  label: string;
  baseURL: string;
  apiKeyUrl: string;
  fallbackModels: string[];
}

export const PROVIDERS: Provider[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    fallbackModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    fallbackModels: [
      "kimi-k2-0711-preview",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
