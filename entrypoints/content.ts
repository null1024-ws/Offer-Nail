import { createContentHandler } from '../src/runtime/content-handler';
import { isExtensionRequest } from '../src/runtime/protocol';

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  main() {
    const globalStore = globalThis as { __offerNailContent?: boolean };
    if (globalStore.__offerNailContent) return;
    globalStore.__offerNailContent = true;
    const handle = createContentHandler(document);
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtensionRequest(message)) return;
      sendResponse(handle(message));
      return true;
    });
  },
});
