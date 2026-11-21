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
let offeredVersions = [];
const textFallbacks = [];
const warnings = [];
const vscode = {
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class {},
    QuickPickItemKind: { Separator: -1 },
    env: { language: 'zh-cn', clipboard: { readText: async () => '' } },
    commands: { executeCommand: async (command, target, editor) => { textFallbacks.push({ command, target, editor }); } },
    workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        onDidChangeConfiguration: () => disposable,
        createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} })
    },
    window: {
        onDidChangeActiveColorTheme: () => disposable,
        activeColorTheme: { kind: 1 },
        showQuickPick: async items => { offeredVersions = items; },
        showWarningMessage: async message => { warnings.push(message); },
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

async function setup(root, filePath, expectFallback = false) {
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
    if (expectFallback) {
        const fallback = textFallbacks.at(-1);
        assert.deepStrictEqual([fallback.command, fallback.target.fsPath, fallback.editor], ['vscode.openWith', filePath, 'default']);
        assert.match(warnings.at(-1), /上限.*默认文本编辑器/);
        if (receive) await receive({ command: 'webviewReady' });
        assert.ok(!sent.some(message => message.command === 'initVirtualTable' || message.command === 'versionHistoryError'));
        return { receive, sent };
    }
    assert.ok(receive, 'provider did not register a message handler');
    await receive({ command: 'webviewReady' });
    return { receive, sent };
}

const edit = value => ({ command: 'saveXlsxEdits', sheetIndex: 0, edits: [{ row: 1, col: 1, value }], richEdits: [], styleEdits: [], operations: [], isAutosave: false });
const structureEdit = operation => ({ ...edit(''), edits: [], operations: [operation] });

(async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sheet-provider-207-'));
    try {
        const csv = path.join(root, 'test.csv');
        await fs.promises.writeFile(csv, '\uFEFF原内容,2\r\n');
        const csvView = await setup(root, csv);
        await csvView.receive(edit('新内容'));
        assert.strictEqual(await fs.promises.readFile(csv, 'utf8'), '\uFEFF新内容,2\r\n');
        assert.ok(csvView.sent.some(message => message.command === 'saveResult' && message.ok));

        const quotedCsv = path.join(root, 'quoted.csv');
        await fs.promises.writeFile(quotedCsv, '\uFEFF"旧""引号","第一行\r\n第二行"\r\n');
        const quotedView = await setup(root, quotedCsv);
        await quotedView.receive(edit('新"引号'));
        assert.strictEqual(await fs.promises.readFile(quotedCsv, 'utf8'), '\uFEFF"新""引号","第一行\r\n第二行"\r\n');
        assert.strictEqual(quotedView.sent.at(-1).ok, true);

        const gbkCsv = path.join(root, 'gbk.csv');
        const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 44, 50, 10]);
        await fs.promises.writeFile(gbkCsv, gbk);
        await assert.rejects(setup(root, gbkCsv), /不是有效的 UTF-8/);
        assert.deepStrictEqual(await fs.promises.readFile(gbkCsv), gbk);
        const csvKey = crypto.createHash('sha1').update(csv).digest('hex');
        const csvHistoryDir = path.join(root, 'storage', '.history', `csv-${csvKey}`);
        const historyIndexPath = path.join(csvHistoryDir, 'index.json');
        const csvHistory = JSON.parse(await fs.promises.readFile(historyIndexPath, 'utf8'));
        assert.strictEqual(csvHistory.length, 2, 'CSV 编辑后应保留新快照');
        await fs.promises.unlink(path.join(csvHistoryDir, csvHistory[0].snapshotFile));
        await csvView.receive(edit('历史可用'));
        assert.ok(!csvView.sent.some(message => message.command === 'saveWarning'), '缺失的快照不得干扰保存');
        const repairedHistory = JSON.parse(await fs.promises.readFile(historyIndexPath, 'utf8'));
        assert.strictEqual(repairedHistory.length, 2);
        assert.strictEqual(repairedHistory[0].id, csvHistory[1].id, '应保留仍存在的快照');
        await csvView.receive({ command: 'showVersionHistory' });
        assert.deepStrictEqual(offeredVersions.filter(item => item.entry).map(item => item.entry.id), repairedHistory.map(entry => entry.id).reverse());
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
        const editedXlsxBytes = await fs.promises.readFile(xlsx);
        for (const type of ['deleteCellShiftUp', 'deleteCellShiftLeft']) {
            await xlsxView.receive(structureEdit({ type, row: 9, col: 1 }));
            assert.deepStrictEqual(await fs.promises.readFile(xlsx), editedXlsxBytes);
            const result = xlsxView.sent.at(-1);
            assert.strictEqual(result.ok, false);
            assert.match(result.error, /超出已有表格范围/);
        }
        saved.getWorksheet('Sheet1').getCell('A1').value = '外部修改';
        await saved.xlsx.writeFile(xlsx);
        const externalBytes = await fs.promises.readFile(xlsx);
        await xlsxView.receive(edit('不应写入'));
        assert.deepStrictEqual(await fs.promises.readFile(xlsx), externalBytes);
        assert.ok(xlsxView.sent.some(message => message.command === 'saveResult' && !message.ok && /外部修改/.test(message.error)));

        const numericalFile = path.join(root, 'numerical.xlsx');
        const numericalWorkbook = new Excel.Workbook();
        const numericalSheet = numericalWorkbook.addWorksheet('Numbers');
        numericalSheet.getColumn('A').values = [5, 3.14, 4, '编号', 1, null, 2, 8, 9, 10];
        numericalSheet.getCell('B1').value = { formula: 'SUM(A1:A2)', result: 8.14 };
        numericalSheet.getCell('B2').value = '旧文字';
        numericalSheet.getCell('B3').value = true;
        numericalSheet.getCell('B4').value = new Date(Date.UTC(2026, 10, 18));
        await numericalWorkbook.xlsx.writeFile(numericalFile);
        const numericalView = await setup(root, numericalFile);
        await numericalView.receive(edit('7'));
        assert.strictEqual(numericalView.sent.at(-1).ok, true);
        const edits = ['-2.5', '007', '000000123', '123456789012345678', '123', '50%', '123456789012345', '0', `0.${'0'.repeat(330)}1`]
            .map((value, index) => ({ row: index + 2, col: 1, value }));
        edits.push({ row: 3, col: 2, value: 'false' }, { row: 4, col: 2, value: '2026-11-19' });
        const richEdits = edits.map(({ row, col, value }) => ({ row, col, runs: [{ text: value }] }));
        richEdits.push({ row: 2, col: 2, runs: [{ text: '有样式', bold: true }, { text: '正常' }] });
        await numericalView.receive({ ...edit(''), edits, richEdits });
        assert.strictEqual(numericalView.sent.at(-1).ok, true);
        const savedNumerical = new Excel.Workbook();
        await savedNumerical.xlsx.readFile(numericalFile);
        const savedNumericalSheet = savedNumerical.worksheets[0];
        assert.deepStrictEqual(Array.from({ length: 10 }, (_, index) => savedNumericalSheet.getCell(index + 1, 1).value), [
            7, -2.5, '007', '000000123', '123456789012345678', '123', '50%', 123456789012345, 0, `0.${'0'.repeat(330)}1`
        ]);
        assert.deepStrictEqual(savedNumericalSheet.getCell('B1').value, { formula: 'SUM(A1:A2)', result: 8.14 });
        assert.deepStrictEqual(savedNumericalSheet.getCell('B2').value, { richText: [{ text: '有样式', font: { bold: true } }, { text: '正常' }] });
        assert.strictEqual(savedNumericalSheet.getCell('B3').value, false);
        assert.deepStrictEqual(savedNumericalSheet.getCell('B4').value, new Date(Date.UTC(2026, 10, 19)));
        const numericalBytes = await fs.promises.readFile(numericalFile);
        const workbookXml = await (await JSZip.loadAsync(numericalBytes)).file('xl/workbook.xml').async('string');
        assert.match(workbookXml, /<calcPr[^>]*fullCalcOnLoad="1"/);
        for (const save of [
            edit(' =SUM(A1:A2)'),
            { ...edit(''), edits: [{ row: 1, col: 2, value: '覆写' }] },
            { ...edit(''), edits: [], richEdits: [{ row: 1, col: 2, runs: [{ text: '覆写', bold: true }] }] },
            { ...edit(''), edits: [{ row: 1, col: 1, value: '8' }], richEdits: [{ row: 1, col: 1, runs: [{ text: '=1+2', bold: true }] }] },
            structureEdit({ type: 'insertControl', row: 1, col: 2, controlType: 'checkbox' })
        ]) {
            await numericalView.receive(save);
            assert.deepStrictEqual(await fs.promises.readFile(numericalFile), numericalBytes);
            assert.strictEqual(numericalView.sent.at(-1).ok, false);
            assert.match(numericalView.sent.at(-1).error, /在 Excel 中编辑公式/);
        }

        const formulaWorkbook = new Excel.Workbook();
        formulaWorkbook.addWorksheet('Data').getCell('A1').value = 42;
        formulaWorkbook.addWorksheet('Summary').getCell('A1').value = { formula: 'Data!$A1', result: 42 };
        const crossSheetPath = path.join(root, 'cross-sheet.xlsx');
        await formulaWorkbook.xlsx.writeFile(crossSheetPath);
        const crossSheetBytes = await fs.promises.readFile(crossSheetPath);
        const crossSheetView = await setup(root, crossSheetPath);
        for (const operation of [
            { type: 'insertRowAbove', index: 1 }, { type: 'deleteRow', index: 1 },
            { type: 'insertColumnLeft', index: 1 }, { type: 'deleteColumn', index: 1 },
            { type: 'insertCellShiftDown', row: 1, col: 1 }, { type: 'deleteCellShiftLeft', row: 1, col: 1 },
            { type: 'mergeRange', startRow: 1, startCol: 1, endRow: 2, endCol: 1 }
        ]) {
            await crossSheetView.receive(structureEdit(operation));
            assert.deepStrictEqual(await fs.promises.readFile(crossSheetPath), crossSheetBytes);
            assert.strictEqual(crossSheetView.sent.at(-1).ok, false);
            assert.match(crossSheetView.sent.at(-1).error, /跨页引用/);
        }

        const validationWorkbook = new Excel.Workbook();
        validationWorkbook.addWorksheet('Data').getCell('A1').value = '下拉输入';
        validationWorkbook.addWorksheet('Input').getCell('A1').dataValidation = {
            type: 'list', formulae: ['Data!$A$1:$A$2']
        };
        const validationPath = path.join(root, 'cross-sheet-validation.xlsx');
        await validationWorkbook.xlsx.writeFile(validationPath);
        const validationBytes = await fs.promises.readFile(validationPath);
        const validationView = await setup(root, validationPath);
        await validationView.receive(structureEdit({ type: 'insertRowAbove', index: 1 }));
        assert.strictEqual(validationView.sent.at(-1).ok, false);
        assert.match(validationView.sent.at(-1).error, /依赖坐标/);
        assert.deepStrictEqual(await fs.promises.readFile(validationPath), validationBytes);

        const mergeWorkbook = new Excel.Workbook();
        const mergeSheet = mergeWorkbook.addWorksheet('Merged');
        mergeSheet.getCell('A1').value = '合并保留';
        mergeSheet.mergeCells('A1:B1');
        mergeSheet.getCell('A2').value = '下方';
        const mergePath = path.join(root, 'merge.xlsx');
        await mergeWorkbook.xlsx.writeFile(mergePath);
        const mergeView = await setup(root, mergePath);
        const mergeBytes = await fs.promises.readFile(mergePath);
        await mergeView.receive(structureEdit({ type: 'insertColumnLeft', index: 1 }));
        assert.deepStrictEqual(await fs.promises.readFile(mergePath), mergeBytes);
        assert.strictEqual(mergeView.sent.at(-1).ok, false);
        assert.match(mergeView.sent.at(-1).error, /移动或覆盖合并区域/);
        await mergeView.receive(structureEdit({ type: 'insertRowAbove', index: 2 }));
        const mergedOutput = new Excel.Workbook();
        await mergedOutput.xlsx.readFile(mergePath);
        assert.strictEqual(mergeView.sent.at(-1).ok, true);
        assert.deepStrictEqual(mergedOutput.worksheets[0].model.merges, ['A1:B1']);
        assert.strictEqual(mergedOutput.worksheets[0].getCell('A1').value, '合并保留');
        assert.strictEqual(mergedOutput.worksheets[0].getCell('A3').value, '下方');

        const chartFile = path.join(root, 'chart.xlsx');
        const archive = await JSZip.loadAsync(externalBytes);
        archive.file('xl/charts/chart1.xml', '<chart/>');
        const chartBytes = await archive.generateAsync({ type: 'nodebuffer' });
        await fs.promises.writeFile(chartFile, chartBytes);
        const chartView = await setup(root, chartFile);
        await chartView.receive(edit('不应写入'));
        assert.deepStrictEqual(await fs.promises.readFile(chartFile), chartBytes);
        assert.ok(chartView.sent.some(message => message.command === 'saveResult' && !message.ok && /无法保真保存/.test(message.error)));

        const worksheetPart = 'xl/worksheets/sheet1.xml';
        const featureCases = [
            ['extension', worksheetPart, '<extLst><ext uri="urn:test-only"/></extLst>'],
            ['rich-data', 'xl/richData/rdrichvalue.xml', '<rvData/>'],
            ['custom-xml', 'customXml/item1.xml', '<sample/>'],
            ['unknown-part', 'xl/featurePayload/data.xml', '<sample/>']
        ];
        for (const [name, part, fragment] of featureCases) {
            const archive = await JSZip.loadAsync(externalBytes);
            const originalXml = part === worksheetPart ? await archive.file(part).async('string') : null;
            archive.file(part, originalXml ? originalXml.replace('</worksheet>', `${fragment}</worksheet>`) : fragment);
            const file = path.join(root, `${name}.xlsx`);
            const original = await archive.generateAsync({ type: 'nodebuffer' });
            await fs.promises.writeFile(file, original);
            const view = await setup(root, file);
            await view.receive(edit('不应覆盖 Excel 内容'));
            assert.deepStrictEqual(await fs.promises.readFile(file), original, name);
            const result = view.sent.at(-1);
            assert.strictEqual(result.ok, false);
            assert.ok(result.error.includes(part), name);
        }

        const shifting = path.join(root, 'shifting.csv');
        const originalTable = 'a,keep1\nb,keep2\nc,keep3\n';
        await fs.promises.writeFile(shifting, originalTable);
        const shiftingView = await setup(root, shifting);
        for (const operation of [
            { type: 'deleteCellShiftUp', row: 9, col: 1 },
            { type: 'deleteCellShiftUp', row: 1, col: 9 },
            { type: 'deleteCellShiftLeft', row: 1, col: 9 }
        ]) {
            await shiftingView.receive(structureEdit(operation));
            assert.strictEqual(await fs.promises.readFile(shifting, 'utf8'), originalTable);
            const result = shiftingView.sent.at(-1);
            assert.strictEqual(result.ok, false);
            assert.match(result.error, /超出已有表格范围/);
        }
        await shiftingView.receive(structureEdit({ type: 'deleteCellShiftUp', row: 1, col: 1 }));
        assert.strictEqual(await fs.promises.readFile(shifting, 'utf8'), 'b,keep1\nc,keep2\n,keep3\n');

        const overSize = path.join(root, 'too-large.tsv');
        await fs.promises.writeFile(overSize, 'x\t2\n');
        await fs.promises.truncate(overSize, 10 * 1024 * 1024 + 1);
        const sizeView = await setup(root, overSize, true);
        assert.strictEqual(sizeView.receive, undefined, '10 MiB 判断应早于启动 Webview');
        assert.match(warnings.at(-1), /10 MiB/);
        const manyRows = path.join(root, 'too-many.csv');
        await fs.promises.writeFile(manyRows, 'a\n'.repeat(200_001));
        await setup(root, manyRows, true);
        const richGrid = path.join(root, 'too-wide-for-height.csv');
        await fs.promises.writeFile(richGrid, `first${',next'.repeat(99)}\n${'value\n'.repeat(2000)}`);
        await setup(root, richGrid, true);
        const wideCsv = path.join(root, 'too-many-columns.csv');
        await fs.promises.writeFile(wideCsv, ','.repeat(10000));
        await setup(root, wideCsv, true);

        const growing = path.join(root, 'growing.csv');
        await fs.promises.writeFile(growing, 'start\n');
        const originalOpen = fs.promises.open;
        try {
            fs.promises.open = async (file, ...args) => {
                const handle = await originalOpen(file, ...args);
                if (file === growing && args[0] === 'r') {
                    const originalStat = handle.stat.bind(handle);
                    handle.stat = async () => {
                        const stats = await originalStat();
                        await fs.promises.truncate(growing, 10 * 1024 * 1024 + 1);
                        return stats;
                    };
                }
                return handle;
            };
            await setup(root, growing, true);
        } finally {
            fs.promises.open = originalOpen;
        }

        for (const [file, type] of [[overSize, 'tsv'], [manyRows, 'csv'], [richGrid, 'csv'], [wideCsv, 'csv'], [growing, 'csv']]) {
            const key = crypto.createHash('sha1').update(file).digest('hex');
            assert.ok(!fs.existsSync(path.join(root, 'storage', '.history', `${type}-${key}`)), '受限 CSV/TSV 不得尝试加载历史');
        }

        const capacityConsoleError = console.error;
        try {
            console.error = () => {};
            for (const [name, existingCount, existingBytes, type] of [
                ['count-cap', 201, 1, 'csv'], ['byte-cap', 1, 50 * 1024 * 1024, 'csv'],
                ['xlsx-byte-cap', 1, 200 * 1024 * 1024, 'xlsx']
            ]) {
                const limitedHistoryFile = path.join(root, `${name}.${type}`);
                if (type === 'xlsx') {
                    await initial.xlsx.writeFile(limitedHistoryFile);
                } else {
                    await fs.promises.writeFile(limitedHistoryFile, 'start\n');
                }
                const key = crypto.createHash('sha1').update(limitedHistoryFile).digest('hex');
                const historyDir = path.join(root, 'storage', '.history', `${type}-${key}`);
                await fs.promises.mkdir(historyDir, { recursive: true });
                const entries = Array.from({ length: existingCount }, (_, i) => ({
                    id: `older-${i}`, timestamp: Date.now() - (existingCount - i) * 1000,
                    fileName: `${name}.${type}`, byteSize: 1, hash: `unchanged-${i}`, fileType: type, snapshotFile: `older-${i}.${type}`
                }));
                await Promise.all(entries.map(async entry => {
                    const snapshot = path.join(historyDir, entry.snapshotFile);
                    await fs.promises.writeFile(snapshot, 'v');
                    await fs.promises.truncate(snapshot, existingBytes);
                }));
                const index = path.join(historyDir, 'index.json');
                const existingIndex = JSON.stringify(entries);
                await fs.promises.writeFile(index, existingIndex);
                const limitedView = await setup(root, limitedHistoryFile);
                assert.ok(limitedView.sent.some(message => message.command === 'initVirtualTable'));
                await limitedView.receive(edit('已保存'));
                if (type === 'xlsx') {
                    const written = new Excel.Workbook();
                    await written.xlsx.readFile(limitedHistoryFile);
                    assert.strictEqual(written.worksheets[0].getCell('A1').value, '已保存');
                } else {
                    assert.strictEqual(await fs.promises.readFile(limitedHistoryFile, 'utf8'), '已保存\n');
                }
                assert.ok(limitedView.sent.some(message => message.command === 'saveWarning' && /保留上限/.test(message.message)));
                assert.strictEqual(await fs.promises.readFile(index, 'utf8'), existingIndex);
                assert.strictEqual((await fs.promises.readdir(historyDir)).length, entries.length + 1);
                await limitedView.receive({ command: 'showVersionHistory' });
                assert.strictEqual(offeredVersions.filter(item => item.entry).length, existingCount);
            }
        } finally {
            console.error = capacityConsoleError;
        }

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
        console.log('表格 Provider 消息测试：公式保护、合并区校验、容量限制、保存保真与版本历史均通过。');
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
