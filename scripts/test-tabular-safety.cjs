const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const JSZip = require('jszip');

const vscode = { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args); };
const { readTabularFile, writeTabularFile } = require('../out/shared/fileConversionService');
const { assertXlsxRoundTripSupported } = require('../out/shared/xlsxRoundTripSafety');
Module._load = originalLoad;

(async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tabular-safety-207-'));
    try {
        const csv = path.join(root, 'sample.csv');
        const original = '\uFEFF"姓名",数值\r\n"张三",1\r\n';
        await fs.promises.writeFile(csv, original);
        const parsed = (await readTabularFile(csv, 'csv')).workbook;
        await writeTabularFile(csv, parsed, 'csv');
        assert.strictEqual(await fs.promises.readFile(csv, 'utf8'), original);
        parsed.sheets[0].rows[1][1] = '2';
        await writeTabularFile(csv, parsed, 'csv');
        assert.strictEqual(await fs.promises.readFile(csv, 'utf8'), '\uFEFF"姓名",数值\r\n"张三",2\r\n');
        const invalid = path.join(root, 'invalid.csv');
        await fs.promises.writeFile(invalid, Buffer.from([0xff, 0xfe]));
        await assert.rejects(readTabularFile(invalid, 'csv'), /UTF-8/);
        assert.deepStrictEqual(await fs.promises.readFile(invalid), Buffer.from([0xff, 0xfe]));
        const workbook = path.join(root, 'chart.xlsx');
        const zip = new JSZip();
        zip.file('xl/charts/chart1.xml', '<chart/>');
        const bytes = await zip.generateAsync({ type: 'nodebuffer' });
        await fs.promises.writeFile(workbook, bytes);
        await assert.rejects(assertXlsxRoundTripSupported(workbook), /无法保真保存/);
        assert.deepStrictEqual(await fs.promises.readFile(workbook), bytes);
        console.log('表格安全测试：CSV 无变更字节、BOM、换行、非法编码及 XLSX 图表保护均通过。');
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
