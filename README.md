# Gemini URL 快捷打开

一个简洁的浏览器插件（支持 Chrome 和 Firefox），点击图标即可将当前网页 URL 发送到 Gemini 进行分析。

## 功能特点

- 一键获取当前网页 URL 并在 Gemini 中打开
- 可自定义 Prompt，灵活控制分析需求
- 美观的设置页面，实时预览效果
- 使用 Manifest V3 标准
- 支持 Chrome 和 Firefox 浏览器

## 安装方法

### Chrome（简单）

1. 构建扩展：
   ```bash
   ./build.sh chrome
   ```

2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `dist/chrome` 文件夹
6. 安装成功！

### Firefox（分情况）

**重要提示：Firefox 稳定版（Release）无法安装未签名扩展！**这是 Mozilla 的安全策略，无法绕过。

#### 方案一：临时加载（所有 Firefox 版本都支持，但重启后失效）

适合开发和测试：

1. 构建扩展：
   ```bash
   ./build.sh firefox
   ```

2. 打开 Firefox，地址栏输入 `about:debugging`
3. 点击左侧「此 Firefox」
4. 点击「临时载入附加组件...」
5. 选择 `dist/firefox/manifest.json` 文件
6. 安装成功！（重启 Firefox 后需要重新加载）

#### 方案二：使用 Firefox Developer Edition（推荐永久使用）

**注意：Firefox 稳定版和 Beta 版即使修改配置也无法安装未签名扩展。必须使用 Developer Edition、Nightly 或 ESR 版本。**

1. 下载安装 [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
2. 打开 Developer Edition，地址栏输入 `about:config`
3. 搜索 `xpinstall.signatures.required`
4. 双击将其设为 `false`
5. 构建扩展：
   ```bash
   ./build.sh firefox
   ```
6. 在 Developer Edition 中打开 `about:addons`
7. 点击齿轮图标 ⚙️ → 「从文件安装附加组件...」
8. 选择 `gemini-url-quickopen-1.0.0-firefox.zip` 文件
9. 安装成功！（永久有效，重启后依然存在）

#### 方案三：提交到 Firefox 附加组件商店（推荐分发）

如果你想让普通 Firefox 用户也能安装：

1. 访问 [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
2. 注册开发者账号
3. 提交扩展文件 (`gemini-url-quickopen-1.0.0-firefox.zip`)
4. 等待审核通过后会自动获得 Mozilla 签名
5. 用户可以直接从商店安装（无需 Developer Edition）

## 项目结构

```
gemini-chrome-extension/
├── background.js          # 后台脚本（共享）
├── options.html           # 设置页面（共享）
├── options.js             # 设置页面逻辑（共享）
├── content.js             # 内容脚本（共享）
├── icons/                 # 图标文件夹
├── chrome/
│   └── manifest.json      # Chrome 专用配置 (MV3 + service_worker)
├── firefox/
│   └── manifest.json      # Firefox 专用配置 (MV3 + scripts)
├── build.sh               # 构建脚本
└── README.md              # 说明文档
```

**关键差异：**
- **Chrome**: `background.service_worker: "background.js"`
- **Firefox**: `background.scripts: ["background.js"]` + `browser_specific_settings.gecko.id`

这是参考 React DevTools、Vue DevTools 等著名项目的做法。

## 使用方法

1. **点击图标**: 在任意网页点击插件图标，会自动打开 Gemini 并附带当前页面 URL
2. **自定义设置**:
   - Chrome: 右键点击插件图标 → 「选项」
   - Firefox: 右键点击插件图标 → 「扩展选项」
3. 在设置页面修改 Prompt，例如：
   - `请分析这个网页: `
   - `总结这篇文章的主要内容: `
   - `请检查这个页面的安全问题: `

## 技术说明

- **Manifest Version**: 3
- **浏览器支持**: 
  - Chrome 114+ (Manifest V3 with service worker)
  - Firefox 128+ (Manifest V3 with background scripts)
- **权限**:
  - `activeTab`: 获取当前标签页信息
  - `storage`: 保存用户设置
- **API**:
  - Action API (处理图标点击)
  - Storage API (保存用户设置)
  - Tabs API (打开新标签页)

## 自定义开发

### 修改默认 Prompt

编辑 `background.js` 中的 `DEFAULT_PROMPT` 常量：

```javascript
const DEFAULT_PROMPT = "你的默认提示词";
```

### 修改目标 URL

编辑 `background.js` 中的 URL 构建逻辑。

## 注意事项

1. 需要登录 Google 账号才能使用 Gemini
2. 插件需要访问当前标签页的权限
3. Chrome 用户的设置会自动同步到 Google 账号（如果开启了 Chrome 同步）
4. **Firefox 签名限制**（重要）：
   - Firefox 稳定版（Release）和 Beta **无法**安装未签名扩展（即使修改 `xpinstall.signatures.required` 也不行）
   - 只有 Developer Edition、Nightly、ESR 可以禁用签名验证
   - 临时加载适用于所有版本，但重启后失效
   - 如需永久使用，请使用 Developer Edition 或提交到 [Firefox 附加组件商店](https://addons.mozilla.org)

## 许可证

MIT License
