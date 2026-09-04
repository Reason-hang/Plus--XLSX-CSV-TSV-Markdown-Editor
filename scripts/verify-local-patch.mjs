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
    'xlsxViewer.md.previewBackgroundColor': '',
    'xlsxViewer.md.previewTextColor': '',
    'xlsxViewer.md.previewFontSize': '',
    'xlsxViewer.md.previewLineHeight': ''
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

for (const [key, expectedDefault] of Object.entries(requiredThemeDefaults)) {
    if (config[key]?.default !== expectedDefault) {
        throw new Error(`Missing or changed Markdown theme setting: ${key}`);
    }
}

const provider = readFileSync('src/mdEditorProvider.ts', 'utf8');
const webview = readFileSync('src/webviews/md/mdWebview.ts', 'utf8');
const css = readFileSync('resources/md/mdWebview.css', 'utf8');
const requiredSourceMarkers = [
    'getMarkdownSettings',
    'applyMarkdownAppearance',
    '--xlsx-viewer-md-mark-background',
    'background-color: var(--xlsx-viewer-md-mark-background)',
    'MarkdownThemeService',
    'applyExternalMarkdownTheme',
    'md-sidebar-toc',
    "case 'highlight': wrapSelection(editor, '<mark>', '</mark>');",
    "e.code === 'Digit3'"
];

for (const marker of requiredSourceMarkers) {
    if (![provider, webview, css].some(source => source.includes(marker))) {
        throw new Error(`Local patch source marker is missing: ${marker}`);
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
    'background: color-mix(in srgb, var(--bg-color) 94%, var(--text-color) 6%);'
];

for (const marker of requiredTableThemeMarkers) {
    if (!css.includes(marker)) {
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
