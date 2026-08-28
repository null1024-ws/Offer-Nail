import { BrowserSessionMarkerStore, VaultSession } from '../src/vault/session';
import { VaultRepository } from '../src/vault/repository';
import { createBackgroundHandler } from '../src/runtime/background-handler';
import {
  isExtensionRequest,
  type ExtensionRequest,
} from '../src/runtime/protocol';
import type { ResumeData } from '../src/domain/resume';

export default defineBackground(() => {
  const repository = new VaultRepository();
  const vaultSession = new VaultSession<ResumeData>(
    new BrowserSessionMarkerStore(),
  );
  void vaultSession.initialize();

  const handle = createBackgroundHandler({
    session: vaultSession,
    repository,
    async getActiveTabId() {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) throw new Error('找不到当前标签页。');
      return tab.id;
    },
    async ensureScript(tabId) {
      try {
        await browser.tabs.sendMessage(tabId, { type: 'offerNail:ping' });
      } catch {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ['/content-scripts/content.js'],
        });
      }
    },
    async sendToTab(tabId, message) {
      return browser.tabs.sendMessage(tabId, message);
    },
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionRequest(message)) return;
    void handle(message as ExtensionRequest).then(sendResponse);
    return true;
  });
});
