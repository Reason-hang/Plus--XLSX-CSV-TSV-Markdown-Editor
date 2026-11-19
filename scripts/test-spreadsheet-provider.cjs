// Exercise actual provider messages against temporary CSV/XLSX files and a mocked IDE API.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const Excel = require('exceljs');
const JSZip = require('jszip');
const crypto = require('crypto');

const uri = filePath => ({ fsPath: filePath, scheme: 'file', toString: () => `file://${filePath}` });
const disposable = { dispose() {} };
const vscode = {
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class {},
    QuickPickItemKind: { Separator: -1 },
    env: { language: 'zh-cn', clipboard: { readText: async () => '' } },
    workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        onDidChangeConfiguration: () => disposable,
        createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} })
    },
    window: {
        onDidChangeActiveColorTheme: () => disposable,
        activeColorTheme: { kind: 1 },
        showErrorMessage: message => { throw new Error(message); }
    }
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args); };
const { SpreadsheetEditorProvider } = require('../out/spreadsheetEditorProvider');
Module._load = originalLoad;

function memento() {
    const data = new Map();
    return { get: (key, fallback) => data.has(key) ? data.get(key) : fallback, update: async (key, value) => { data.set(key, value); } };
}

async function setup(root, filePath) {
    const sent = [];
    let receive;
    const webview = {
        options: {}, cspSource: "'self'", asWebviewUri: value => value,
        postMessage: async message => { sent.push(message); },
        onDidReceiveMessage: handler => { receive = handler; }
    };
    const panel = { webview, onDidDispose() {} };
    const provider = new SpreadsheetEditorProvider({ globalState: memento(), workspaceState: memento(), globalStorageUri: uri(path.join(root, 'storage')), extensionUri: uri(root) });
    await provider.resolveCustomEditor({ uri: uri(filePath) }, panel, {});
    assert.ok(receive, 'provider did not register a message handler');
    await receive({ command: 'webviewReady' });
    return { receive, sent };
}

const edit = value => ({ command: 'saveXlsxEdits', sheetIndex: 0, edits: [{ row: 1, col: 1, value }], richEdits: [], styleEdits: [], operations: [], isAutosave: false });

(async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sheet-provider-207-'));
    try {
        const csv = path.join(root, 'test.csv');
        await fs.promises.writeFile(csv, '\uFEFF原内容,2\r\n');
        const csvView = await setup(root, csv);
        await csvView.receive(edit('新内容'));
        assert.strictEqual(await fs.promises.readFile(csv, 'utf8'), '\uFEFF新内容,2\r\n');
        assert.ok(csvView.sent.some(message => message.command === 'saveResult' && message.ok));
        const csvKey = crypto.createHash('sha1').update(csv).digest('hex');
        const csvHistory = JSON.parse(await fs.promises.readFile(path.join(root, 'storage', '.history', `csv-${csvKey}`, 'index.json'), 'utf8'));
        assert.strictEqual(csvHistory.length, 2, 'CSV 编辑后应保留新快照');
        await fs.promises.writeFile(csv, '外部修改,2\r\n');
        await csvView.receive(edit('不应写入'));
        assert.strictEqual(await fs.promises.readFile(csv, 'utf8'), '外部修改,2\r\n');
        assert.ok(csvView.sent.some(message => message.command === 'saveResult' && !message.ok && /外部修改/.test(message.error)));

        const xlsx = path.join(root, 'test.xlsx');
        const initial = new Excel.Workbook();
        initial.addWorksheet('Sheet1').getCell('A1').value = '原内容';
        await initial.xlsx.writeFile(xlsx);
        const xlsxView = await setup(root, xlsx);
        await xlsxView.receive(edit('新内容'));
        const saved = new Excel.Workbook();
        await saved.xlsx.readFile(xlsx);
        assert.strictEqual(saved.getWorksheet('Sheet1').getCell('A1').value, '新内容');
        assert.ok(xlsxView.sent.some(message => message.command === 'saveResult' && message.ok));
        saved.getWorksheet('Sheet1').getCell('A1').value = '外部修改';
        await saved.xlsx.writeFile(xlsx);
        const externalBytes = await fs.promises.readFile(xlsx);
        await xlsxView.receive(edit('不应写入'));
        assert.deepStrictEqual(await fs.promises.readFile(xlsx), externalBytes);
        assert.ok(xlsxView.sent.some(message => message.command === 'saveResult' && !message.ok && /外部修改/.test(message.error)));

        const chartFile = path.join(root, 'chart.xlsx');
        const archive = await JSZip.loadAsync(externalBytes);
        archive.file('xl/charts/chart1.xml', '<chart/>');
        const chartBytes = await archive.generateAsync({ type: 'nodebuffer' });
        await fs.promises.writeFile(chartFile, chartBytes);
        const chartView = await setup(root, chartFile);
        await chartView.receive(edit('不应写入'));
        assert.deepStrictEqual(await fs.promises.readFile(chartFile), chartBytes);
        assert.ok(chartView.sent.some(message => message.command === 'saveResult' && !message.ok && /无法保真保存/.test(message.error)));

        const unsafe = path.join(root, 'unsafe.csv');
        const outside = path.join(root, 'do-not-delete.csv');
        await fs.promises.writeFile(unsafe, '原文件');
        await fs.promises.writeFile(outside, '保留');
        const unsafeKey = crypto.createHash('sha1').update(unsafe).digest('hex');
        const unsafeHistory = path.join(root, 'storage', '.history', `csv-${unsafeKey}`);
        await fs.promises.mkdir(unsafeHistory, { recursive: true });
        const invalidIndex = JSON.stringify([{ id: 'bad', timestamp: 1, snapshotFile: '../../do-not-delete.csv' }]);
        await fs.promises.writeFile(path.join(unsafeHistory, 'index.json'), invalidIndex);
        const previousConsoleError = console.error;
        const errors = [];
        let unsafeView;
        try {
            console.error = (...args) => { errors.push(args); };
            unsafeView = await setup(root, unsafe);
        } finally {
            console.error = previousConsoleError;
        }
        assert.strictEqual(await fs.promises.readFile(outside, 'utf8'), '保留');
        assert.strictEqual(await fs.promises.readFile(path.join(unsafeHistory, 'index.json'), 'utf8'), invalidIndex);
        assert.ok(unsafeView.sent.some(message => message.command === 'versionHistoryError'));
        assert.ok(errors.some(args => args.some(arg => /索引无效/.test(String(arg)))));
        console.log('表格 Provider 消息测试：保存、外部修改、复杂工作簿与非法历史索引均通过。');
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
