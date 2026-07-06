import { Request, type TabInfo } from '@/lib/messages';

export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[spirdauto] setPanelBehavior', err));

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const parsed = Request.safeParse(raw);
    if (!parsed.success) return false;
    const req = parsed.data;

    (async () => {
      try {
        if (req.type === 'LIST_TABS') {
          const tabs = await chrome.tabs.query({ currentWindow: true });
          const list: TabInfo[] = tabs.map((t) => ({
            id: t.id ?? -1,
            title: t.title ?? '(无标题)',
            url: t.url ?? '',
            active: !!t.active,
            favIconUrl: t.favIconUrl,
          }));
          sendResponse({ tabs: list });
          return;
        }

        if (req.type === 'SWITCH_TAB') {
          await chrome.tabs.update(req.tabId, { active: true });
          sendResponse({ ok: true });
          return;
        }

        if (req.type === 'GET_PAGE_INFO') {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ error: '未找到活动标签页' });
            return;
          }
          const info = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
          sendResponse(info);
          return;
        }

        if (req.type === 'PC_CALL') {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ ok: false, error: '未找到活动标签页' });
            return;
          }
          const res = await chrome.tabs.sendMessage(tab.id, {
            type: 'PC_CALL',
            method: req.method,
            args: req.args,
          });
          sendResponse(res);
          return;
        }
      } catch (err) {
        sendResponse({ error: String(err) });
      }
    })();

    return true;
  });
});
