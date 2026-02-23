import { DEFAULT_PROMPT } from './constants.js';
import { findMatchingGroup } from './url-pattern.js';
import { loadConfig, saveConfig } from './options/config-storage.js';

const IS_CHROME = browser.runtime.getURL('').startsWith('chrome-extension://');

const GEMINI_URL = 'https://gemini.google.com/app';
const STORAGE_KEY_TAB = 'prerenderTabId';
const STORAGE_KEY_WINDOW = 'prerenderWindowId';

// 使用内存变量 + storage 双保险，防止 service worker 重启时的竞态条件
let isCreatingInProgress = false;
let cachedPrerenderIds = { tabId: null, windowId: null };

async function getPrerenderIds() {
  // 优先使用缓存（内存操作，无竞态）
  if (cachedPrerenderIds.tabId && cachedPrerenderIds.windowId) {
    return cachedPrerenderIds;
  }
  // 缓存为空时从 storage 读取
  const result = await browser.storage.session.get([STORAGE_KEY_TAB, STORAGE_KEY_WINDOW]);
  cachedPrerenderIds = {
    tabId: result[STORAGE_KEY_TAB] || null,
    windowId: result[STORAGE_KEY_WINDOW] || null
  };
  return cachedPrerenderIds;
}

async function setPrerenderIds(tabId, windowId) {
  cachedPrerenderIds = { tabId, windowId };
  const data = {};
  if (tabId !== null) data[STORAGE_KEY_TAB] = tabId;
  if (windowId !== null) data[STORAGE_KEY_WINDOW] = windowId;
  await browser.storage.session.set(data);
}

async function clearPrerenderIds() {
  cachedPrerenderIds = { tabId: null, windowId: null };
  await browser.storage.session.remove([STORAGE_KEY_TAB, STORAGE_KEY_WINDOW]);
}

async function cleanupExistingWindow(windowId) {
  if (!windowId) return;
  try {
    await browser.windows.remove(windowId);
  } catch { }
}

async function createHiddenWindow() {
  const win = await browser.windows.create({
    url: GEMINI_URL,
    type: 'normal',
    state: 'minimized',
    focused: false
  });

  const tab = win.tabs[0];
  await setPrerenderIds(tab.id, win.id);
  return { tabId: tab.id, windowId: win.id };
}

async function createPrerenderTab() {
  if (!IS_CHROME) return;
  
  // 使用内存锁 + 缓存检查，防止并发创建（解决 service worker 重启竞态）
  if (isCreatingInProgress) {
    // 如果正在创建中，检查缓存的 ID 是否已有效
    const cached = await getPrerenderIds();
    if (cached.tabId && cached.windowId) {
      try {
        await browser.tabs.get(cached.tabId);
        await browser.windows.get(cached.windowId);
        return cached.tabId;
      } catch {
        // 已失效，清理后继续
        await cleanupExistingWindow(cached.windowId);
        await clearPrerenderIds();
      }
    }
    return;
  }

  // 二次检查：验证缓存的预渲染窗口是否仍然有效
  const { tabId, windowId } = await getPrerenderIds();
  if (tabId && windowId) {
    try {
      await browser.tabs.get(tabId);
      await browser.windows.get(windowId);
      return tabId;
    } catch {
      // 窗口/标签页已不存在，清理
      await cleanupExistingWindow(windowId);
      await clearPrerenderIds();
    }
  }

  isCreatingInProgress = true;
  try {
    const result = await createHiddenWindow();
    return result.tabId;
  } finally {
    isCreatingInProgress = false;
  }
}

async function consumePrerenderTab() {
  if (!IS_CHROME) return null;
  const { tabId, windowId } = await getPrerenderIds();
  if (!tabId) return null;

  await clearPrerenderIds();

  try {
    await browser.tabs.get(tabId);

    const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
    const targetWindow = windows.find(w => w.id !== windowId && w.focused) ||
      windows.find(w => w.id !== windowId) ||
      windows[0];

    if (!targetWindow) {
      await browser.tabs.update(tabId, { active: true });
      return tabId;
    }

    await browser.tabs.move(tabId, { windowId: targetWindow.id, index: -1 });
    await browser.tabs.update(tabId, { active: true });
    await browser.windows.update(targetWindow.id, { focused: true });

    await cleanupExistingWindow(windowId);

    // 延迟创建新窗口，确保状态完全清理
    setTimeout(() => createPrerenderTab(), 2000);
    return tabId;
  } catch {
    await cleanupExistingWindow(windowId);
    return null;
  }
}

browser.tabs.onRemoved.addListener(async (removedTabId) => {
  const { tabId, windowId } = await getPrerenderIds();
  if (removedTabId === tabId) {
    await clearPrerenderIds();
    // 延迟创建新窗口，确保旧窗口完全清理
    setTimeout(() => createPrerenderTab(), 2000);
  }
});

browser.windows.onRemoved.addListener(async (removedWindowId) => {
  const { tabId, windowId } = await getPrerenderIds();
  if (removedWindowId === windowId) {
    // 只有当对应的标签页也已失效时才创建新的
    try {
      await browser.tabs.get(tabId);
      // 标签页还存在，可能只是窗口被关闭了，标签页在别的窗口中
      // 不需要立即创建新窗口，等标签页被关闭时再创建
    } catch {
      // 标签页也不存在了，可以创建新的
      await clearPrerenderIds();
      setTimeout(() => createPrerenderTab(), 2000);
    }
  }
});

function normalizeContentText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function extractTextBySelector(tabId, selector) {
  if (!selector) return '';

  if (!browser.scripting?.executeScript) {
    console.warn('当前浏览器不支持 scripting.executeScript，跳过 selector 提取');
    return '';
  }

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (rawSelector) => {
        try {
          const element = document.querySelector(rawSelector);
          if (!element) return '';
          const text = element.innerText || element.textContent || '';
          return text.replace(/\s+/g, ' ').trim();
        } catch (error) {
          return '';
        }
      },
      args: [selector]
    });

    return results?.[0]?.result || '';
  } catch (error) {
    console.error('提取 selector 文本失败:', error);
    return '';
  }
}

async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function buildGeminiQueryText(currentUrl, tabId, matchedResult) {
  const prompt = matchedResult.prompt || DEFAULT_PROMPT;
  const cssSelector = (matchedResult.cssSelector || '').trim();

  if (!cssSelector || typeof tabId !== 'number') {
    return `${currentUrl}\n${prompt}`;
  }

  const extractedText = normalizeContentText(await extractTextBySelector(tabId, cssSelector));
  return `${prompt}\n${extractedText}`;
}

async function openGeminiWithTab(tab) {
  const resolvedTab = tab?.url ? tab : await getCurrentTab();
  const currentUrl = resolvedTab?.url;
  const tabId = resolvedTab?.id;

  if (!currentUrl || !currentUrl.startsWith('http')) {
    return;
  }

  const config = await loadConfig();
  const matchedResult = findMatchingGroup(currentUrl, config);
  const queryText = await buildGeminiQueryText(currentUrl, tabId, matchedResult);

  let targetTabId = await consumePrerenderTab();

  if (!targetTabId) {
    const newTab = await browser.tabs.create({ url: GEMINI_URL });
    targetTabId = newTab.id;
  }

  const sendQueryToContentScript = async (attempt = 1) => {
    try {
      await browser.tabs.sendMessage(targetTabId, {
        type: 'GEMINI_QUERY',
        queryText
      });
    } catch (error) {
      if (attempt < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await sendQueryToContentScript(attempt + 1);
      }
    }
  };

  await sendQueryToContentScript();
}

async function openGeminiWithCurrentTab() {
  try {
    const tab = await getCurrentTab();
    await openGeminiWithTab(tab);
  } catch (error) {
    console.error('打开 Gemini 时出错:', error);
  }
}

browser.runtime.onInstalled.addListener(async () => {
  const config = await loadConfig();
  await saveConfig(config);
  await createPrerenderTab();
});

browser.runtime.onStartup.addListener(async () => {
  await createPrerenderTab();
});

browser.action.onClicked.addListener(async (tab) => {
  await openGeminiWithTab(tab);
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'open-gemini') {
    await openGeminiWithCurrentTab();
  }
});

createPrerenderTab();

export { };
