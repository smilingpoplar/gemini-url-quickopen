import { DEFAULT_PROMPT } from '../constants.js';
import { findMatchingGroup } from '../url-pattern.js';
import { loadConfig } from '../options/config-storage.js';
import { offscreenQueue } from './offscreen-queue.js';
import { normalizeContentText, extractTextBySelector } from './text-extractor.js';
import { GEMINI_URL, IS_CHROME } from './constants.js';

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
  return `${currentUrl}\n${prompt}\n${extractedText}`;
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

  await openPrerenderedGemini(queryText);
}

async function openGeminiTabWithQuery(queryText) {
  const openedTab = await browser.tabs.create({ url: GEMINI_URL, active: true });
  const openedTabId = openedTab?.id;

  if (queryText && typeof openedTabId === 'number') {
    await sendQueryToPrerenderTab(openedTabId, queryText);
  }

  return openedTabId;
}

async function openPrerenderedGemini(queryText) {
  if (!IS_CHROME) {
    return openGeminiTabWithQuery(queryText);
  }

  const item = await offscreenQueue.dequeue();
  const targetTabId = item?.tabId;

  if (typeof targetTabId !== 'number') {
    return openGeminiTabWithQuery(queryText);
  }

  if (queryText) {
    await sendQueryToPrerenderTab(targetTabId, queryText);
  }

  return targetTabId;
}

async function sendQueryToPrerenderTab(targetTabId, queryText, attempt = 1) {
  if (typeof targetTabId !== 'number') {
    return;
  }

  try {
    await browser.tabs.sendMessage(targetTabId, {
      type: 'GEMINI_QUERY',
      queryText
    });
  } catch (error) {
    if (attempt < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendQueryToPrerenderTab(targetTabId, queryText, attempt + 1);
    }
  }
}

async function openGeminiWithCurrentTab() {
  try {
    const tab = await getCurrentTab();
    await openGeminiWithTab(tab);
  } catch (error) {
    console.error('打开 Gemini 时出错:', error);
  }
}

export { getCurrentTab, buildGeminiQueryText, openGeminiWithTab, openPrerenderedGemini, sendQueryToPrerenderTab, openGeminiWithCurrentTab };
