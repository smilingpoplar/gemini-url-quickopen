import {
  GEMINI_URL,
  IS_CHROME,
  WINDOW_ID_NONE,
  FILL_DELAY_MS,
} from './constants.js';
import {
  getWindows,
  createWindow,
  moveTab,
  activateTab,
  focusWindow,
  removeWindow,
} from './window-utils.js';
import { IdsStore } from './ids-store.js';

class OffScreenQueue {
  constructor(maxSize = 1) {
    this._maxSize = maxSize;
    this._offScreenQueue = [];
    this._isCreating = false;
    this._isEnsuringOnScreenWindow = false;
    this._isWaitingForOnScreenWindow = false;
    this._suppressWarmPopupActivationUntil = 0;
    this._fillTimer = null;
    this._cache = new IdsStore();
    this._waiting = [];
    this._init();
  }

  _init() {
    browser.tabs.onRemoved.addListener(async (removedTabId) => {
      if (!IS_CHROME) return;

      const removedQueueItem = this._removeOffScreenByTabId(removedTabId);
      const cached = await this._getCache();
      const removedCachedItem = cached.tabId === removedTabId;
      const shouldRefillWarmWindow = removedQueueItem || removedCachedItem;

      if (removedCachedItem) {
        await this._clearCache();
      }

      const hasWindows = await this._hasOnScreenWindows();
      if (hasWindows === false) {
        this._isWaitingForOnScreenWindow = true;
        this._suppressWarmPopupActivationUntil = Date.now() + 800;
        this._scheduleFill(0);
        return;
      }

      if (shouldRefillWarmWindow) {
        this._scheduleFill();
      }
    });

    browser.windows.onRemoved.addListener(async (removedWindowId) => {
      if (!IS_CHROME) return;

      const removedQueueItem = this._removeOffScreenByWindowId(removedWindowId);
      const cached = await this._getCache();
      const removedCachedItem = cached.windowId === removedWindowId;
      const shouldRefillWarmWindow = removedQueueItem || removedCachedItem;

      if (removedCachedItem) {
        await this._clearCache();
      }

      const hasWindows = await this._hasOnScreenWindows();
      if (hasWindows === false) {
        this._isWaitingForOnScreenWindow = true;
        this._suppressWarmPopupActivationUntil = Date.now() + 800;
        this._scheduleFill(0);
        return;
      }

      if (shouldRefillWarmWindow) {
        this._scheduleFill();
        return;
      }
    });

    browser.windows.onFocusChanged.addListener(async (windowId) => {
      if (!IS_CHROME) return;
      if (windowId === WINDOW_ID_NONE) return;

      const hasOnScreenWindows = await this._hasOnScreenWindows();
      if (hasOnScreenWindows) {
        this._isWaitingForOnScreenWindow = false;
        return;
      }

      const isWarmPopup = await this._isWarmPopupWindow(windowId);
      if (isWarmPopup && Date.now() < this._suppressWarmPopupActivationUntil) return;
      if (!isWarmPopup && !this._isWaitingForOnScreenWindow) return;

      this._isWaitingForOnScreenWindow = true;
      void this._ensureOnScreenWindowFromActivation();
    });
  }

  _removeOffScreenByTabId(tabId) {
    const previousLength = this._offScreenQueue.length;
    this._offScreenQueue = this._offScreenQueue.filter(item => item.tabId !== tabId);
    return this._offScreenQueue.length !== previousLength;
  }

  _removeOffScreenByWindowId(windowId) {
    const previousLength = this._offScreenQueue.length;
    this._offScreenQueue = this._offScreenQueue.filter(item => item.windowId !== windowId);
    return this._offScreenQueue.length !== previousLength;
  }

  _scheduleFill(delayMs = FILL_DELAY_MS) {
    if (this._fillTimer) {
      clearTimeout(this._fillTimer);
    }

    this._fillTimer = setTimeout(() => {
      this._fillTimer = null;
      void this._ensureFilled();
    }, delayMs);
  }

  get maxSize() {
    return this._maxSize;
  }

  set maxSize(value) {
    this._maxSize = value;
    if (this._offScreenQueue.length < this._maxSize) {
      void this._ensureFilled();
    }
  }

  get size() {
    return this._offScreenQueue.length;
  }

  get isEmpty() {
    return this._offScreenQueue.length === 0;
  }

  get isFull() {
    return this._offScreenQueue.length >= this._maxSize;
  }

  async fill() {
    await this._ensureFilled();
  }

  async dequeue() {
    if (!IS_CHROME) return null;

    while (true) {
      if (this._offScreenQueue.length === 0) {
        void this._ensureFilled();

        while (this._offScreenQueue.length === 0) {
          await new Promise((resolve) => {
            this._waiting.push({ resolve });
          });
        }
      }

      const item = this._offScreenQueue.shift();

      try {
        await browser.tabs.get(item.tabId);
      } catch {
        if (item.windowId) {
          await removeWindow(item.windowId);
        }
        await this._clearCache();
        this._scheduleFill();
        continue;
      }

      await this._clearCache();

      try {
        const windows = await getWindows();
        const targetWindow = windows.find(w => w.id !== item.windowId && w.focused)
          || windows.find(w => w.id !== item.windowId)
          || null;

        if (!targetWindow) {
        const createdWindow = await createWindow({
            tabId: item.tabId,
            type: 'normal',
            focused: true,
            state: 'maximized'
          });

          if (item.windowId && item.windowId !== createdWindow.id) {
            await removeWindow(item.windowId);
          }

          this._isWaitingForOnScreenWindow = (await getWindows()).length === 0;
          this._scheduleFill();
          return { tabId: item.tabId, windowId: createdWindow.id || null };
        }

        await moveTab(item.tabId, targetWindow.id);
        await activateTab(item.tabId);
        await focusWindow(targetWindow.id);

        if (item.windowId !== targetWindow.id) {
          await removeWindow(item.windowId);
        }

        this._isWaitingForOnScreenWindow = (await getWindows()).length === 0;
        this._scheduleFill();
        return { tabId: item.tabId, windowId: targetWindow.id };
      } catch {
        if (item.windowId) {
          await removeWindow(item.windowId);
        }
        this._scheduleFill();
      }
    }
  }

  async _enqueueOffScreen(tabId, windowId) {
    if (this._offScreenQueue.length >= this._maxSize) {
      return;
    }

    this._offScreenQueue.push({ tabId, windowId });
    await this._setCache(tabId, windowId);

    while (this._waiting.length > 0) {
      const waiter = this._waiting.shift();
      waiter.resolve();
    }
  }

  async _clearCache() {
    await this._cache.clear();
  }

  async _getCache() {
    return this._cache.get();
  }

  async _setCache(tabId, windowId) {
    await this._cache.set(tabId, windowId);
  }

  async _hasOnScreenWindows() {
    const windows = await getWindows();
    return windows.length > 0;
  }

  async _findWarmPopupItems() {
    try {
      const popupWindows = await browser.windows.getAll({
        populate: true,
        windowTypes: ['popup']
      });

      return popupWindows
        .map((windowInfo) => {
          const firstTab = windowInfo.tabs?.[0];
          const tabUrl = firstTab?.url || '';
          const isGeminiTab = tabUrl.startsWith(GEMINI_URL);
          const isOffscreenShape = (windowInfo.left ?? 0) <= -1000
            && (windowInfo.width ?? 0) <= 5
            && (windowInfo.height ?? 0) <= 5;
          const tabId = firstTab?.id;
          const windowId = windowInfo.id;

          if (!isGeminiTab || !isOffscreenShape) return null;
          if (typeof tabId !== 'number' || typeof windowId !== 'number') return null;
          return { tabId, windowId };
        })
        .filter(item => item !== null);
    } catch {
      return [];
    }
  }

  async _isWarmPopupWindow(windowId) {
    if (typeof windowId !== 'number') return false;

    const queueMatch = this._offScreenQueue.some(item => item.windowId === windowId);
    if (queueMatch) return true;

    const cached = await this._getCache();
    if (cached.windowId === windowId) return true;

    const warmItems = await this._findWarmPopupItems();
    return warmItems.some(item => item.windowId === windowId);
  }

  async _adoptExistingWarmPopupIfAny() {
    const warmItems = await this._findWarmPopupItems();
    if (warmItems.length === 0) return null;

    const [keepItem, ...redundantItems] = warmItems;

    for (const item of redundantItems) {
      await removeWindow(item.windowId);
    }

    this._offScreenQueue = [];
    await this._clearCache();
    await this._enqueueOffScreen(keepItem.tabId, keepItem.windowId);
    return keepItem;
  }

  async _clearWarmWindowWhenNoFrontWindows() {
    const queueWindowIds = this._offScreenQueue
      .map(item => item.windowId)
      .filter(windowId => typeof windowId === 'number');

    const cached = await this._getCache();
    const cachedWindowId = typeof cached.windowId === 'number' ? cached.windowId : null;

    const detectedWarmWindowIds = (await this._findWarmPopupItems()).map(item => item.windowId);

    const windowIds = [...new Set([
      ...queueWindowIds,
      cachedWindowId,
      ...detectedWarmWindowIds,
    ].filter(windowId => typeof windowId === 'number'))];

    this._offScreenQueue = [];
    await this._clearCache();

    for (const windowId of windowIds) {
      await removeWindow(windowId);
    }
  }

  async _getOffScreenFromCache() {
    const cached = await this._getCache();
    if (!cached.tabId || !cached.windowId) {
      return null;
    }

    try {
      await browser.tabs.get(cached.tabId);
      await browser.windows.get(cached.windowId);
      return { tabId: cached.tabId, windowId: cached.windowId };
    } catch {
      this._removeOffScreenByTabId(cached.tabId);
      await this._clearCache();
      return null;
    }
  }

  async _ensureOnScreenWindowFromActivation() {
    if (this._isEnsuringOnScreenWindow) return;
    if (!this._isWaitingForOnScreenWindow) return;

    this._isEnsuringOnScreenWindow = true;
    try {
      const hasWindows = await this._hasOnScreenWindows();
      if (hasWindows) {
        this._isWaitingForOnScreenWindow = false;
        this._scheduleFill(0);
        return;
      }

      const offScreenItem = await this._getOffScreenFromCache();
      if (!offScreenItem) {
        await this._ensureFilled();
      }

      await createWindow({ type: 'normal', focused: true, state: 'maximized' });
      this._isWaitingForOnScreenWindow = (await getWindows()).length === 0;
      this._scheduleFill();
    } finally {
      this._isEnsuringOnScreenWindow = false;
    }
  }

  async _ensureFilled() {
    if (!IS_CHROME) return;
    if (this._isCreating) return;

    const hasOnScreenWindows = await this._hasOnScreenWindows();
    this._isWaitingForOnScreenWindow = !hasOnScreenWindows;

    if (this._offScreenQueue.length === 0) {
      const adoptedItem = await this._adoptExistingWarmPopupIfAny();
      if (adoptedItem) return;
    }

    if (this._offScreenQueue.length >= this._maxSize) return;

    const offScreenItem = await this._getOffScreenFromCache();
    if (offScreenItem) {
      if (!this._offScreenQueue.find(item => item.tabId === offScreenItem.tabId)) {
        await this._enqueueOffScreen(offScreenItem.tabId, offScreenItem.windowId);
      }
      return;
    }

    if (this._offScreenQueue.length < this._maxSize) {
      await this._createWindow();
    }
  }

  async _createWindow() {
    if (!IS_CHROME) return;
    if (this._isCreating) return;

    this._isCreating = true;
    try {
      const offScreenItem = await this._getOffScreenFromCache();
      if (offScreenItem) {
        if (!this._offScreenQueue.find(item => item.tabId === offScreenItem.tabId)) {
          await this._enqueueOffScreen(offScreenItem.tabId, offScreenItem.windowId);
        }
        return;
      }

      const adoptedItem = await this._adoptExistingWarmPopupIfAny();
      if (adoptedItem) {
        return;
      }

      const win = await createWindow({
        url: GEMINI_URL,
        type: 'popup',
        left: -10000,
        top: 0,
        width: 1,
        height: 1,
        focused: false
      });

      const tab = win.tabs?.[0];
      if (!tab?.id || !win.id) {
        return;
      }

      await this._enqueueOffScreen(tab.id, win.id);
    } finally {
      this._isCreating = false;
    }
  }
}

const offscreenQueue = new OffScreenQueue(1);

export { offscreenQueue };
