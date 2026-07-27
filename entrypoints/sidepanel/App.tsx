import { useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { FlowPanel } from "./components/FlowPanel";
import { DataPanel } from "./components/DataPanel";

import HomeIcon from "./icons/home.svg?react";
import FlowIcon from "./icons/flow.svg?react";
import DataIcon from "./icons/data.svg?react";
import GearIcon from "./icons/gear.svg?react";

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
