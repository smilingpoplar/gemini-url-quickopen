/**
 * Background 模块共享常量
 * 集中管理避免重复定义
 */

// Gemini 目标 URL
const GEMINI_URL = 'https://gemini.google.com/app';

// 浏览器类型检测（Chrome 特有 prerender 功能）
const IS_CHROME = browser.runtime.getURL('').startsWith('chrome-extension://');

// Prerender 缓存键
const STORAGE_KEY_TAB = 'prerenderTabId';
const STORAGE_KEY_WINDOW = 'prerenderWindowId';
const STORAGE_KEY_TAB_PERSIST = 'prerenderTabIdPersist';
const STORAGE_KEY_WINDOW_PERSIST = 'prerenderWindowIdPersist';

// 窗口 ID 常量
const WINDOW_ID_NONE = browser.windows?.WINDOW_ID_NONE ?? -1;

// 队列填充延迟（毫秒）
const FILL_DELAY_MS = 2000;

// 消息发送重试配置
const MESSAGE_MAX_RETRIES = 10;
const MESSAGE_RETRY_DELAY_MS = 500;

export {
  GEMINI_URL,
  IS_CHROME,
  STORAGE_KEY_TAB,
  STORAGE_KEY_WINDOW,
  STORAGE_KEY_TAB_PERSIST,
  STORAGE_KEY_WINDOW_PERSIST,
  WINDOW_ID_NONE,
  FILL_DELAY_MS,
  MESSAGE_MAX_RETRIES,
  MESSAGE_RETRY_DELAY_MS,
};
