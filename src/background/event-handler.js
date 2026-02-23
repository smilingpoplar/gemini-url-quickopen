import { loadConfig, saveConfig } from '../options/config-storage.js';
import { offscreenQueue } from './offscreen-queue.js';
import { openGeminiWithTab, openGeminiWithCurrentTab, sendQueryToPrerenderTab } from './gemini-client.js';
import { IS_CHROME } from './constants.js';

async function setupExtensionLifecycle() {
  browser.runtime.onInstalled.addListener(async () => {
    const config = await loadConfig();
    await saveConfig(config);
    await offscreenQueue.fill();
  });

  browser.runtime.onStartup.addListener(async () => {
    await offscreenQueue.fill();
  });
}

async function handleGeminiNavigation(details) {
  if (!IS_CHROME) return;
  if (details.frameId !== 0) return;
  if (!details.url?.startsWith('https://gemini.google.com')) return;

  let queryText;
  try {
    const url = new URL(details.url);
    queryText = url.searchParams.get('q');
  } catch {
    return;
  }

  if (!queryText) return;

  const triggerTabId = details.tabId;
  const prerender = await offscreenQueue.dequeue();
  const prerenderTabId = prerender?.tabId;

  if (typeof prerenderTabId !== 'number') return;
  if (triggerTabId === prerenderTabId) return;

  try {
    browser.tabs.remove(triggerTabId);
    await sendQueryToPrerenderTab(prerenderTabId, queryText);
  } catch (error) {
    console.error('处理 Gemini 导航失败:', error);
  }
}

function initEventListeners() {
  browser.action.onClicked.addListener(async (tab) => {
    await openGeminiWithTab(tab);
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'open-gemini') {
      await openGeminiWithCurrentTab();
    }
  });

  browser.webNavigation.onCommitted.addListener(handleGeminiNavigation);
}

export { setupExtensionLifecycle, initEventListeners };
