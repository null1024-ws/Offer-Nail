import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Offer-Nail',
    description: '一次整理简历，安全复用到不同招聘表单。',
    permissions: ['activeTab', 'scripting', 'storage'],
    action: {
      default_title: 'Offer-Nail',
    },
  },
});
