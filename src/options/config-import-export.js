import yaml from 'js-yaml';
import { DEFAULT_PROMPT } from '../constants.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function exportToYaml(config) {
  const customGroups = config.ruleGroups.filter(g => !g.isDefault);

  const exportData = {
    ruleGroups: customGroups.map(group => ({
      prompt: group.prompt,
      rules: group.rules.map(rule => ({
        urlPattern: rule.urlPattern,
        cssSelector: rule.cssSelector || undefined
      })).filter(rule => rule.urlPattern)
    })).filter(group => group.rules.length > 0 || group.prompt)
  };

  return yaml.dump(exportData, { indent: 2, lineWidth: -1 });
}

export function importFromYaml(yamlString) {
  const data = yaml.load(yamlString);

  if (!data || !Array.isArray(data.ruleGroups)) {
    throw new Error('无效的 YAML 格式');
  }

  const importedGroups = data.ruleGroups.map(group => ({
    id: generateId(),
    prompt: group.prompt || DEFAULT_PROMPT,
    rules: (group.rules || []).map(rule => ({
      id: generateId(),
      urlPattern: rule.urlPattern || '',
      cssSelector: rule.cssSelector || ''
    }))
  }));

  return importedGroups;
}

export function downloadYaml(content, filename) {
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function selectYamlFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    };

    input.onerror = () => reject(new Error('无法打开文件选择器'));
    input.click();
  });
}
