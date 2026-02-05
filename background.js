const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_PROMPT = "请总结 ";

browserAPI.runtime.onInstalled.addListener(() => {
  browserAPI.storage.sync.get(['prompt'], (result) => {
    if (!result.prompt) {
      browserAPI.storage.sync.set({ prompt: DEFAULT_PROMPT });
    }
  });
});

browserAPI.action.onClicked.addListener(async (tab) => {
  try {
    const currentUrl = tab.url;

    const result = await browserAPI.storage.sync.get(['prompt']);
    const prompt = result.prompt || DEFAULT_PROMPT;

    const geminiUrl = `https://gemini.google.com/app?q=${encodeURIComponent(prompt + currentUrl)}`;
    await browserAPI.tabs.create({ url: geminiUrl });
  } catch (error) {
    console.error('打开 Gemini 时出错:', error);
  }
});
