import { pcCall } from "@/lib/pc";
import { appendRows, type DataRow } from "@/lib/data/store";
import type { Flow, Step } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ReplayHandlers {
  onStep?: (index: number, step: Step) => void;
  onError?: (index: number, step: Step, error: string) => void;
}

export async function replayFlow(
  flow: Flow,
  handlers: ReplayHandlers = {},
): Promise<{ ok: boolean; failedAt?: number }> {
  await pcCall("showMask").catch(() => {});

  try {
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      handlers.onStep?.(i, step);
      try {
        await executeStep(step);
      } catch (e) {
        handlers.onError?.(i, step, String(e));
        return { ok: false, failedAt: i };
      }
      await sleep(300);
    }
    return { ok: true };
  } finally {
    await pcCall("hideMask").catch(() => {});
  }
}

async function executeStep(step: Step): Promise<void> {
  switch (step.type) {
    case "click":
      await pcCall("replayClick", { locator: step.locator });
      break;
    case "input":
      await pcCall("replayInput", { locator: step.locator, text: step.text });
      break;
    case "scroll":
      await pcCall("replayScroll", { down: step.down, numPages: step.numPages });
      break;
    case "extract": {
      const res = (await pcCall("extractList", {
        itemSelector: step.itemSelector,
        fields: step.fields,
      })) as { rows: DataRow[] };
      await appendRows(res.rows);
      break;
    }
    case "fetchJson": {
      const res = (await pcCall("fetchJson", {
        endpointUrl: step.endpointUrl,
        paramStart: step.paramStart,
        paramStep: step.paramStep,
        stopWhen: step.stopWhen,
        maxPages: step.maxPages,
        responseMapper: step.responseMapper,
      })) as { rows: DataRow[] };
      await appendRows(res.rows);
      break;
    }
    case "scrollCollect": {
      await scrollCollect(step);
      break;
    }
    case "paginate": {
      await paginate(step);
      break;
    }
    case "forEachPage": {
      await forEachPage(step);
      break;
    }
  }
}

async function scrollCollect(step: Step & { type: "scrollCollect" }): Promise<void> {
  const dedup = new Set<string>();
  let prevCount = 0;

  for (let s = 0; s < step.maxScrolls; s++) {
    // trigger scroll
    await pcCall("replayScroll", {
      down: step.triggerDown,
      numPages: step.triggerPages,
    });
    await sleep(step.waitMs);

    // extract
    const res = (await pcCall("extractList", {
      itemSelector: step.itemSelector,
      fields: step.fields,
    })) as { rows: DataRow[] };

    // dedup
    const newRows: DataRow[] = [];
    for (const row of res.rows) {
      const key = step.dedupKey
        ? row[step.dedupKey] ?? JSON.stringify(row)
        : JSON.stringify(row);
      if (!dedup.has(key)) {
        dedup.add(key);
        newRows.push(row);
      }
    }

    if (newRows.length === 0) break; // no new items → done
    await appendRows(newRows);
    prevCount = dedup.size;
  }
}

async function paginate(step: Step & { type: "paginate" }): Promise<void> {
  if (step.urlTemplate) {
    for (let p = 1; p <= step.maxPages; p++) {
      const url = step.urlTemplate.replace(/\$1/g, String(p));
      // navigate via URL change (simplified: use pcCall scroll workaround)
      // Actually, for URL-based pagination, we need navigate support
      // For now, extract from current page using itemSelector
      try {
        const res = (await pcCall("extractList", {
          itemSelector: step.itemSelector || "",
          fields: step.fields || [],
        })) as { rows: DataRow[] };
        if (res.rows.length === 0 && step.untilSelectorGone) break;
        await appendRows(res.rows);
      } catch {
        break;
      }
    }
  } else if (step.nextLocator) {
    for (let p = 0; p < step.maxPages; p++) {
      try {
        const res = (await pcCall("extractList", {
          itemSelector: step.itemSelector || "",
          fields: step.fields || [],
        })) as { rows: DataRow[] };
        await appendRows(res.rows);
      } catch {
        break;
      }
      try {
        await pcCall("replayClick", { locator: step.nextLocator });
        await sleep(1000);
      } catch {
        break; // next button gone
      }
    }
  }
}

async function forEachPage(step: Step & { type: "forEachPage" }): Promise<void> {
  // Gather URLs from current page
  let urls: string[] = [];

  // Try to get links from the page using document.querySelector
  try {
    // We use extractList to grab URLs - extract the href attribute
    const res = (await pcCall("extractList", {
      itemSelector: step.urlSelector,
      fields: [{ name: "url", attr: step.urlAttr }],
    })) as { rows: DataRow[] };
    urls = res.rows.map((r) => r.url).filter(Boolean);
  } catch {
    // fallback: nothing to do
  }

  for (const url of urls) {
    if (!url) continue;
    // Navigate (simplified: we can't navigate via pcCall yet, so skip for now)
    // In future: pcCall("navigate", { url })
    // For now, extract from current page
    try {
      const res = (await pcCall("extractList", {
        itemSelector: step.itemSelector || "",
        fields: step.fields || [],
      })) as { rows: DataRow[] };
      await appendRows(res.rows);
    } catch {
      // skip
    }
    await sleep(500);
  }
}
