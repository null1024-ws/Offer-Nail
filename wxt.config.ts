import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Offer-Nail',
    description: '一次整理简历，安全复用到不同招聘表单。',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['https://api.deepseek.com/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://api.deepseek.com;",
    },
    action: {
      default_title: 'Offer-Nail',
    },
  },
  hooks: {
    'build:before'() {
      execFileSync(
        process.execPath,
        [join(root, 'scripts/copy-parser-assets.mjs')],
        {
          stdio: 'inherit',
          cwd: root,
        },
      );
    },
  },
});
