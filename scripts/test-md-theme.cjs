// Real temporary files, with only the IDE settings and event API mocked.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const settings = new Map();
const vscode = {
    EventEmitter: class {
        constructor() { this.handlers = []; this.event = handler => { this.handlers.push(handler); return { dispose() {} }; }; }
        fire(value) { this.handlers.forEach(handler => handler(value)); }
        dispose() {}
    },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => settings.has(key) ? settings.get(key) : fallback }) }
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args); };
const { MarkdownThemeService } = require('../out/shared/markdownThemeService');
Module._load = originalLoad;

(async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'md-theme-207-'));
    try {
        const cssFile = path.join(root, 'theme.css');
        await fs.promises.writeFile(cssFile, '.markdown-preview { color: red; }');
        settings.set('md.theme.enabled', true);
        settings.set('md.theme.cssFile', cssFile);
        settings.set('md.theme.watch', false);
        const service = new MarkdownThemeService();
        const loaded = await service.loadFromConfiguration();
        assert.strictEqual(loaded.status, 'loaded');
        assert.strictEqual(loaded.css, '.markdown-preview { color: red; }');
        await fs.promises.writeFile(cssFile, '@import url(https://example.invalid/x.css);');
        const fallback = await service.reload();
        assert.strictEqual(fallback.status, 'fallback');
        assert.strictEqual(fallback.css, loaded.css);
        settings.set('md.theme.enabled', false);
        assert.strictEqual((await service.reload()).status, 'disabled');
        settings.set('md.theme.enabled', true);
        settings.set('md.theme.cssFile', 'relative.css');
        assert.strictEqual((await service.reload()).status, 'error');
        service.dispose();
        console.log('Markdown 外置主题测试：加载、无效更新回退、禁用和相对路径拒绝均通过。');
    } finally {
        await fs.promises.rm(root, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
