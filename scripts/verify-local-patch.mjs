import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const config = packageJson.contributes?.configuration?.properties ?? {};
const requiredDefaults = {
    'xlsxViewer.md.markBackgroundColor': '#FF4E00',
    'xlsxViewer.md.markTextColor': 'inherit',
    'xlsxViewer.md.markFontWeight': 'inherit',
    'xlsxViewer.md.markPadding': '0 2px',
    'xlsxViewer.md.markBorderRadius': '2px',
    'xlsxViewer.md.headingColor': '#569CD6',
    'xlsxViewer.md.previewBackgroundColor': '',
    'xlsxViewer.md.previewTextColor': '',
    'xlsxViewer.md.previewFontSize': '',
    'xlsxViewer.md.previewLineHeight': '',
    'xlsxViewer.md.editorFontSize': '16px',
    'xlsxViewer.md.editorLineHeight': '1.8'
};

const requiredThemeDefaults = {
    'xlsxViewer.md.theme.enabled': false,
    'xlsxViewer.md.theme.cssFile': '',
    'xlsxViewer.md.theme.manifestFile': '',
    'xlsxViewer.md.theme.watch': true
};

const highlightKeybinding = packageJson.contributes?.keybindings?.find((keybinding) =>
    keybinding.command === 'editor.action.insertSnippet' &&
    keybinding.key === 'ctrl+alt+shift+3' &&
    keybinding.mac === 'cmd+alt+shift+3'
);

if (
    highlightKeybinding?.when !== 'editorTextFocus && editorLangId == markdown && editorHasSelection' ||
    highlightKeybinding.args?.snippet !== '<mark>${TM_SELECTED_TEXT}</mark>'
) {
    throw new Error('Markdown highlight shortcut must wrap the selection in a standard <mark> tag.');
}

for (const [key, expectedDefault] of Object.entries(requiredDefaults)) {
    if (config[key]?.default !== expectedDefault) {
        throw new Error(`Missing or changed local patch setting: ${key}`);
    }
}

if (!Array.isArray(config['xlsxViewer.md.externalResourceRoots']?.default) || config['xlsxViewer.md.externalResourceRoots'].default.length !== 0) {
    throw new Error('Markdown externalResourceRoots must default to an empty array.');
}

for (const [key, expectedDefault] of Object.entries(requiredThemeDefaults)) {
    if (config[key]?.default !== expectedDefault) {
        throw new Error(`Missing or changed Markdown theme setting: ${key}`);
    }
}

const provider = readFileSync('src/mdEditorProvider.ts', 'utf8');
const webview = readFileSync('src/webviews/md/mdWebview.ts', 'utf8');
const css = readFileSync('resources/md/mdWebview.css', 'utf8');
const sharedThemeCss = readFileSync('resources/shared/theme.css', 'utf8');
const toolbarManager = readFileSync('src/webviews/shared/toolbarManager.ts', 'utf8');
const messageSchema = readFileSync('src/shared/webviewMessageSchema.ts', 'utf8');
const requiredSourceMarkers = [
    'getMarkdownSettings',
    'applyMarkdownAppearance',
    '--xlsx-viewer-md-mark-background',
    'background-color: var(--xlsx-viewer-md-mark-background)',
    '--xlsx-viewer-md-editor-font-size',
    '--xlsx-viewer-md-editor-line-height',
    '--xlsx-viewer-md-heading-color',
    'flex-wrap: wrap;',
    'flex: 0 0 28px;',
    'font-size: var(--xlsx-viewer-md-editor-font-size)',
    'line-height: var(--xlsx-viewer-md-editor-line-height)',
    'sanitizeAppearanceValue',
    'appearanceConfigKeys',
    'txtMarkBackgroundColor',
    'txtHeadingColor',
    'validateWebviewMessage',
    'maxMessageBytes',
    'txtPreviewBackgroundColor',
    'txtEditorFontSize',
    'settings-section-title',
    'MarkdownThemeService',
    'applyExternalMarkdownTheme',
    'md-sidebar-toc',
    'scheduleMarkdownHeaderHeightUpdate',
    "case 'highlight': wrapSelection(editor, '<mark>', '</mark>');",
    "e.code === 'Digit3'"
];

for (const marker of requiredSourceMarkers) {
    if (![provider, webview, css, sharedThemeCss, toolbarManager, messageSchema].some(source => source.includes(marker))) {
        throw new Error(`Local patch source marker is missing: ${marker}`);
    }
}

const requiredMarkdownToolbarHostMarkers = [
    'id="markdownToolbarHost"',
    '#markdownToolbarHost',
    'flex: 1 1 0;',
    'function applyMarkdownToolbarLayout',
    "document.body.classList.toggle('sticky-toolbar-enabled', stickyToolbar);"
];

for (const marker of requiredMarkdownToolbarHostMarkers) {
    if (![provider, webview, css].some(source => source.includes(marker))) {
        throw new Error(`Markdown toolbar host layout marker is missing: ${marker}`);
    }
}

if (
    webview.includes('applyToolbarLayout(toolbarManager') ||
    webview.includes('mainToolbar.parentNode.insertBefore(fmtToolbar')
) {
    throw new Error('Markdown must not reparent its format toolbar through the shared fixed-header layout.');
}

const requiredEditViewportMarkers = [
    'function focusWithoutViewportScroll',
    'element.focus({ preventScroll: true });',
    'height: 100vh;',
    'min-height: 0;',
    'body:not(.sticky-toolbar-enabled).edit-mode',
    'body:not(.sticky-toolbar-enabled).edit-mode #content',
    'body.edit-mode #content',
    'overflow-anchor: none;',
    'let renderEpoch = 0;',
    'let activeRenderEpoch = 0;',
    "command: 'reportScrollDiagnostics'",
    "if (target === document || target === document.documentElement || target === document.body)",
    "case 'reportScrollDiagnostics'",
    'if (activeRenderEpoch === renderEpoch) return;'
];

for (const marker of requiredEditViewportMarkers) {
    if (![provider, webview, css, messageSchema].some(source => source.includes(marker))) {
        throw new Error(`Markdown edit-mode viewport guard is missing: ${marker}`);
    }
}

if (css.includes('body {\n    overflow-anchor: none;')) {
    throw new Error('Markdown must not disable scroll anchoring globally.');
}

const requiredOutlineTreeMarkers = [
    '.toc-level-1 { padding-left: 2px;',
    '.toc-level-2 { padding-left: 22px;',
    '.toc-level-3 { padding-left: 42px;',
    '.toc-level-4 { padding-left: 62px;',
    '.toc-level-5 { padding-left: 82px;',
    '.toc-level-6 { padding-left: 102px;',
    'overflow-wrap: anywhere;',
    'box-shadow: inset 2px 0 0 var(--accent-color);'
];

for (const marker of requiredOutlineTreeMarkers) {
    if (!css.includes(marker)) {
        throw new Error(`Markdown outline hierarchy marker is missing: ${marker}`);
    }
}

const activeOutlineRule = css.match(/\.toc-item a\.active\s*\{([^}]*)\}/)?.[1] ?? '';
if (activeOutlineRule.includes('margin-left')) {
    throw new Error('Markdown outline active item must not shift horizontally.');
}

const requiredSimplifiedChineseUiMarkers = [
    'label: \'分栏编辑\'',
    'tooltip: \'左右分栏编辑 Markdown\'',
    'section: \'Markdown 外观\'',
    'label: \'固定工具栏\'',
    'label: \'首行作为表头\'',
    'tooltip: \'工作表设置\'',
    '提示：',
    'title="加粗（Ctrl+B）"'
];

for (const marker of requiredSimplifiedChineseUiMarkers) {
    if (![provider, webview, toolbarManager, messageSchema,
        readFileSync('src/webviews/spreadsheet/components/spreadsheetToolbarComponent.ts', 'utf8'),
        readFileSync('src/webviews/spreadsheet/components/spreadsheetSettingsComponent.ts', 'utf8'),
        readFileSync('src/webviews/shared/infoTooltip.ts', 'utf8')
    ].some(source => source.includes(marker))) {
        throw new Error(`Simplified Chinese core UI marker is missing: ${marker}`);
    }
}

const requiredThemeFallbacks = [
    'color: var(--xlsx-viewer-md-preview-color, var(--text-color));',
    'background: var(--xlsx-viewer-md-preview-background, var(--bg-color));',
    "style.removeProperty(property);"
];

for (const marker of requiredThemeFallbacks) {
    if (![webview, css].some(source => source.includes(marker))) {
        throw new Error(`Markdown dark-theme fallback is missing: ${marker}`);
    }
}

if (css.includes('--xlsx-viewer-md-preview-background: var(--bg-color);') || css.includes('--xlsx-viewer-md-preview-color: var(--text-color);')) {
    throw new Error('Markdown preview colors must not be fixed to the root light-theme variables.');
}

const requiredTableThemeMarkers = [
    '.markdown-preview table.md-table tbody tr:nth-child(even) td',
    'background: var(--table-row-alt-bg, color-mix(in srgb, var(--bg-color) 90%, var(--text-color) 10%));',
    '--table-row-alt-bg: #27272a;'
];

for (const marker of requiredTableThemeMarkers) {
    if (![css, sharedThemeCss].some(source => source.includes(marker))) {
        throw new Error(`Markdown table dark-theme rule is missing: ${marker}`);
    }
}

if (!existsSync('dist/md/mdWebview.js')) {
    throw new Error('Missing build output: run npm run compile before verify:local-patch.');
}

const MarkdownIt = require('markdown-it');
const markdownItMark = require('markdown-it-mark');
const html = new MarkdownIt({ html: true })
    .use(markdownItMark)
    .render('普通 <mark>HTML 标记</mark>，以及 ==扩展语法==。');

if (!html.includes('<mark>HTML 标记</mark>') || !html.includes('<mark>扩展语法</mark>')) {
    throw new Error('Markdown mark rendering smoke test failed.');
}

console.log('Local Markdown appearance patch verification: PASS');
