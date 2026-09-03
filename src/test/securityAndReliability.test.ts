import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderCellContent } from '../webviews/spreadsheet/components/spreadsheetRenderComponent';
import { readTabularFile, writeTabularFile } from '../shared/fileConversionService';
import { VERSION_HISTORY_MAX_ENTRIES, limitVersionHistoryEntries } from '../shared/versionHistory';

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

    it('caps Markdown version history entries', () => {
        const entries = Array.from({ length: VERSION_HISTORY_MAX_ENTRIES + 1 }, (_, index) => index);
        const limited = limitVersionHistoryEntries(entries);

        assert.strictEqual(limited.length, VERSION_HISTORY_MAX_ENTRIES);
        assert.strictEqual(limited[0], 1);
    });
});
