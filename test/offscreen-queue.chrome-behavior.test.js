import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('when only warm popup exists, focus should still trigger normal window creation', async () => {
  const originalBrowser = globalThis.browser;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalNow = Date.now;

  const listeners = {
    onTabRemoved: null,
    onWindowRemoved: null,
    onFocusChanged: null,
  };
  const createWindowCalls = [];

  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  globalThis.browser = {
    runtime: {
      getURL: () => 'chrome-extension://test-extension/'
    },
    storage: {
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      },
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    },
    tabs: {
      onRemoved: {
        addListener: (handler) => {
          listeners.onTabRemoved = handler;
        }
      },
      get: async (tabId) => ({ id: tabId }),
      move: async () => {},
      update: async () => {}
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onRemoved: {
        addListener: (handler) => {
          listeners.onWindowRemoved = handler;
        }
      },
      onFocusChanged: {
        addListener: (handler) => {
          listeners.onFocusChanged = handler;
        }
      },
      getAll: async ({ windowTypes }) => {
        if (windowTypes?.includes('normal')) {
          return [];
        }

        if (windowTypes?.includes('popup')) {
          return [{
            id: 900,
            left: -10000,
            top: 0,
            width: 1,
            height: 1,
            tabs: [{ id: 901, url: 'https://gemini.google.com/app' }],
          }];
        }

        return [];
      },
      create: async (config) => {
        createWindowCalls.push(config);
        return {
          id: typeof config.tabId === 'number' ? 1001 : 1000,
          tabs: [{ id: config.tabId ?? 1002, url: config.url ?? 'about:blank' }]
        };
      },
      update: async () => {},
      remove: async () => {},
      get: async (windowId) => ({ id: windowId })
    }
  };

  try {
    const moduleUrl = `${pathToFileURL(path.resolve('src/background/offscreen-queue.js')).href}?test=${Date.now()}`;
    let nowValue = 5000;
    Date.now = () => nowValue;

    const { offscreenQueue } = await import(moduleUrl);
    offscreenQueue._scheduleFill = () => {};

    const originalEnsureOnScreenWindowFromActivation = offscreenQueue._ensureOnScreenWindowFromActivation.bind(offscreenQueue);
    let pendingEnsure = null;
    offscreenQueue._ensureOnScreenWindowFromActivation = () => {
      pendingEnsure = originalEnsureOnScreenWindowFromActivation();
      return pendingEnsure;
    };

    assert.equal(typeof listeners.onFocusChanged, 'function');
    await listeners.onFocusChanged(900);
    if (pendingEnsure) {
      await pendingEnsure;
    }

    const normalWindowCall = createWindowCalls.find(call => call.type === 'normal');
    assert.ok(normalWindowCall, 'should create a normal window');
    assert.equal(normalWindowCall.focused, true);
    assert.equal(normalWindowCall.state, 'maximized');

  } finally {
    globalThis.browser = originalBrowser;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalNow;
  }
});

test('closing the last normal window should not immediately auto-reopen a normal window', async () => {
  const originalBrowser = globalThis.browser;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalNow = Date.now;

  let nowValue = 1000;
  Date.now = () => nowValue;

  const listeners = {
    onTabRemoved: null,
    onWindowRemoved: null,
    onFocusChanged: null,
  };
  const createWindowCalls = [];

  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  globalThis.browser = {
    runtime: {
      getURL: () => 'chrome-extension://test-extension/'
    },
    storage: {
      session: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      },
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      }
    },
    tabs: {
      onRemoved: {
        addListener: (handler) => {
          listeners.onTabRemoved = handler;
        }
      },
      get: async (tabId) => ({ id: tabId }),
      move: async () => {},
      update: async () => {}
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onRemoved: {
        addListener: (handler) => {
          listeners.onWindowRemoved = handler;
        }
      },
      onFocusChanged: {
        addListener: (handler) => {
          listeners.onFocusChanged = handler;
        }
      },
      getAll: async ({ windowTypes }) => {
        if (windowTypes?.includes('normal')) {
          return [];
        }

        if (windowTypes?.includes('popup')) {
          return [{
            id: 900,
            left: -10000,
            top: 0,
            width: 1,
            height: 1,
            tabs: [{ id: 901, url: 'https://gemini.google.com/app' }],
          }];
        }

        return [];
      },
      create: async (config) => {
        createWindowCalls.push(config);
        return {
          id: typeof config.tabId === 'number' ? 1001 : 1000,
          tabs: [{ id: config.tabId ?? 1002, url: config.url ?? 'about:blank' }]
        };
      },
      update: async () => {},
      remove: async () => {},
      get: async (windowId) => ({ id: windowId })
    }
  };

  try {
    const moduleUrl = `${pathToFileURL(path.resolve('src/background/offscreen-queue.js')).href}?test=${Date.now()}-close`;
    const { offscreenQueue } = await import(moduleUrl);
    offscreenQueue._scheduleFill = () => {};

    const originalEnsureOnScreenWindowFromActivation = offscreenQueue._ensureOnScreenWindowFromActivation.bind(offscreenQueue);
    let pendingEnsure = null;
    offscreenQueue._ensureOnScreenWindowFromActivation = () => {
      pendingEnsure = originalEnsureOnScreenWindowFromActivation();
      return pendingEnsure;
    };

    assert.equal(typeof listeners.onWindowRemoved, 'function');
    assert.equal(typeof listeners.onFocusChanged, 'function');

    await listeners.onWindowRemoved(111);
    await listeners.onFocusChanged(900);
    if (pendingEnsure) {
      await pendingEnsure;
      pendingEnsure = null;
    }

    const normalWindowCall = createWindowCalls.find(call => call.type === 'normal');
    assert.equal(normalWindowCall, undefined, 'should not auto-reopen normal window immediately after close');

    nowValue = 2000;
    await listeners.onFocusChanged(900);
    if (pendingEnsure) {
      await pendingEnsure;
      pendingEnsure = null;
    }

    const delayedNormalWindowCall = createWindowCalls.find(call => call.type === 'normal');
    assert.ok(delayedNormalWindowCall, 'should allow creating normal window after suppression window passes');
  } finally {
    globalThis.browser = originalBrowser;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalNow;
  }
});
