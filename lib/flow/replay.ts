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
        if (step.type === "click") {
          await pcCall("replayClick", { locator: step.locator });
        } else if (step.type === "input") {
          await pcCall("replayInput", { locator: step.locator, text: step.text });
        } else if (step.type === "scroll") {
          await pcCall("replayScroll", { down: step.down, numPages: step.numPages });
        } else if (step.type === "extract") {
          const res = (await pcCall("extractList", {
            itemSelector: step.itemSelector,
            fields: step.fields,
          })) as { rows: DataRow[] };
          await appendRows(res.rows);
        }
      } catch (e) {
        handlers.onError?.(i, step, String(e));
        return { ok: false, failedAt: i };
      }
      await sleep(500);
    }
    return { ok: true };
  } finally {
    await pcCall("hideMask").catch(() => {});
  }
}
