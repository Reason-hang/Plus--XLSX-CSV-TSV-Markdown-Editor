import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const config = packageJson.contributes?.configuration?.properties ?? {};
const requiredSettings = [
    'xlsxViewer.md.theme.enabled',
    'xlsxViewer.md.theme.cssFile',
    'xlsxViewer.md.theme.manifestFile',
    'xlsxViewer.md.theme.watch'
];
const requiredCommands = [
    'xlsx-viewer.reloadMarkdownTheme',
    'xlsx-viewer.showMarkdownThemeStatus',
    'xlsx-viewer.revealMarkdownThemeFolder'
];

for (const key of requiredSettings) {
    if (!config[key]) {
        throw new Error(`缺少主题配置：${key}`);
    }
}

const commands = packageJson.contributes?.commands?.map(command => command.command) ?? [];
for (const command of requiredCommands) {
    if (!commands.includes(command)) {
        throw new Error(`缺少主题命令：${command}`);
    }
}

const sourceFiles = [
    'src/shared/markdownThemeService.ts',
    'src/mdEditorProvider.ts',
    'src/webviews/md/mdWebview.ts',
    'themes/markdown-theme/adapters/mpe-adapter.less'
];
for (const file of sourceFiles) {
    if (!existsSync(file)) {
        throw new Error(`缺少主题源码文件：${file}`);
    }
}

const cssFile = 'themes/markdown-theme/dist/markdown-theme.css';
const manifestFile = 'themes/markdown-theme/dist/theme-manifest.json';
const migrationDraftFile = 'themes/markdown-theme/dist/migration-draft.less';
if (!existsSync(cssFile) || !existsSync(manifestFile) || !existsSync(migrationDraftFile)) {
    throw new Error('缺少已编译主题；请先运行 npm run theme:build。');
}

const css = readFileSync(cssFile, 'utf8');
for (const selector of ['.markdown-preview', '.toc-panel', '.md-sidebar-toc', '.markdown-preview mark']) {
    if (!css.includes(selector)) {
        throw new Error(`主题 CSS 缺少兼容选择器：${selector}`);
    }
}
if (!css.toLowerCase().includes('background-color: #ff4e00')) {
    throw new Error('主题 CSS 未包含默认橙色 <mark> 高亮。');
}
if (/\@import\b/i.test(css) || /(^|,)\s*(?:html|body)\b/im.test(css)) {
    throw new Error('主题 CSS 违反单一 CSS 或预览作用域约束。');
}

const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (typeof manifest.sha256 !== 'string' || manifest.sha256.length !== 64) {
    throw new Error('主题 manifest 未包含有效 SHA-256。');
}
if (!readFileSync(migrationDraftFile, 'utf8').includes('MPE 主题迁移草稿')) {
    throw new Error('迁移工具未生成可审阅的 Less 草稿。');
}

const bundledWebviewFile = 'dist/md/mdWebview.js';
const bundledExtensionFile = 'dist/extension.js';
if (!existsSync(bundledWebviewFile) || !existsSync(bundledExtensionFile)) {
    throw new Error('缺少生产构建产物；请先运行 npm run package。');
}
if (!readFileSync(bundledWebviewFile, 'utf8').includes('xlsx-viewer-external-markdown-theme')) {
    throw new Error('生产 Webview 构建未包含外置主题注入逻辑。');
}
if (!readFileSync(bundledExtensionFile, 'utf8').includes('xlsx-viewer.reloadMarkdownTheme')) {
    throw new Error('生产扩展构建未包含外置主题重载命令。');
}

console.log('完整 Markdown 主题系统验证：PASS');
