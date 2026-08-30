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

for (const [key, expectedDefault] of Object.entries(requiredDefaults)) {
    if (config[key]?.default !== expectedDefault) {
        throw new Error(`Missing or changed local patch setting: ${key}`);
    }
}

const provider = readFileSync('src/mdEditorProvider.ts', 'utf8');
const webview = readFileSync('src/webviews/md/mdWebview.ts', 'utf8');
const css = readFileSync('resources/md/mdWebview.css', 'utf8');
const requiredSourceMarkers = [
    'getMarkdownSettings',
    'applyMarkdownAppearance',
    '--xlsx-viewer-md-mark-background',
    'background-color: var(--xlsx-viewer-md-mark-background)'
];

for (const marker of requiredSourceMarkers) {
    if (![provider, webview, css].some(source => source.includes(marker))) {
        throw new Error(`Local patch source marker is missing: ${marker}`);
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
