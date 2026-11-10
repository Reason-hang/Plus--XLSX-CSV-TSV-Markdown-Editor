// Actual Webview and provider, with disposable files and a mocked IDE API.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const Excel = require('exceljs');
const root = path.resolve(__dirname, '..');
const uri = filePath => ({ fsPath: filePath, scheme: 'file', toString: () => `file://${filePath}` });
const disposable = { dispose() {} };
const api = {
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class {}, QuickPickItemKind: { Separator: -1 },
    env: { language: 'zh-cn', clipboard: { readText: async () => '' } },
    workspace: {
        getConfiguration: () => ({ get: (key, fallback) => /^(xlsx|csv|tsv)\.autoSave$/.test(key) ? true : key === 'autoSaveDelay' ? 30 : fallback }),
        onDidChangeConfiguration: () => disposable,
        createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} })
    },
    window: { onDidChangeActiveColorTheme: () => disposable, activeColorTheme: { kind: 1 }, showErrorMessage: message => { throw Error(message); } }
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? api : originalLoad.call(this, request, ...args); };
const { SpreadsheetEditorProvider } = require('../out/spreadsheetEditorProvider');
Module._load = originalLoad;
const state = () => {
    const values = new Map();
    return { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value) };
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(type, structure = false) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sheet-save-persist-'));
    let dom, provider;
    try {
        const file = path.join(dir, 'sample.' + type);
        if (type === 'xlsx') {
            const workbook = new Excel.Workbook();
            workbook.addWorksheet('Sheet1').getCell('A1').value = 'initial';
            await workbook.xlsx.writeFile(file);
        } else {
            await fs.promises.writeFile(file, 'initial\n');
        }
        async function readValue() {
            if (type !== 'xlsx') return (await fs.promises.readFile(file, 'utf8')).trim();
            const workbook = new Excel.Workbook();
            await workbook.xlsx.readFile(file);
            return workbook.getWorksheet('Sheet1').getCell('A1').text;
        }
        let receive, w, held;
        const messages = [], errors = [];
        const webview = {
            options: {}, cspSource: "'self'", asWebviewUri: value => value,
            postMessage: async message => {
                messages.push(message);
                if (message.command === 'saveResult' && !held) { held = message; return; }
                w?.postMessage(message, '*');
            },
            onDidReceiveMessage: handler => { receive = handler; }
        };
        provider = new SpreadsheetEditorProvider({ globalState: state(), workspaceState: state(), globalStorageUri: uri(path.join(dir, 'storage')), extensionUri: uri(root) });
        await provider.resolveCustomEditor({ uri: uri(file) }, { webview, onDidDispose() {} }, {});
        const html = webview.html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
        const virtualConsole = new VirtualConsole();
        virtualConsole.on('jsdomError', error => errors.push(error.message));
        dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
        w = dom.window;
        w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        w.ResizeObserver = class { observe() {} disconnect() {} };
        w.IntersectionObserver = class { observe() {} disconnect() {} };
        w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: text => ({ width: text.length * 8 }) });
        w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {};
        w.acquireVsCodeApi = () => ({ postMessage: message => { Promise.resolve(receive(message)).catch(error => errors.push(String(error))); }, getState: () => ({}), setState() {} });
        w.eval(fs.readFileSync(path.join(root, 'dist/spreadsheet/spreadsheetWebview.js'), 'utf8'));
        await wait(1200);
        w.document.getElementById('toggleTableEditButton').click();
        const cell = w.document.querySelector('td[data-rownum="1"][data-colnum="1"]');
        if (!cell) throw Error(type + ': cell missing');
        if (structure) {
            cell.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
            const insert = Array.from(w.document.querySelectorAll('.header-context-item')).find(item => item.textContent === '在上方插入行');
            if (!insert) throw Error('Insert row menu missing');
            insert.click();
            for (let i = 0; i < 60 && !held; i++) await wait(50);
            if (!held?.ok) throw Error('Row insertion save failed');
            const shifted = w.document.querySelector('td[data-rownum="2"][data-colnum="1"]');
            if (!shifted) throw Error('Shifted row missing');
            shifted.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
            shifted.textContent = 'after insert'; shifted.dispatchEvent(new w.Event('input', { bubbles: true }));
            w.postMessage(held, '*');
            for (let i = 0; i < 80 && messages.filter(m => m.command === 'saveResult').length < 2; i++) await wait(50);
            if (type === 'xlsx') {
                const saved = new Excel.Workbook(); await saved.xlsx.readFile(file);
                const sheet = saved.getWorksheet('Sheet1');
                if (sheet.getCell('A1').text !== '' || sheet.getCell('A2').text !== 'after insert') throw Error('Inserted row or later edit lost');
            } else {
                const lines = (await fs.promises.readFile(file, 'utf8')).split(/\r?\n/);
                if (lines[0] !== '' || lines[1] !== 'after insert') throw Error(type + ': inserted row or later edit lost');
            }
            if (errors.length) throw Error(errors.join('; '));
            return;
        }
        cell.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
        cell.textContent = 'first'; cell.dispatchEvent(new w.Event('input', { bubbles: true }));
        for (let i = 0; i < 40 && !held; i++) await wait(50);
        if (!held?.ok || await readValue() !== 'first') throw Error(type + ': first save failed');
        cell.textContent = 'second'; cell.dispatchEvent(new w.Event('input', { bubbles: true }));
        w.postMessage(held, '*');
        for (let i = 0; i < 80 && messages.filter(m => m.command === 'saveResult').length < 2; i++) await wait(50);
        if (await readValue() !== 'second') throw Error(type + ': edit made during save was lost');
        if (errors.length) throw Error(type + ': ' + errors.join('; '));
    } finally {
        provider?.dispose?.(); dom?.window.close();
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
}

(async () => {
    for (const type of ['xlsx', 'csv', 'tsv']) {
        await scenario(type, true);
        await scenario(type);
    }
    console.log('表格落盘模拟通过：XLSX、CSV、TSV 插行后的编辑及保存期间的后续文字均写入临时文件。');
})().catch(error => { console.error(error); process.exitCode = 1; });
