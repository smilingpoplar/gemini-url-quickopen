import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createStorage(initialSession = {}, initialLocal = {}) {
  const sessionState = { ...initialSession };
  const localState = { ...initialLocal };
  const calls = {
    sessionGet: 0,
    localGet: 0,
  };

  return {
    calls,
    browser: {
      runtime: {
        getURL: () => 'chrome-extension://test-extension/'
      },
      storage: {
        session: {
          get: async (keys) => {
            calls.sessionGet += 1;
            return Object.fromEntries(keys.map(key => [key, sessionState[key]]));
          },
          set: async (data) => {
            Object.assign(sessionState, data);
          },
          remove: async (keys) => {
            for (const key of keys) delete sessionState[key];
          }
        },
        local: {
          get: async (keys) => {
            calls.localGet += 1;
            return Object.fromEntries(keys.map(key => [key, localState[key]]));
          },
          set: async (data) => {
            Object.assign(localState, data);
          },
          remove: async (keys) => {
            for (const key of keys) delete localState[key];
          }
        }
      }
    },
    readSession: () => ({ ...sessionState }),
    readLocal: () => ({ ...localState }),
  };
}

async function loadIdsStoreModule(tag) {
  const moduleUrl = `${pathToFileURL(path.resolve('src/background/ids-store.js')).href}?test=${tag}`;
  return import(moduleUrl);
}

test('get should return memory directly when memory has valid pair', async () => {
  const originalBrowser = globalThis.browser;
  const { browser, calls } = createStorage();
  globalThis.browser = browser;

  try {
    const { IdsStore } = await loadIdsStoreModule(`memory-${Date.now()}`);
    const cache = new IdsStore();
    await cache.set(11, 22);

    const value = await cache.get();
    assert.deepEqual(value, { tabId: 11, windowId: 22 });
    assert.equal(calls.sessionGet, 0);
    assert.equal(calls.localGet, 0);
  } finally {
    globalThis.browser = originalBrowser;
  }
});

test('get should prefer session pair, else fallback to local pair', async () => {
  const originalBrowser = globalThis.browser;
  const { browser } = createStorage(
    { prerenderTabId: 101 },
    { prerenderTabIdPersist: 7, prerenderWindowIdPersist: 9 }
  );
  globalThis.browser = browser;

  try {
    const { IdsStore } = await loadIdsStoreModule(`fallback-${Date.now()}`);
    const cache = new IdsStore();

    const value = await cache.get();
    assert.deepEqual(value, { tabId: 7, windowId: 9 });
  } finally {
    globalThis.browser = originalBrowser;
  }
});

test('set and clear should sync session/local and memory', async () => {
  const originalBrowser = globalThis.browser;
  const env = createStorage();
  globalThis.browser = env.browser;

  try {
    const { IdsStore } = await loadIdsStoreModule(`set-clear-${Date.now()}`);
    const cache = new IdsStore();

    await cache.set(3, 4);
    assert.equal(env.readSession().prerenderTabId, 3);
    assert.equal(env.readSession().prerenderWindowId, 4);
    assert.equal(env.readLocal().prerenderTabIdPersist, 3);
    assert.equal(env.readLocal().prerenderWindowIdPersist, 4);

    await cache.clear();
    assert.equal(env.readSession().prerenderTabId, undefined);
    assert.equal(env.readSession().prerenderWindowId, undefined);
    assert.equal(env.readLocal().prerenderTabIdPersist, undefined);
    assert.equal(env.readLocal().prerenderWindowIdPersist, undefined);
    assert.deepEqual(await cache.get(), { tabId: null, windowId: null });
  } finally {
    globalThis.browser = originalBrowser;
  }
});
