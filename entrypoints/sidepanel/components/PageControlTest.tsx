import { useState } from "react";
import { pcCall } from "@/lib/pc";

interface BrowserState {
  url: string;
  title: string;
  header: string;
  content: string;
  footer: string;
}

export function PageControlTest() {
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>页面控制（实验）</h2>
      </div>
      <div className="send-row" style={{ flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => run(async () => { await pcCall("showMask"); })}>
          显示光标
        </button>
        <button disabled={busy} onClick={() => run(async () => { await pcCall("hideMask"); })}>
          隐藏光标
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const s = (await pcCall("getBrowserState")) as BrowserState;
              setOut(s.content.slice(0, 4000));
            })
          }
        >
          读取页面元素
        </button>
        <button
          disabled={busy}
          onClick={() => run(async () => { await pcCall("scroll", { down: true, numPages: 0.7 }); })}
        >
          向下滚动
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {out && <pre className="pc-out">{out}</pre>}
    </section>
  );
}
