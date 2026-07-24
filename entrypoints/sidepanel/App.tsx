import { useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { FlowPanel } from "./components/FlowPanel";
import { DataPanel } from "./components/DataPanel";

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 0 1 3 3v6" />
    </svg>
  );
}

type TabKey = "home" | "flow" | "data" | "settings";

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [everSeen, setEverSeen] = useState(new Set<TabKey>(["home"]));

  function show(t: TabKey) {
    setActiveTab(t);
    setEverSeen((s) => new Set(s).add(t));
  }

  return (
    <div className="app">
      <main className="content">
        <div hidden={activeTab !== "home"}>
          {everSeen.has("home") && <ChatPanel />}
        </div>
        <div hidden={activeTab !== "flow"}>
          {everSeen.has("flow") && <FlowPanel />}
        </div>
        <div hidden={activeTab !== "data"}>
          {everSeen.has("data") && <DataPanel />}
        </div>
        <div hidden={activeTab !== "settings"}>
          {everSeen.has("settings") && <SettingsPanel />}
        </div>
      </main>

      <nav className="tabbar">
        <button className={activeTab === "home" ? "tabbar-btn active" : "tabbar-btn"} onClick={() => show("home")}>
          <HomeIcon /><span>首页</span>
        </button>
        <button className={activeTab === "flow" ? "tabbar-btn active" : "tabbar-btn"} onClick={() => show("flow")}>
          <FlowIcon /><span>流程</span>
        </button>
        <button className={activeTab === "data" ? "tabbar-btn active" : "tabbar-btn"} onClick={() => show("data")}>
          <DataIcon /><span>数据</span>
        </button>
        <button className={activeTab === "settings" ? "tabbar-btn active" : "tabbar-btn"} onClick={() => show("settings")}>
          <GearIcon /><span>设置</span>
        </button>
      </nav>
    </div>
  );
}
