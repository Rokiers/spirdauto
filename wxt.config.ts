import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SpirdAuto',
    description: 'AI 驱动的电商数据爬取插件（骨架）',
    permissions: ['tabs', 'activeTab', 'scripting', 'storage', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: {},
  },
});
