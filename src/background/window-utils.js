import { WINDOW_ID_NONE } from './constants.js';

async function getWindows() {
  return browser.windows.getAll({ windowTypes: ['normal'] });
}

async function createWindow(config) {
  return browser.windows.create(config);
}

async function moveTab(tabId, windowId, index = -1) {
  return browser.tabs.move(tabId, { windowId, index });
}

async function activateTab(tabId) {
  return browser.tabs.update(tabId, { active: true });
}

async function focusWindow(windowId) {
  if (windowId === WINDOW_ID_NONE) return;
  return browser.windows.update(windowId, { focused: true });
}

async function removeWindow(windowId) {
  if (!windowId) return;
  try {
    await browser.windows.remove(windowId);
  } catch { }
}

export {
  getWindows,
  createWindow,
  moveTab,
  activateTab,
  focusWindow,
  removeWindow,
  WINDOW_ID_NONE,
};
