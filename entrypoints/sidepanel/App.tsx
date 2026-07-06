import { useEffect, useState } from "react";
import {
  ListTabsResponse,
  PageInfo,
  type TabInfo,
  type Request,
} from "@/lib/messages";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { PageControlTest } from "./components/PageControlTest";
import { FlowPanel } from "./components/FlowPanel";
import { DataPanel } from "./components/DataPanel";

async function send(req: Request): Promise<unknown> {
  return chrome.runtime.sendMessage(req);
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 0 1 3 3v6" />
    </svg>
  );
}

type TabKey = "home" | "flow" | "data" | "settings";

export function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  async function refreshTabs() {
    setError("");
    try {
      const res = ListTabsResponse.parse(await send({ type: "LIST_TABS" }));
      setTabs(res.tabs);
    } catch (e) {
      setError(`列出标签页失败: ${String(e)}`);
    }
  }

  async function switchTo(tabId: number) {
    setError("");
    await send({ type: "SWITCH_TAB", tabId });
    await refreshTabs();
  }

  async function readPage() {
    setError("");
    try {
      const res = PageInfo.parse(await send({ type: "GET_PAGE_INFO" }));
      setPage(res);
    } catch (e) {
      setError(`读取页面失败: ${String(e)}（该页面可能不允许注入脚本）`);
      setPage(null);
    }
  }

  useEffect(() => {
    refreshTabs();
  }, []);

  return (
    <div className="app">
      <main className="content">
        {error && <div className="error">{error}</div>}

        {activeTab === "home" && (
          <>
            <ChatPanel />

            <PageControlTest />

            <section>
              <div className="section-head">
                <h2>当前窗口标签页</h2>
                <button onClick={refreshTabs}>刷新</button>
              </div>
              <ul className="tab-list">
                {tabs.map((t) => (
                  <li key={t.id} className={t.active ? "tab active" : "tab"}>
                    <button
                      className="tab-btn"
                      onClick={() => switchTo(t.id)}
                      title={t.url}
                    >
                      {t.favIconUrl ? (
                        <img className="favicon" src={t.favIconUrl} alt="" />
                      ) : (
                        <span className="favicon placeholder" />
                      )}
                      <span className="tab-title">{t.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="section-head">
                <h2>读取当前页面</h2>
                <button onClick={readPage}>读取</button>
              </div>
              {page && (
                <div className="page-info">
                  <div className="row">
                    <span className="label">标题</span>
                    <span>{page.title}</span>
                  </div>
                  <div className="row">
                    <span className="label">URL</span>
                    <span className="url">{page.url}</span>
                  </div>
                  {page.headings.length > 0 && (
                    <div className="row">
                      <span className="label">标题元素</span>
                      <ul className="headings">
                        {page.headings.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "flow" && <FlowPanel />}

        {activeTab === "data" && <DataPanel />}

        {activeTab === "settings" && <SettingsPanel />}
      </main>

      <nav className="tabbar">
        <button
          className={activeTab === "home" ? "tabbar-btn active" : "tabbar-btn"}
          onClick={() => setActiveTab("home")}
        >
          <HomeIcon />
          <span>首页</span>
        </button>
        <button
          className={activeTab === "flow" ? "tabbar-btn active" : "tabbar-btn"}
          onClick={() => setActiveTab("flow")}
        >
          <FlowIcon />
          <span>流程</span>
        </button>
        <button
          className={activeTab === "data" ? "tabbar-btn active" : "tabbar-btn"}
          onClick={() => setActiveTab("data")}
        >
          <DataIcon />
          <span>数据</span>
        </button>
        <button
          className={
            activeTab === "settings" ? "tabbar-btn active" : "tabbar-btn"
          }
          onClick={() => setActiveTab("settings")}
        >
          <GearIcon />
          <span>设置</span>
        </button>
      </nav>
    </div>
  );
}
