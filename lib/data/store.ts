export type DataRow = Record<string, string>;

const STORAGE_KEY = "spirdauto.dataset";

export async function loadDataset(): Promise<DataRow[]> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const rows = raw[STORAGE_KEY];
  return Array.isArray(rows) ? (rows as DataRow[]) : [];
}

export async function appendRows(rows: DataRow[]): Promise<void> {
  if (!rows || rows.length === 0) return;
  const existing = await loadDataset();
  await chrome.storage.local.set({ [STORAGE_KEY]: [...existing, ...rows] });
}

export async function clearDataset(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

export function columnsOf(rows: DataRow[]): string[] {
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!cols.includes(k)) cols.push(k);
    }
  }
  return cols;
}
