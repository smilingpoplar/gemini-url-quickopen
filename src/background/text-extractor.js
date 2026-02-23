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

export { normalizeContentText, extractTextBySelector };
