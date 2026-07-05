import { useEffect, useRef, useState } from "react";
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      if (c.apiKey.trim()) fetchModels(c);
    });
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) return <p className="hint">加载配置中…</p>;

  function update(patch: Partial<LLMConfig>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function fetchModels(cfg: LLMConfig) {
    if (!cfg.apiKey.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setStatus(null);
    try {
      const list = await listModels(
        { providerId: cfg.providerId, apiKey: cfg.apiKey },
        ctrl.signal,
      );
      setModels(list);
      setConfig((prev) =>
        prev
          ? { ...prev, model: list.includes(prev.model) ? prev.model : (list[0] ?? "") }
          : prev,
      );
      setStatus({ kind: "ok", msg: `已加载 ${list.length} 个模型` });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setModels([]);
      setConfig((prev) => (prev ? { ...prev, model: "" } : prev));
      setStatus({ kind: "err", msg: `加载模型失败：${String(e)}` });
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  function onProviderChange(providerId: string) {
    abortRef.current?.abort();
    setModels([]);
    setStatus(null);
    const next = { ...config!, providerId, model: "" };
    setConfig(next);
    if (next.apiKey.trim()) fetchModels(next);
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

  const modelPlaceholder = !config.apiKey.trim()
    ? "先填 API Key"
    : loading
      ? "加载模型中…"
      : "（无）";

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
            onBlur={() => fetchModels(config)}
          />
        </label>
        {provider && (
          <a className="hint link" href={provider.apiKeyUrl} target="_blank" rel="noreferrer">
            去 {provider.label} 申请 API Key ↗
          </a>
        )}

        <label className="form-row">
          <span className="label">模型</span>
          <select
            value={config.model}
            disabled={loading || models.length === 0}
            onChange={(e) => update({ model: e.target.value })}
          >
            {models.length === 0 && <option value="">{modelPlaceholder}</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

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

