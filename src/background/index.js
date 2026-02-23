import { offscreenQueue } from './offscreen-queue.js';
import { setupExtensionLifecycle, initEventListeners } from './event-handler.js';

await setupExtensionLifecycle();
initEventListeners();

offscreenQueue.fill();
