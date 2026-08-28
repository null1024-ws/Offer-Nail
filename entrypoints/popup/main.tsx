import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from '../../src/ui/popup/PopupApp';
import type {
  ExtensionRequest,
  ExtensionResponse,
} from '../../src/runtime/protocol';
import './style.css';

async function sendMessage(
  request: ExtensionRequest,
): Promise<ExtensionResponse> {
  return browser.runtime.sendMessage(request);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp
      sendMessage={sendMessage}
      openOptions={() => void browser.runtime.openOptionsPage()}
    />
  </React.StrictMode>,
);
