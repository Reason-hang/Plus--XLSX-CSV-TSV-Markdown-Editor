// Exercise provider behavior with an isolated filesystem and a mocked IDE API.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const { fileURLToPath, pathToFileURL } = require('url');

const uri = filePath => ({ fsPath: filePath, scheme: 'file', toString: () => pathToFileURL(filePath).href });
const disposable = { dispose() {} };
let choice;
let trustedRoots = [];
const vscode = {
    Uri: { file: uri, parse: value => uri(fileURLToPath(value)), joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    commands: { executeCommand: async () => {} },
    RelativePattern: class {},
    EventEmitter: class {
        constructor() { this.event = () => disposable; }
        fire() {}
        dispose() {}
    },
    QuickPickItemKind: { Separator: -1 },
    env: { language: 'zh-cn' },
    workspace: {
        workspaceFolders: [],
        getWorkspaceFolder: () => undefined,
        getConfiguration: () => ({ get: (key, fallback) => key === 'md.externalResourceRoots' ? trustedRoots : fallback }),
        asRelativePath: value => value.fsPath,
        onDidChangeConfiguration: () => disposable,
        createFileSystemWatcher: () => ({ onDidChange: () => disposable, dispose() {} })
    },
    window: {
        createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
        onDidChangeActiveColorTheme: () => disposable,
        activeColorTheme: { kind: 1 },
        showErrorMessage: message => { throw new Error(message); },
        showQuickPick: async items => items.find(item => item.entry?.id === choice)
    }
};
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args);
};
const { MDEditorProvider } = require('../out/mdEditorProvider');
Module._load = originalLoad;

async function scenario(kind) {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-history-207-'));
    try {
        const documentDir = path.join(root, 'document');
        await fs.promises.mkdir(documentDir);
        const documentPath = path.join(documentDir, 'document.md');
        await fs.promises.writeFile(documentPath, '当前内容');
        const storage = path.join(root, 'storage');
        const key = crypto.createHash('sha1').update(documentPath).digest('hex');
        const historyRoot = path.join(storage, '.history');
        const historyDir = path.join(historyRoot, `md-${key}`);
        const legacyFile = path.join(historyRoot, `md-${key}.json`);
        const indexFile = path.join(historyDir, 'index.json');
        const timestamp = Date.now() - 1000;
        await fs.promises.mkdir(historyRoot, { recursive: true });
        if (kind === 'snapshot') {
            await fs.promises.mkdir(historyDir, { recursive: true });
            const content = '旧快照';
            await fs.promises.writeFile(path.join(historyDir, 'old.md'), content);
            await fs.promises.writeFile(indexFile, JSON.stringify([{ id: 'old', timestamp, charCount: content.length, byteSize: Buffer.byteLength(content), hash: crypto.createHash('sha256').update(content).digest('hex'), snapshotFile: 'old.md' }]));
            choice = 'old';
        } else if (kind === 'legacy') {
            await fs.promises.writeFile(legacyFile, JSON.stringify([{ id: 'old', timestamp, charCount: 3, content: '旧记录' }]));
            choice = `${timestamp}-0`;
        } else {
            await fs.promises.mkdir(historyDir, { recursive: true });
            await fs.promises.writeFile(indexFile, '{invalid');
        }
        const sent = [];
        let receive;
        const panel = {
            webview: { options: {}, postMessage: async message => { sent.push(message); }, onDidReceiveMessage: handler => { receive = handler; }, asWebviewUri: value => value },
            onDidDispose() {}
        };
        const stateData = new Map();
        const state = { get: key => stateData.get(key), update: async (key, value) => { stateData.set(key, value); } };
        const context = { globalState: state, globalStorageUri: uri(storage), extensionUri: uri(root) };
        const provider = new MDEditorProvider(context);
        if (kind === 'snapshot') {
            const outside = path.join(root, 'outside');
            await fs.promises.mkdir(outside);
            const image = path.join(outside, 'image.png');
            const localImage = path.join(documentDir, '带 # 和 100% 空格.png');
            await fs.promises.writeFile(image, 'test');
            await fs.promises.writeFile(localImage, 'test');
            await fs.promises.symlink(image, path.join(documentDir, 'escape.png'));
            assert.strictEqual(await provider.resolveMarkdownImageTarget('escape.png', uri(documentPath)), null);
            assert.strictEqual(await provider.resolveMarkdownImageTarget(image, uri(documentPath)), null);
            assert.strictEqual((await provider.resolveMarkdownImageTarget(pathToFileURL(localImage).href, uri(documentPath))).targetUri.fsPath, localImage);
            trustedRoots = [outside];
            assert.strictEqual((await provider.resolveMarkdownImageTarget(image, uri(documentPath))).targetUri.fsPath, image);
            trustedRoots = [];
        }
        provider.getWebviewContent = () => '';
        await provider.resolveCustomEditor({ uri: uri(documentPath) }, panel, {});
        assert.ok(receive, 'provider failed to register its message handler');
        await receive({ command: 'webviewReady' });
        if (kind === 'snapshot') {
            const initial = sent.find(message => message.command === 'toolbarLayoutUpdated');
            const layout = { version: 1, order: ['search', 'rtl'], hidden: ['rtl'] };
            await receive({ command: 'saveMdToolbarLayout', layout, revision: initial.revision, requestId: 'save-1' });
            assert.ok(sent.some(message => message.command === 'toolbarLayoutSaved' && message.requestId === 'save-1' && message.ok));
            assert.deepStrictEqual(stateData.get('mdToolbarLayout.v1').hidden, ['rtl']);
            await receive({ command: 'saveMdToolbarLayout', layout, revision: initial.revision, requestId: 'stale' });
            assert.ok(sent.some(message => message.command === 'toolbarLayoutSaved' && message.requestId === 'stale' && !message.ok));

            const reopened = [];
            let reopenReceive;
            const nextPanel = { webview: { options: {}, postMessage: async message => { reopened.push(message); }, onDidReceiveMessage: handler => { reopenReceive = handler; }, asWebviewUri: value => value }, onDidDispose() {} };
            const nextProvider = new MDEditorProvider(context);
            nextProvider.getWebviewContent = () => '';
            await nextProvider.resolveCustomEditor({ uri: uri(documentPath) }, nextPanel, {});
            await reopenReceive({ command: 'webviewReady' });
            assert.deepStrictEqual(reopened.find(message => message.command === 'toolbarLayoutUpdated').layout.hidden, ['rtl']);
            nextProvider.dispose();
        }
        if (kind === 'corrupt') {
            assert.strictEqual(await fs.promises.readFile(indexFile, 'utf8'), '{invalid');
            assert.ok(sent.some(message => message.command === 'versionHistoryError'));
        } else {
            const index = JSON.parse(await fs.promises.readFile(indexFile, 'utf8'));
            assert.strictEqual(index.length, 2);
            assert.ok(index.some(entry => entry.id === choice));
            await receive({ command: 'showVersionHistory' });
            assert.ok(sent.some(message => message.command === 'initMarkdown' && message.content === (kind === 'snapshot' ? '旧快照' : '旧记录')));
            await receive({ command: 'restoreVersion', versionId: choice });
            assert.strictEqual(await fs.promises.readFile(documentPath, 'utf8'), kind === 'snapshot' ? '旧快照' : '旧记录');
            assert.ok(sent.some(message => message.command === 'versionRestoredMd'));
            if (kind === 'legacy') assert.ok(await fs.promises.stat(legacyFile));
        }
        if (kind === 'snapshot') {
            await receive({ command: 'saveMarkdown', text: '自动保存的新内容', silent: true });
            assert.strictEqual(await fs.promises.readFile(documentPath, 'utf8'), '自动保存的新内容');
            assert.ok(sent.some(message => message.command === 'saveResult' && message.ok && message.silent));

            await fs.promises.writeFile(documentPath, '其他程序修改的内容');
            await receive({ command: 'saveMarkdown', text: '不得覆盖的草稿', silent: true });
            assert.strictEqual(await fs.promises.readFile(documentPath, 'utf8'), '其他程序修改的内容');
            assert.ok(sent.some(message => message.command === 'saveResult' && !message.ok && /外部修改/.test(message.error)));
        }
        provider.dispose();
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
}

async function verifyMarkdownEncoding() {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-encoding-'));
    const errors = [];
    const openedEditors = [];
    const originalError = vscode.window.showErrorMessage;
    const originalCommand = vscode.commands.executeCommand;
    vscode.window.showErrorMessage = async message => { errors.push(message); };
    vscode.commands.executeCommand = async (command, target, viewType) => {
        openedEditors.push({ command, file: target.fsPath, viewType });
    };
    const storage = path.join(root, 'storage');
    const provider = new MDEditorProvider({
        globalState: { get: () => undefined },
        globalStorageUri: uri(storage),
        extensionUri: uri(root)
    });
    provider.getWebviewContent = () => '';
    const open = async file => {
        const sent = [];
        let receive;
        const panel = {
            disposed: false,
            dispose() { this.disposed = true; },
            onDidDispose() {},
            webview: {
                options: {},
                postMessage: async message => { sent.push(message); },
                onDidReceiveMessage: handler => { receive = handler; },
                asWebviewUri: value => value
            }
        };
        await provider.resolveCustomEditor({ uri: uri(file) }, panel, {});
        await receive({ command: 'webviewReady' });
        return { sent, receive, panel };
    };

    try {
        const validPath = path.join(root, 'valid.md');
        const original = '\uFEFF标题\r\n实际替换字符：\uFFFD\r\n';
        await fs.promises.writeFile(validPath, original);
        const valid = await open(validPath);
        assert.equal(valid.sent.find(message => message.command === 'initMarkdown').content, original);
        const changed = original.replace('标题', '新标题');
        await valid.receive({ command: 'saveMarkdown', text: changed });
        assert.ok(valid.sent.some(message => message.command === 'saveResult' && message.ok));
        assert.deepEqual(await fs.promises.readFile(validPath), Buffer.from(changed));

        const invalid = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]);
        await fs.promises.writeFile(validPath, invalid);
        await valid.receive({ command: 'requestFreshData' });
        assert.match(errors.at(-1), /不是有效的 UTF-8/);
        assert.equal(valid.sent.filter(message => message.command === 'initMarkdown').length, 1);
        assert.equal(valid.panel.disposed, false, 'refresh failure must leave the editing session intact');
        await valid.receive({ command: 'saveMarkdown', text: '待保留的草稿' });
        assert.equal(valid.sent.filter(message => message.command === 'saveResult').at(-1).ok, false);
        assert.deepEqual(await fs.promises.readFile(validPath), invalid);

        const invalidPath = path.join(root, 'legacy-encoding.md');
        await fs.promises.writeFile(invalidPath, invalid);
        const fallback = await open(invalidPath);
        assert.match(errors.at(-1), /不是有效的 UTF-8/);
        assert.ok(!fallback.sent.some(message => message.command === 'initMarkdown'));
        assert.deepEqual(openedEditors, [{ command: 'vscode.openWith', file: invalidPath, viewType: 'default' }]);
        assert.equal(fallback.panel.disposed, true);
        await fallback.receive({ command: 'saveMarkdown', text: '不可覆盖' });
        assert.ok(fallback.sent.some(message => message.command === 'saveResult' && !message.ok));
        assert.deepEqual(await fs.promises.readFile(invalidPath), invalid);
        assert.equal((await fs.promises.readdir(path.join(storage, '.history'))).length, 1);
    } finally {
        vscode.window.showErrorMessage = originalError;
        vscode.commands.executeCommand = originalCommand;
        provider.dispose();
        await fs.promises.rm(root, { recursive: true, force: true });
    }
}

async function verifyMarkdownPrintFallback() {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-print-'));
    const file = path.join(root, 'document.md');
    const print = path.join(root, 'export.html');
    const source = [
        '# 中文标题', '', '| 列名 |', '| --- |', '| 采购数量 |', '',
        '```js', 'const memo = "代码中文🙂";', '```',
        '', '<span>源 HTML</span>', '', '![远程图](https://example.invalid/image.png)'
    ].join('\n');
    const warnings = [];
    let saveRequests = 0;
    let acceptFallback = true;
    vscode.env.remoteName = 'ssh-remote';
    vscode.window.showWarningMessage = async (message, action) => {
        warnings.push(message);
        return acceptFallback ? action : undefined;
    };
    vscode.window.showSaveDialog = async options => {
        saveRequests++;
        assert.deepEqual(options.filters, { HTML: ['html'] });
        return uri(print);
    };
    const provider = new MDEditorProvider({
        globalState: { get: () => undefined },
        globalStorageUri: uri(path.join(root, 'storage')),
        extensionUri: uri(root)
    });
    provider.getWebviewContent = () => '';
    let receive;
    const panel = {
        onDidDispose() {},
        webview: {
            options: {},
            postMessage: async () => {},
            onDidReceiveMessage: handler => { receive = handler; },
            asWebviewUri: value => value
        }
    };
    try {
        await fs.promises.writeFile(file, source);
        await fs.promises.symlink(file, print);
        await provider.resolveCustomEditor({ uri: uri(file) }, panel, {});
        await receive({ command: 'webviewReady' });
        await receive({ command: 'exportMarkdownPdf' });

        assert.match(warnings[0], /远程主机无法调用本机 Ego/);
        assert.match(warnings.at(-1), /HTML 已保存.*手写 HTML.*图片未嵌入/);
        assert.equal((await fs.promises.lstat(print)).isSymbolicLink(), false);
        assert.deepEqual(await fs.promises.readFile(file), Buffer.from(source));
        const html = await fs.promises.readFile(print, 'utf8');
        assert.match(html, /default-src 'none'/);
        assert.match(html, /<h1>中文标题<\/h1>/);
        assert.match(html, /<td>采购数量<\/td>/);
        assert.match(html, /<code[^>]*>const memo = &quot;代码中文🙂&quot;/);
        assert.match(html, /&lt;span&gt;源 HTML&lt;\/span&gt;/);
        assert.match(html, /\[图片未嵌入：远程图\]/);
        assert.ok(!html.includes('https://example.invalid/image.png'));

        acceptFallback = false;
        await receive({ command: 'exportMarkdownPdf' });
        assert.equal(saveRequests, 1);
    } finally {
        delete vscode.env.remoteName;
        delete vscode.window.showWarningMessage;
        delete vscode.window.showSaveDialog;
        provider.dispose();
        await fs.promises.rm(root, { recursive: true, force: true });
    }
}

(async () => {
    for (const kind of ['snapshot', 'legacy', 'corrupt']) await scenario(kind);
    await verifyMarkdownEncoding();
    await verifyMarkdownPrintFallback();
    console.log('Markdown Provider 测试：工具栏布局、旧历史、自动保存、外部修改保护、UTF-8 编码和打印回退均通过。');
})().catch(error => { console.error(error); process.exitCode = 1; });
