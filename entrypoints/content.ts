import type { PageInfo } from '@/lib/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== 'GET_PAGE_INFO') return false;

      const headings = Array.from(document.querySelectorAll('h1, h2'))
        .map((h) => (h.textContent ?? '').trim())
        .filter(Boolean)
        .slice(0, 10);

      const info: PageInfo = {
        title: document.title,
        url: location.href,
        headings,
      };
      sendResponse(info);
      return true;
    });
  },
});
