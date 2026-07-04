import { useEffect, useState } from 'react';
import {
  ListTabsResponse,
  PageInfo,
  type TabInfo,
  type Request,
} from '@/lib/messages';

async function send(req: Request): Promise<unknown> {
  return chrome.runtime.sendMessage(req);
}

export function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [error, setError] = useState<string>('');

  async function refreshTabs() {
    setError('');
    try {
      const res = ListTabsResponse.parse(await send({ type: 'LIST_TABS' }));
      setTabs(res.tabs);
    } catch (e) {
      setError(`列出标签页失败: ${String(e)}`);
    }
  }

  async function switchTo(tabId: number) {
    setError('');
    await send({ type: 'SWITCH_TAB', tabId });
    await refreshTabs();
  }

  async function readPage() {
    setError('');
    try {
      const res = PageInfo.parse(await send({ type: 'GET_PAGE_INFO' }));
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
      <header className="header">
        <h1>SpirdAuto</h1>
        <span className="badge">骨架</span>
      </header>

      {error && <div className="error">{error}</div>}

      <section>
        <div className="section-head">
          <h2>当前窗口标签页</h2>
          <button onClick={refreshTabs}>刷新</button>
        </div>
        <ul className="tab-list">
          {tabs.map((t) => (
            <li key={t.id} className={t.active ? 'tab active' : 'tab'}>
              <button className="tab-btn" onClick={() => switchTo(t.id)} title={t.url}>
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
    </div>
  );
}
