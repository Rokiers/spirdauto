import { useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { FlowPanel } from "./components/FlowPanel";
import { DataPanel } from "./components/DataPanel";
import HomeIcon from "./icons/home.svg?react";
import FlowIcon from "./icons/flow.svg?react";
import DataIcon from "./icons/data.svg?react";
import GearIcon from "./icons/gear.svg?react";
import styles from "./App.module.css";

type TabKey = "home" | "flow" | "data" | "settings";

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [everSeen, setEverSeen] = useState(new Set<TabKey>(["home"]));

  function show(t: TabKey) {
    setActiveTab(t);
    setEverSeen((s) => new Set(s).add(t));
  }

  const btnCls = (t: TabKey) =>
    `${styles.tabbarBtn} ${activeTab === t ? styles.active : ""}`;

  return (
    <div className={styles.app}>
      <main className={styles.content}>
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

      <nav className={styles.tabbar}>
        <button className={btnCls("home")} onClick={() => show("home")}>
          <HomeIcon /><span>首页</span>
        </button>
        <button className={btnCls("flow")} onClick={() => show("flow")}>
          <FlowIcon /><span>流程</span>
        </button>
        <button className={btnCls("data")} onClick={() => show("data")}>
          <DataIcon /><span>数据</span>
        </button>
        <button className={btnCls("settings")} onClick={() => show("settings")}>
          <GearIcon /><span>设置</span>
        </button>
      </nav>
    </div>
  );
}
