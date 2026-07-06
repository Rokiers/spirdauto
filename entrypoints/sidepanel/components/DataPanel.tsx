import { useEffect, useState } from "react";
import { loadDataset, clearDataset, columnsOf, type DataRow } from "@/lib/data/store";
import { downloadCsv } from "@/lib/data/csv";

export function DataPanel() {
  const [rows, setRows] = useState<DataRow[]>([]);

  async function refresh() {
    setRows(await loadDataset());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function clear() {
    if (!window.confirm("清空已收集的数据？")) return;
    await clearDataset();
    await refresh();
  }

  const cols = columnsOf(rows);
  const preview = rows.slice(0, 200);

  return (
    <section className="data">
      <div className="section-head">
        <h2>已收集数据（{rows.length}）</h2>
        <div className="chat-actions">
          <button onClick={refresh}>刷新</button>
          <button disabled={rows.length === 0} onClick={() => downloadCsv(rows)}>
            导出 CSV
          </button>
          <button disabled={rows.length === 0} onClick={clear}>
            清空
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="hint">
          暂无数据。到「首页」让 AI 用 extract_list 提取，或运行含 extract 的流程后回到这里。
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} title={row[c]}>
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > preview.length && (
            <p className="hint">仅预览前 {preview.length} 行，导出为全部 {rows.length} 行。</p>
          )}
        </div>
      )}
    </section>
  );
}
