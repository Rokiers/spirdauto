import { useEffect, useState } from "react";
import {
  PROVIDERS,
  getProvider,
  loadConfig,
  saveConfig,
  listModels,
  type LLMConfig,
} from "@/lib/llm";

type Status = { kind: "ok" | "err" | "info"; msg: string } | null;

export function SettingsPanel() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      const provider = getProvider(c.providerId);
      const base = provider?.fallbackModels ?? [];
      setModels(c.model && !base.includes(c.model) ? [c.model, ...base] : base);
    });
  }, []);

  if (!config) return <p className="hint">加载配置中…</p>;

  function update(patch: Partial<LLMConfig>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function onProviderChange(providerId: string) {
    const provider = getProvider(providerId);
    setModels(provider?.fallbackModels ?? []);
    update({ providerId, model: "" });
    setStatus(null);
  }

  async function fetchModels() {
    if (!config) return;
    if (!config.apiKey.trim()) {
      setStatus({ kind: "err", msg: "请先填写 API Key" });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const list = await listModels(config);
      setModels(list);
      update({ model: list.includes(config.model) ? config.model : (list[0] ?? "") });
      setStatus({ kind: "ok", msg: `拉取到 ${list.length} 个模型` });
    } catch (e) {
      const provider = getProvider(config.providerId);
      setModels(provider?.fallbackModels ?? []);
      setStatus({ kind: "err", msg: `拉取失败，已使用内置列表：${String(e)}` });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!config) return;
    if (!config.model) {
      setStatus({ kind: "err", msg: "请先选择模型" });
      return;
    }
    await saveConfig(config);
    setStatus({ kind: "ok", msg: "已保存" });
  }

  const provider = getProvider(config.providerId);

  return (
    <section className="settings">
      <div className="section-head">
        <h2>模型设置</h2>
      </div>

      <div className="form">
        <label className="form-row">
          <span className="label">服务商</span>
          <select
            value={config.providerId}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-row">
          <span className="label">API Key</span>
          <input
            type="password"
            value={config.apiKey}
            placeholder="sk-..."
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </label>
        {provider && (
          <a className="hint link" href={provider.apiKeyUrl} target="_blank" rel="noreferrer">
            去 {provider.label} 申请 API Key ↗
          </a>
        )}

        <div className="form-row">
          <span className="label">模型</span>
          <div className="model-row">
            <select
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
            >
              {models.length === 0 && <option value="">（无）</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button onClick={fetchModels} disabled={loading}>
              {loading ? "拉取中…" : "拉取模型"}
            </button>
          </div>
        </div>

        <div className="send-row">
          <button className="primary" onClick={save}>
            保存
          </button>
        </div>

        {status && <div className={`status ${status.kind}`}>{status.msg}</div>}
      </div>
    </section>
  );
}
