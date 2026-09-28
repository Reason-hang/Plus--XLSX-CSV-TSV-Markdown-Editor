import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderCellContent } from '../webviews/spreadsheet/components/spreadsheetRenderComponent';
import { readTabularFile, writeTabularFile } from '../shared/fileConversionService';
import { validateWebviewMessage } from '../shared/webviewMessageSchema';
import { isPathWithinRealpath } from '../shared/pathSafety';
import { StyleStorageService, STYLE_STORAGE_LIMITS } from '../shared/styleStorageService';
import { writeTextFileAtomically } from '../shared/atomicFile';
import { assertXlsxRoundTripSupported } from '../shared/xlsxRoundTripSafety';
import { buildInlineListFormula } from '../shared/inlineListFormula';
import JSZip from 'jszip';
import { isSafeSnapshotFile } from '../shared/versionHistory';

describe('security and reliability regressions', () => {
    it('escapes styled spreadsheet text before it becomes HTML', () => {
        const payload = '<img src=x onerror="window.__xss = true">';
        const html = renderCellContent({ value: payload, cellType: 'text' }, false, false, false);

        assert.ok(html.includes('&lt;img src=x onerror=&quot;window.__xss = true&quot;&gt;'));
        assert.ok(!html.includes('<img src=x'));
    });

    it('removes an UTF-8 BOM from the first CSV field', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-bom-'));
        const csvPath = path.join(directory, 'bom.csv');
        try {
            await fs.promises.writeFile(csvPath, '\uFEFFname,value\nAlice,1\n', 'utf8');
            const { workbook } = await readTabularFile(csvPath, 'csv');
            assert.deepStrictEqual(workbook.sheets[0].rows[0], ['name', 'value']);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('replaces CSV files without leaving a temporary file behind', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-atomic-'));
        const csvPath = path.join(directory, 'data.csv');
        try {
            await fs.promises.writeFile(csvPath, 'old\n', 'utf8');
            await writeTabularFile(csvPath, { sheets: [{ name: 'Sheet1', rows: [['new', 'value']] }] }, 'csv');

            assert.strictEqual(await fs.promises.readFile(csvPath, 'utf8'), 'new,value\n');
            const names = await fs.promises.readdir(directory);
            assert.deepStrictEqual(names, ['data.csv']);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('preserves UTF-8 BOM, CRLF and quoted CSV fields when one cell changes', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-csv-format-'));
        const csvPath = path.join(directory, 'data.csv');
        try {
            await fs.promises.writeFile(csvPath, '\uFEFF"name","value"\r\n"Alice","1"\r\n', 'utf8');
            const { workbook } = await readTabularFile(csvPath, 'csv');
            workbook.sheets[0].rows[1][1] = '2';
            await writeTabularFile(csvPath, workbook, 'csv');
            assert.strictEqual(await fs.promises.readFile(csvPath, 'utf8'), '\uFEFF"name","value"\r\n"Alice","2"\r\n');
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('refuses a non-UTF-8 CSV save without altering the original bytes', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-gbk-'));
        const csvPath = path.join(directory, 'data.csv');
        const original = Buffer.from([0xC4, 0xE3, 0xBA, 0xC3, 0x2C, 0x31, 0x0A]);
        try {
            await fs.promises.writeFile(csvPath, original);
            await assert.rejects(() => writeTabularFile(csvPath, { sheets: [{ name: 'Sheet1', rows: [['other', '2']] }] }, 'csv'), /UTF-8/);
            assert.deepStrictEqual(await fs.promises.readFile(csvPath), original);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('keeps a symlink while atomically replacing its target', async () => {
        if (process.platform === 'win32') {return;}
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-link-'));
        const target = path.join(directory, 'target.md');
        const link = path.join(directory, 'linked.md');
        try {
            await fs.promises.writeFile(target, 'old');
            await fs.promises.symlink(target, link);
            await writeTextFileAtomically(link, 'new');
            assert.ok((await fs.promises.lstat(link)).isSymbolicLink());
            assert.strictEqual(await fs.promises.readFile(target, 'utf8'), 'new');
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('rejects XLSX round-trip when unsupported chart parts are present', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-chart-'));
        const xlsxPath = path.join(directory, 'chart.xlsx');
        try {
            const zip = new JSZip();
            zip.file('xl/workbook.xml', '<workbook/>');
            zip.file('xl/charts/chart1.xml', '<chart/>');
            await fs.promises.writeFile(xlsxPath, await zip.generateAsync({ type: 'nodebuffer' }));
            await assert.rejects(() => assertXlsxRoundTripSupported(xlsxPath), /无法保真保存/);
            assert.match(buildInlineListFormula(['A"B', 'C']), /^"A""B,C"$/);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('replaces XLSX files without leaving a temporary file behind', async () => {
        const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-atomic-xlsx-'));
        const xlsxPath = path.join(directory, 'data.xlsx');
        try {
            await writeTabularFile(xlsxPath, { sheets: [{ name: 'Sheet1', rows: [['new', 'value']] }] }, 'xlsx');

            const { workbook } = await readTabularFile(xlsxPath, 'xlsx');
            assert.deepStrictEqual(workbook.sheets[0].rows[0], ['new', 'value']);
            const names = await fs.promises.readdir(directory);
            assert.deepStrictEqual(names, ['data.xlsx']);
        } finally {
            await fs.promises.rm(directory, { recursive: true, force: true });
        }
    });

    it('rejects invalid or oversized Webview messages before dispatch', () => {
        assert.equal(isSafeSnapshotFile('abc123.xlsx', ['xlsx']), true);
        assert.equal(isSafeSnapshotFile('../abc123.xlsx', ['xlsx']), false);
        assert.equal(validateWebviewMessage({ command: 'unknown' }, 'markdown').ok, false);
        assert.equal(validateWebviewMessage({ command: 'saveMarkdown', text: 'x'.repeat(8 * 1024 * 1024 + 1) }, 'markdown').ok, false);
        assert.equal(validateWebviewMessage({
            command: 'saveXlsxEdits',
            sheetIndex: 0,
            edits: [{ row: Number.NaN, col: 1, value: 'bad' }],
            richEdits: [],
            styleEdits: [],
            operations: [],
            isAutosave: false
        }, 'spreadsheet').ok, false);
        assert.equal(validateWebviewMessage({ command: 'restoreVersion' }, 'markdown').ok, true);
        assert.equal(validateWebviewMessage({ command: 'restoreVersion' }, 'spreadsheet').ok, false);
        assert.equal(validateWebviewMessage({ command: 'setLanguage', language: 'zh' }, 'markdown').ok, true);
        assert.equal(validateWebviewMessage({ command: 'setLanguage', language: 'invalid' }, 'markdown').ok, false);
        assert.equal(validateWebviewMessage({ command: 'updateSettings', settings: { previewPosition: 'invalid' } }, 'markdown').ok, false);
        assert.equal(validateWebviewMessage({
            command: 'saveXlsxEdits',
            sheetIndex: 0,
            edits: [],
            richEdits: [],
            styleEdits: [],
            operations: [{ type: 'insertControl', row: 1, col: 1, controlType: 'checkbox', defaultValue: 123 }],
            isAutosave: false
        }, 'spreadsheet').ok, false);
        assert.equal(validateWebviewMessage({
            command: 'saveXlsxEdits',
            sheetIndex: 0,
            edits: [],
            richEdits: [],
            styleEdits: [],
            operations: [{ type: 'insertColumnRight', index: 16_385 }],
            isAutosave: false
        }, 'spreadsheet').ok, false);
    });

    it('rejects symlink escape paths after realpath resolution', async () => {
        if (process.platform === 'win32') {return;}
        const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-realpath-test-'));
        const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-realpath-outside-'));
        const link = path.join(root, 'linked');
        try {
            await fs.promises.symlink(outside, link, 'dir');
            assert.equal(await isPathWithinRealpath(root, path.join(root, 'safe.txt')), true);
            assert.equal(await isPathWithinRealpath(root, path.join(link, 'secret.txt')), false);
        } finally {
            await fs.promises.rm(root, { recursive: true, force: true });
            await fs.promises.rm(outside, { recursive: true, force: true });
        }
    });

    it('keeps the previous StyleStorage value when capacity is exceeded', async () => {
        const values = new Map<string, unknown>();
        const context = {
            workspaceState: {
                get: <T>(key: string, fallback?: T) => values.has(key) ? values.get(key) as T : fallback as T,
                update: async (key: string, value: unknown) => {
                    if (value === undefined) {values.delete(key);}
                    else {values.set(key, value);}
                }
            }
        } as unknown as import('vscode').ExtensionContext;
        const service = new StyleStorageService(context);
        const uri = { fsPath: path.join(os.tmpdir(), 'style-capacity.csv') } as import('vscode').Uri;
        await service.saveMetadata(uri, { cells: { '1:1': { style: { color: '#fff' } } }, merges: [] });
        const key = `xlsxViewer.styles.${uri.fsPath.toLowerCase()}`;
        const previous = values.get(key);
        const oversizedCells = Object.fromEntries(Array.from({ length: STYLE_STORAGE_LIMITS.maxCells + 1 }, (_, index) => [
            `${index + 1}:1`,
            { style: { color: '#fff' } }
        ]));
        await assert.rejects(() => service.saveMetadata(uri, { cells: oversizedCells, merges: [] }), /STYLE_METADATA_LIMIT_EXCEEDED|不能超过/);
        assert.deepStrictEqual(values.get(key), previous);
    });

});
