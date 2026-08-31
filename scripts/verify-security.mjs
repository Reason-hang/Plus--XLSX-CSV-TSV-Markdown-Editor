import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Excel = require('exceljs');
const MarkdownIt = require('markdown-it');
const { getCellValueForDisplay } = require(path.join(projectRoot, 'out/spreadsheet/cellValue.js'));
const markdownItKatex = require(path.join(projectRoot, 'out/webviews/md/markdownItKatex.js')).default;
const { renderCellContent, createXlsxRowHtml } = require(path.join(projectRoot, 'out/webviews/spreadsheet/components/spreadsheetRenderComponent.js'));
const { isAllowedExternalUri } = require(path.join(projectRoot, 'out/shared/externalUri.js'));
const { isPathWithin } = require(path.join(projectRoot, 'out/shared/pathSafety.js'));

const workbook = new Excel.Workbook();
const worksheet = workbook.addWorksheet('Security Test');
worksheet.getCell('A1').value = 0;
worksheet.getCell('A2').value = false;
worksheet.getCell('A3').value = { formula: '1+1', result: 0 };
worksheet.getCell('A4').value = {
    richText: [
        { text: '<img src=x onerror=alert(1)>', font: { bold: true, color: { argb: 'FFFF0000' } } }
    ]
};

assert.equal(getCellValueForDisplay(worksheet.getCell('A1')), '0', 'numeric zero must remain visible');
assert.equal(getCellValueForDisplay(worksheet.getCell('A2')), 'FALSE', 'boolean false must remain visible');
assert.equal(getCellValueForDisplay(worksheet.getCell('A3')), '0', 'formula result zero must remain visible');
const richTextDisplay = getCellValueForDisplay(worksheet.getCell('A4'));
assert.match(richTextDisplay, /&lt;img src=x onerror=alert\(1\)&gt;/, 'rich text source must be escaped');
assert.match(richTextDisplay, /<b>.*<\/b>/, 'trusted rich text formatting must remain');
assert.match(richTextDisplay, /<span style="color: #FF0000;">/, 'trusted rich text color must remain');

const ordinaryCellHtml = renderCellContent({ value: '<img src=x onerror=alert(1)>', cellType: 'text' }, false, false, false);
assert.match(ordinaryCellHtml, /&lt;img/);
assert.doesNotMatch(ordinaryCellHtml, /<img\b/);

const attributeInjection = createXlsxRowHtml({
    rowData: {
        rowNumber: 1,
        cells: [{
            rowNumber: 1,
            colNumber: 1,
            value: 'safe',
            originalColor: 'red" onmouseover="alert(1)',
            hyperlink: 'https://example.com/?q="x"'
        }]
    },
    rowIndex: 0,
    rowHeight: 24,
    columnCount: 1,
    columnWidths: [80],
    isPlainView: false,
    isEditMode: false,
    allowInteractiveControls: false
});
assert.doesNotMatch(attributeInjection, /data-original-color="red"\s+onmouseover=/);
assert.doesNotMatch(attributeInjection, /data-hyperlink="https:\/\/example\.com\/\?q="x"/);

assert.equal(isAllowedExternalUri('https://example.com'), true);
assert.equal(isAllowedExternalUri('mailto:test@example.com'), true);
assert.equal(isAllowedExternalUri('javascript:alert(1)'), false);
assert.equal(isAllowedExternalUri('file:///etc/passwd'), false);
assert.equal(isAllowedExternalUri('vscode://file/etc/passwd'), false);

assert.equal(isPathWithin('/workspace/project', '/workspace/project/notes/a.md'), true);
assert.equal(isPathWithin('/workspace/project', '/workspace/project/../secret.txt'), false);

const mdProviderSource = readFileSync(path.join(projectRoot, 'src/mdEditorProvider.ts'), 'utf8');
const mdWebviewSource = readFileSync(path.join(projectRoot, 'src/webviews/md/mdWebview.ts'), 'utf8');
const spreadsheetProviderSource = readFileSync(path.join(projectRoot, 'src/spreadsheetEditorProvider.ts'), 'utf8');
const spreadsheetShellSource = readFileSync(path.join(projectRoot, 'src/spreadsheet/spreadsheetHtmlRenderer.ts'), 'utf8');
const conversionSource = readFileSync(path.join(projectRoot, 'src/shared/fileConversionService.ts'), 'utf8');
const themeSource = readFileSync(path.join(projectRoot, 'src/shared/markdownThemeService.ts'), 'utf8');
const markdownItKatexSource = readFileSync(path.join(projectRoot, 'src/webviews/md/markdownItKatex.ts'), 'utf8');

const mathMarkdown = new MarkdownIt({ html: true });
mathMarkdown.use(markdownItKatex);
const mathHtml = mathMarkdown.render('inline $x^2$\n\n$$y^2$$');
assert.match(mathHtml, /class="katex"/, 'KaTeX formulas must still render');
assert.doesNotMatch(mathHtml, /<script\b/i, 'KaTeX output must not contain scripts');
const dangerousMathHtml = mathMarkdown.render(String.raw`$\href{javascript:alert(1)}{x}$`);
assert.doesNotMatch(dangerousMathHtml, /<a\b[^>]*javascript:/i, 'KaTeX must not create executable javascript links');

assert.match(mdWebviewSource, /function sanitizeRenderedMarkdownHtml/);
assert.match(mdWebviewSource, /preview\.innerHTML = sanitizeRenderedMarkdownHtml/);
assert.doesNotMatch(mdProviderSource, /script-src [^;]*'unsafe-inline'/);
assert.doesNotMatch(spreadsheetShellSource, /script-src [^;]*'unsafe-inline'/);
assert.match(mdProviderSource, /write(Buffer|Text)FileAtomically/);
assert.match(mdProviderSource, /migrateLegacyHistory[\s\S]*VERSION_HISTORY_MAX_ENTRIES/);
assert.match(mdProviderSource, /case 'restoreVersion'[\s\S]*?await assertFileUnchanged\(\)/);
assert.match(mdProviderSource, /KaTeX\/0\.16\.47\/katex\.min\.css/);
assert.doesNotMatch(mdProviderSource, /KaTeX\/0\.6\.0\/katex\.min\.css/);
assert.match(spreadsheetProviderSource, /message\?\.command === 'restoreVersion'[\s\S]*?await assertFileUnchanged\(\)/);
assert.doesNotMatch(conversionSource, /csvSeparatorOverride/);
assert.match(conversionSource, /replace\(\/\^\\uFEFF\//);
assert.match(conversionSource, /writeFileAtomically/);
assert.ok(themeSource.includes('url\\s*\\([^)]*\\bvar\\s*\\('), 'theme CSS must reject url(var(...))');
assert.match(mdWebviewSource, /script, style, iframe/);
assert.match(mdWebviewSource, /securityLevel: ['"]strict['"]/);
assert.ok(mdWebviewSource.includes('data:image\\/(?:png|gif|jpe?g|webp|bmp|avif)'), 'rendered images must use a restricted data URI allowlist');
assert.ok(mdWebviewSource.includes('class="mermaid"${dataLine}>${md.utils.escapeHtml(code)}</div>'), 'Mermaid source must be rendered as text');
assert.ok(mdWebviewSource.includes('class="language-${escapeHtmlAttr(langName)}'), 'code language class must be attribute escaped');
assert.doesNotMatch(mdWebviewSource, /markdown-it-katex/, 'the vulnerable markdown-it-katex package must not be used');
assert.match(markdownItKatexSource, /katex\.renderToString/);
assert.match(markdownItKatexSource, /trust: false/);

console.log('安全与回归测试：PASS');
