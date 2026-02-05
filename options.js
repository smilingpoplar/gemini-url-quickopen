const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_PROMPT = "请总结 ";

const promptInput = document.getElementById('prompt');
const previewElement = document.getElementById('preview');
const saveButton = document.getElementById('save');
const statusElement = document.getElementById('status');

function loadSettings() {
  browserAPI.storage.sync.get(['prompt'], (result) => {
    const prompt = result.prompt || DEFAULT_PROMPT;
    promptInput.value = prompt;
    updatePreview(prompt);
  });
}

function updatePreview(prompt) {
  const exampleUrl = "https://example.com";
  previewElement.textContent = prompt + exampleUrl;
}

function showStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.className = 'status ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    statusElement.className = 'status';
  }, 3000);
}

function saveSettings() {
  const prompt = promptInput.value.trim();

  if (!prompt) {
    showStatus('Prompt 不能为空！', true);
    return;
  }

  browserAPI.storage.sync.set({ prompt: prompt }, () => {
    showStatus('设置已保存！');
  });
}

promptInput.addEventListener('input', (e) => {
  updatePreview(e.target.value);
});

saveButton.addEventListener('click', saveSettings);

document.addEventListener('DOMContentLoaded', loadSettings);
