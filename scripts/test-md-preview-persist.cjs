// Built webview and actual provider writing only to a disposable temporary file.
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL, fileURLToPath } = require('url');
const root = path.resolve(__dirname, '..');
const uri = filePath => ({ fsPath: filePath, scheme: 'file', toString: () => pathToFileURL(filePath).href });
const disposable = { dispose() {} };
const api = {
    Uri: { file: uri, parse: value => uri(fileURLToPath(value)), joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class {},
    EventEmitter: class { constructor() { this.event = () => disposable; } fire() {} dispose() {} },
    QuickPickItemKind: { Separator: -1 }, env: { language: 'zh-cn' },
    workspace: { workspaceFolders: [], getWorkspaceFolder: () => undefined, getConfiguration: () => ({ get: (_key, fallback) => fallback }), asRelativePath: value => value.fsPath, onDidChangeConfiguration: () => disposable, createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} }) },
    window: { createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }), onDidChangeActiveColorTheme: () => disposable, activeColorTheme: { kind: 1 }, showErrorMessage: message => { throw Error(message); } }
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? api : originalLoad.call(this, request, ...args); };
const { MDEditorProvider } = require('../out/mdEditorProvider');
Module._load = originalLoad;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-preview-persist-'));
    let provider, dom;
    try {
        const file = path.join(dir, 'sample.md');
        const source = '\ufeff原始段落\r\n\r\n<mark>高亮原文</mark>\r\n\r\n~~~js\r\n\tconst x=1;\r\n~~~\r\n\r\n![a](./pic.png)\r\n\r\n';
        await fs.promises.writeFile(file, source);
        const providerSource = fs.readFileSync(path.join(root, 'src/mdEditorProvider.ts'), 'utf8');
        const template = providerSource.match(/return `\s*(<!DOCTYPE html>[\s\S]*?<\/html>)`;/)?.[1];
        if (!template) throw Error('Provider template missing');
        const html = template.replace(/\$\{\w+\}/g, '').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
        const errors = [], messages = [];
        const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
        dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
        const w = dom.window;
        w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.scrollTo = () => {};
        let receive;
        const webview = { options: {}, postMessage: async message => { messages.push(message); w.postMessage(message, '*'); }, onDidReceiveMessage: handler => { receive = handler; }, asWebviewUri: value => value };
        const values = new Map();
        const context = { globalState: { get: key => values.get(key), update: async (key, value) => values.set(key, value) }, globalStorageUri: uri(path.join(dir, 'storage')), extensionUri: uri(root) };
        provider = new MDEditorProvider(context); provider.getWebviewContent = () => '';
        await provider.resolveCustomEditor({ uri: uri(file) }, { webview, onDidDispose() {} }, {});
        w.acquireVsCodeApi = () => ({ postMessage: message => { Promise.resolve(receive(message)).catch(error => errors.push(String(error))); }, getState: () => ({}), setState: () => {} });
        w.eval(fs.readFileSync(path.join(root, 'dist/md/mdWebview.js'), 'utf8'));
        await wait(250);
        const preview = w.document.getElementById('markdownPreview');
        w.document.getElementById('previewEditButton').click();
        await wait(100);
        const span = Array.from(preview.querySelectorAll('[data-preview-source-key]')).find(node => node.textContent.includes('原始段落'));
        assert(span, 'mapped paragraph missing');
        span.textContent = span.textContent.replace('原始段落', '保存后的段落');
        span.dispatchEvent(new w.Event('input', { bubbles: true }));
        w.document.getElementById('saveEditsButton').click();
        for (let i = 0; i < 40 && !messages.some(message => message.command === 'saveResult'); i++) await wait(50);
        assert(messages.find(message => message.command === 'saveResult')?.ok);
        assert.strictEqual(await fs.promises.readFile(file, 'utf8'), source.replace('原始段落', '保存后的段落'));
        await wait(100);
        w.document.getElementById('previewEditButton').click();
        await wait(100);
        const next = Array.from(preview.querySelectorAll('[data-preview-source-key]')).find(node => node.textContent.includes('保存后的段落'));
        assert(next, 'mapped saved paragraph missing');
        next.textContent = next.textContent.replace('保存后的段落', '待保存草稿');
        next.dispatchEvent(new w.Event('input', { bubbles: true }));
        await fs.promises.writeFile(file, '外部修改\n');
        w.document.getElementById('saveEditsButton').click();
        for (let i = 0; i < 40 && messages.filter(message => message.command === 'saveResult').length < 2; i++) await wait(50);
        assert.strictEqual(messages.filter(message => message.command === 'saveResult').at(-1)?.ok, false);
        assert.strictEqual(await fs.promises.readFile(file, 'utf8'), '外部修改\n');
        assert(preview.textContent.includes('待保存草稿'));
        assert.deepStrictEqual(errors, []);
        console.log('预览宿主模拟通过：临时文件保留 BOM、CRLF、代码和图片；外部修改时拒绝覆盖并保留草稿。');
    } finally {
        if (provider) provider.dispose();
        if (dom) dom.window.close();
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
