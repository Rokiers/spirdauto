import { useEffect, useState } from "react";
import { loadFlows, deleteFlow } from "@/lib/flow/store";
import { replayFlow } from "@/lib/flow/replay";
import type { Flow } from "@/lib/flow/types";

export function FlowPanel() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [running, setRunning] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function refresh() {
    setFlows(await loadFlows());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function run(flow: Flow) {
    setError("");
    setStatus("");
    setRunning(flow.id);
    try {
      const res = await replayFlow(flow, {
        onStep: (i, s) => setStatus(`第 ${i + 1}/${flow.steps.length} 步：${s.type}`),
        onError: (i, _s, e) => setError(`第 ${i + 1} 步失败：${e}`),
      });
      if (res.ok) setStatus(`完成，共 ${flow.steps.length} 步`);
      else setStatus(`在第 ${(res.failedAt ?? 0) + 1} 步停止`);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning("");
    }
  }

  async function remove(flow: Flow) {
    if (!window.confirm(`删除流程「${flow.name}」？`)) return;
    await deleteFlow(flow.id);
    await refresh();
  }

  return (
    <section>
      <div className="section-head">
        <h2>流程</h2>
        <button onClick={refresh}>刷新</button>
      </div>

      {error && <div className="error">{error}</div>}
      {status && <div className="status info">{status}</div>}

      {flows.length === 0 && (
        <p className="hint">
          还没有流程。到「首页」AI 对话点「录制流程」，让 AI 操作一遍页面即可生成。
        </p>
      )}

      <ul className="flow-list">
        {flows.map((f) => (
          <li key={f.id} className="flow-item">
            <div className="flow-info">
              <div className="flow-name">{f.name}</div>
              <div className="flow-meta">
                {f.steps.length} 步 · {f.match.domain || "任意站点"}
              </div>
            </div>
            <div className="flow-actions">
              <button
                className="primary"
                disabled={running === f.id}
                onClick={() => run(f)}
              >
                {running === f.id ? "运行中…" : "运行"}
              </button>
              <button disabled={running === f.id} onClick={() => remove(f)}>
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
