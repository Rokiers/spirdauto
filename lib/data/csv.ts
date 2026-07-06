import { columnsOf, type DataRow } from "./store";

function escapeCell(value: string): string {
  const v = value ?? "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function rowsToCsv(rows: DataRow[]): string {
  const cols = columnsOf(rows);
  const header = cols.map(escapeCell).join(",");
  const lines = rows.map((row) => cols.map((c) => escapeCell(row[c] ?? "")).join(","));
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(rows: DataRow[], filename = "spirdauto.csv"): void {
  const csv = "\uFEFF" + rowsToCsv(rows); // BOM 兼容 Excel 中文
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
