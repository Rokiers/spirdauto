import { defineConfig } from 'wxt';
import svgrPlugin from 'vite-plugin-svgr';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [svgrPlugin()],
  }),
  manifest: {
    name: 'SpirdAuto',
    description: 'AI 驱动的电商数据爬取插件（骨架）',
    permissions: ['tabs', 'activeTab', 'scripting', 'storage', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: {},
    web_accessible_resources: [
      {
        resources: ['page-controller-world.js', 'chunks/*', 'assets/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
