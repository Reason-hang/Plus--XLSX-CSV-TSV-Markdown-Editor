// Real built webview + real provider + disposable file; only VS Code APIs are mocked.
const { JSDOM, VirtualConsole } = require('jsdom');
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
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-split-persist-'));
    let provider, dom;
    try {
        const file = path.join(dir, 'sample.md');
        const initial = 'before\n\n![alt](./images/pic.png)\n\n```js\nconst a=1;\n```\n';
        await fs.promises.writeFile(file, initial);
        await fs.promises.mkdir(path.join(dir, 'images'));
        await fs.promises.writeFile(path.join(dir, 'images', 'pic.png'), 'fixture');
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
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {};
        let receive;
        const webview = { options: {}, postMessage: async message => { messages.push(message); w.postMessage(message, '*'); }, onDidReceiveMessage: handler => { receive = handler; }, asWebviewUri: value => value };
        const panel = { webview, onDidDispose() {} };
        const values = new Map();
        const context = { globalState: { get: key => values.get(key), update: async (key, value) => values.set(key, value) }, globalStorageUri: uri(path.join(dir, 'storage')), extensionUri: uri(root) };
        provider = new MDEditorProvider(context); provider.getWebviewContent = () => '';
        await provider.resolveCustomEditor({ uri: uri(file) }, panel, {});
        w.acquireVsCodeApi = () => ({ postMessage: message => { Promise.resolve(receive(message)).catch(error => errors.push(String(error))); }, getState: () => ({}), setState: () => {} });
        w.eval(fs.readFileSync(path.join(root, 'dist/md/mdWebview.js'), 'utf8'));
        await wait(250);
        w.document.getElementById('openSettingsButton').click();
        w.document.getElementById('customizeMdToolbarButton').click();
        const layoutDialog = w.document.querySelector('.md-layout-backdrop');
        if (!layoutDialog || layoutDialog.hidden) throw Error('Toolbar layout dialog did not open');
        const initialOrder = Array.from(layoutDialog.querySelectorAll('div.md-layout-card[data-item]'), card => card.dataset.item);
        if (!initialOrder.includes('rtl')) throw Error('Initial toolbar order missing');
        const rtl = layoutDialog.querySelector('[data-item="rtl"]');
        rtl.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
        const searchCard = layoutDialog.querySelector('[data-item="search"]');
        searchCard.querySelector('button').click();
        layoutDialog.querySelector('[data-apply]').click();
        for (let i=0; i<30 && !messages.some(m => m.command === 'toolbarLayoutSaved'); i++) await wait(50);
        const savedLayout = messages.find(m => m.command === 'toolbarLayoutSaved');
        const stored = values.get('mdToolbarLayout.v1');
        if (!savedLayout?.ok || !stored?.hidden.includes('search')) throw Error('Toolbar layout was not saved');
        const shownOrder = stored.order.filter(id => initialOrder.includes(id));
        if (shownOrder.indexOf('rtl') !== initialOrder.indexOf('rtl') - 1) throw Error('Toolbar reordering was not saved');
        if (!w.document.getElementById('searchButton').closest('.tooltip').classList.contains('hidden')) throw Error('Saved hidden toolbar button is still visible');
        const reopened = [];
        const domReopened = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
        const w2 = domReopened.window;
        w2.TextEncoder = TextEncoder; w2.TextDecoder = TextDecoder;
        w2.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        w2.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        w2.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w2.scrollTo = () => {};
        let receiveReopened;
        const webviewReopened = { options: {}, postMessage: async message => { reopened.push(message); w2.postMessage(message, '*'); }, onDidReceiveMessage: handler => { receiveReopened = handler; }, asWebviewUri: value => value };
        const providerReopened = new MDEditorProvider(context); providerReopened.getWebviewContent = () => '';
        await providerReopened.resolveCustomEditor({ uri: uri(file) }, { webview: webviewReopened, onDidDispose() {} }, {});
        w2.acquireVsCodeApi = () => ({ postMessage: message => { Promise.resolve(receiveReopened(message)).catch(error => errors.push(String(error))); }, getState: () => ({}), setState: () => {} });
        w2.eval(fs.readFileSync(path.join(root, 'dist/md/mdWebview.js'), 'utf8'));
        await wait(250);
        const restored = reopened.find(message => message.command === 'toolbarLayoutUpdated')?.layout;
        if (!restored?.hidden.includes('search') || JSON.stringify(restored.order) !== JSON.stringify(stored.order)) throw Error('Toolbar layout was not restored');
        if (!w2.document.getElementById('searchButton').closest('.tooltip').classList.contains('hidden')) throw Error('Reopened toolbar did not apply hidden state');
        const priorId = initialOrder[initialOrder.indexOf('rtl') - 1];
        const toolbarItems = require('../out/shared/mdToolbarLayout').MD_TOOLBAR_ITEMS;
        const priorButtonId = toolbarItems.find(item => item.id === priorId)?.nodes[0];
        const rtlNode = w2.document.getElementById('toggleRtlButton');
        const priorNode = w2.document.getElementById(priorButtonId);
        if (!priorNode || !(rtlNode.compareDocumentPosition(priorNode) & w2.Node.DOCUMENT_POSITION_FOLLOWING)) throw Error('Reopened toolbar did not apply new order');
        providerReopened.dispose();
        domReopened.window.close();
        w.document.getElementById('toggleEditModeButton').click(); await wait(100);
        const preview = w.document.getElementById('markdownPreview');
        if (preview.contentEditable !== 'true') throw Error('fenced sample is not editable');
        preview.querySelector('p').textContent = 'changed';
        preview.querySelector('p').dispatchEvent(new w.Event('input', { bubbles: true }));
        w.document.getElementById('saveEditsButton').click();
        for (let i=0; i<30 && !messages.some(m => m.command === 'saveResult'); i++) await wait(50);
        const result = messages.find(m => m.command === 'saveResult');
        const actual = await fs.promises.readFile(file, 'utf8');
        if (!result?.ok || actual !== initial.replace('before', 'changed')) throw Error('Real provider did not preserve the fenced file: ' + JSON.stringify({ result, actual }));
        await wait(100);
        w.document.getElementById('toggleEditModeButton').click(); await wait(100);
        preview.querySelector('p').textContent = 'unsaved draft';
        preview.querySelector('p').dispatchEvent(new w.Event('input', { bubbles: true }));
        await fs.promises.writeFile(file, 'external change\n');
        w.document.getElementById('saveEditsButton').click();
        for (let i=0; i<30 && messages.filter(m => m.command === 'saveResult').length < 2; i++) await wait(50);
        const second = messages.filter(m => m.command === 'saveResult').at(-1);
        if (second?.ok !== false || await fs.promises.readFile(file, 'utf8') !== 'external change\n') throw Error('External change was not protected');
        if (!w.document.getElementById('markdownEditor').value.startsWith('unsaved draft')) throw Error('Draft was lost after external-change rejection');
        if (errors.length) throw Error(errors.join('; '));
        console.log('Markdown 宿主模拟通过：工具栏保存恢复，分屏落盘保留图片和代码块，外部修改时保留草稿。');
    } finally {
        if (provider) provider.dispose();
        if (dom) dom.window.close();
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
