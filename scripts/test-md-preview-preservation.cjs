// The built webview is exercised with synthetic Markdown and mocked host messages.
// MD_PREVIEW_SAMPLE may point to a disposable copy of an additional local sample.
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const provider = fs.readFileSync(path.join(root, 'src/mdEditorProvider.ts'), 'utf8');
const template = provider.match(/return `\s*(<!DOCTYPE html>[\s\S]*?<\/html>)`;/)?.[1];
if (!template) throw Error('Markdown provider template missing');
const html = template.replace(/\$\{\w+\}/g, '').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
const bundle = fs.readFileSync(path.join(root, 'dist/md/mdWebview.js'), 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function create(source, settings = {}) {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {};
    const messages = [];
    w.acquireVsCodeApi = () => ({ postMessage: message => messages.push(message), getState: () => ({}), setState: () => {} });
    w.eval(bundle);
    await wait(100);
    w.postMessage({ command: 'initSettings', settings: { language: 'zh', autoSave: false, ...settings } }, '*');
    w.postMessage({ command: 'initMarkdown', content: source }, '*');
    await wait(100);
    w.document.getElementById('previewEditButton').click();
    await wait(100);
    return { dom, w, messages, errors, preview: w.document.getElementById('markdownPreview') };
}

function mapped(ctx, text) {
    const result = Array.from(ctx.preview.querySelectorAll('[data-preview-source-key]')).find(node => node.textContent.includes(text));
    if (!result) throw Error(`mapped text missing: ${text}`);
    return result;
}

function edit(ctx, element, value) {
    element.textContent = value;
    element.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
}

function saves(ctx) { return ctx.messages.filter(message => message.command === 'saveMarkdown'); }
function ack(ctx, result = { ok: true }) { ctx.w.postMessage({ command: 'saveResult', ...result }, '*'); }

async function complexSaveAndSwitch() {
    const source = '第一段独有文字。\r\n\r\n<mark>高亮保留</mark>\r\n\r\n- [ ] 待办原句\r\n- 列表原句\r\n\r\n| 表头 | 数值 |\r\n| --- | --- |\r\n| 单元内容 | 12 |\r\n\r\n~~~~mermaid  title\r\n\tgraph TD\r\n A-->B\r\n~~~~\r\n\r\n![图片](./images/a.png)\r\n\r\n';
    const ctx = await create(source);
    try {
        assert.strictEqual(ctx.preview.contentEditable, 'false');
        const notice = ctx.preview.querySelector('[data-preview-source-notice]');
        assert(notice?.textContent.includes('仅可编辑可定位的文字'));
        assert(ctx.w.document.querySelector('#formattingToolbar [data-format="bold"]').disabled);
        edit(ctx, mapped(ctx, '第一段独有文字'), '第一段已经修改。');
        edit(ctx, mapped(ctx, '列表原句'), '列表已经修改');
        edit(ctx, mapped(ctx, '高亮保留'), '高亮已修改');
        let expected = source.replace('第一段独有文字', '第一段已经修改').replace('列表原句', '列表已经修改').replace('高亮保留', '高亮已修改');
        notice.querySelector('[data-preview-source-action="split"]').click();
        await wait(80);
        const editor = ctx.w.document.getElementById('markdownEditor');
        assert(!ctx.w.document.querySelector('#formattingToolbar [data-format="bold"]').disabled);
        assert.strictEqual(editor.value, expected.replace(/\r\n/g, '\n'), 'textarea displays normalized line endings');
        const rows = ctx.preview.querySelectorAll('table tr').length;
        ctx.preview.querySelector('[data-table-action="tableAddRowBelow"]').click();
        assert.strictEqual(ctx.preview.querySelectorAll('table tr').length, rows, 'protected split preview must reject table structure actions');
        editor.value = editor.value.replace('列表已经修改', '列表源码修改');
        editor.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
        expected = expected.replace('列表已经修改', '列表源码修改');
        ctx.w.document.getElementById('previewEditButton').click();
        await wait(80);
        assert(ctx.w.document.body.classList.contains('preview-edit-mode'));
        edit(ctx, mapped(ctx, '单元内容'), '单元已修改');
        const afterTable = expected.replace('单元内容', '单元已修改');
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).at(-1)?.text, afterTable, 'button save must contain the exact source patch');
        ack(ctx);
        await wait(100);
        assert(!ctx.w.document.body.classList.contains('edit-mode'));
        assert.deepStrictEqual(ctx.errors, []);
    } finally { ctx.dom.window.close(); }
}

async function saveInFlight() {
    const source = '初始正文\n\n```js\n\tconst a = 1;\n```\n';
    const ctx = await create(source);
    try {
        const text = mapped(ctx, '初始正文');
        edit(ctx, text, '第一版正文');
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).at(-1)?.text, source.replace('初始正文', '第一版正文'));
        edit(ctx, text, '第二版正文');
        ack(ctx);
        await wait(100);
        assert(ctx.w.document.body.classList.contains('preview-edit-mode'), 'newer edit must remain visible after save acknowledgement');
        assert(ctx.preview.textContent.includes('第二版正文'));
        ctx.preview.dispatchEvent(new ctx.w.KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
        assert.strictEqual(saves(ctx).at(-1)?.text, source.replace('初始正文', '第二版正文'), 'Command+S must save the newer draft');
        ack(ctx, { ok: false, error: '模拟保存失败' });
        await wait(80);
        assert(ctx.preview.textContent.includes('第二版正文'), 'failed save must retain the draft');
        assert.strictEqual(ctx.w.document.getElementById('toastNotification').getAttribute('role'), 'alert');
        ctx.w.postMessage({ command: 'externalFileChanged' }, '*');
        await wait(50);
        assert(ctx.preview.textContent.includes('第二版正文'), 'external change warning must retain the draft');
    } finally { ctx.dom.window.close(); }
}

async function autoSaveAndLimits() {
    const source = '唯一正文\n\n~~~text\n\tuntouched\n~~~\n';
    const ctx = await create(source, { autoSave: true, autoSaveDelay: 25 });
    try {
        const text = mapped(ctx, '唯一正文');
        const lineBreak = new ctx.w.InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
        text.dispatchEvent(lineBreak);
        assert(lineBreak.defaultPrevented, 'unsupported structural edits must be rejected before mutation');
        edit(ctx, text, '安全修改');
        await wait(100);
        assert.strictEqual(saves(ctx).at(-1)?.text, source.replace('唯一正文', '安全修改'));
        assert.strictEqual(saves(ctx).at(-1)?.silent, true);
        edit(ctx, text, '后续修改');
        ack(ctx, { ok: true, silent: true });
        await wait(150);
        assert.strictEqual(saves(ctx).at(-1)?.text, source.replace('唯一正文', '后续修改'));
        ack(ctx, { ok: true, silent: true });
        await wait(60);
        edit(ctx, text, '**会被解释为格式**');
        assert.strictEqual(text.textContent, '后续修改', 'invalid input must revert only the last edit');
    } finally { ctx.dom.window.close(); }
}

async function recovery() {
    const source = '普通正文\n';
    const ctx = await create(source);
    try {
        const p = ctx.preview.querySelector('p');
        p.innerHTML = '<mark>保留的预览草稿</mark>';
        p.dispatchEvent(new ctx.w.Event('input', { bubbles: true }));
        ctx.w.document.getElementById('toggleEditModeButton').click();
        const panel = ctx.w.document.getElementById('previewDraftRecovery');
        assert(panel?.classList.contains('show'));
        assert(panel.querySelector('textarea').value.includes('保留的预览草稿'));
        assert.strictEqual(saves(ctx).length, 0);
        p.textContent = '更晚修改的草稿';
        panel.querySelector('[data-action="switch"]').click();
        assert(panel.classList.contains('show'), 'a changed draft must require a fresh backup');
        assert(panel.querySelector('textarea').value.includes('更晚修改的草稿'));
        panel.querySelector('[data-action="switch"]').click();
        assert.strictEqual(ctx.w.document.getElementById('markdownEditor').value, source);
    } finally { ctx.dom.window.close(); }
}

async function compositionAndUndo() {
    const source = '唯一段落\n\n```text\nuntouched\n```\n';
    const ctx = await create(source);
    try {
        let text = mapped(ctx, '唯一段落');
        text.dispatchEvent(new ctx.w.CompositionEvent('compositionstart', { bubbles: true }));
        edit(ctx, text, '中文输入');
        assert.strictEqual(saves(ctx).length, 0);
        text.dispatchEvent(new ctx.w.CompositionEvent('compositionend', { bubbles: true }));
        await wait(240);
        edit(ctx, text, '中文输入完成');
        await wait(240);
        text.dispatchEvent(new ctx.w.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
        text = mapped(ctx, '中文输入');
        assert.strictEqual(text.textContent, '中文输入', 'undo must preserve mapped editing state');
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).at(-1)?.text, source.replace('唯一段落', '中文输入'));
    } finally { ctx.dom.window.close(); }

    const ambiguous = await create('- 重复文字\n- 重复文字\n\n```text\ncode\n```\n');
    try {
        assert(!Array.from(ambiguous.preview.querySelectorAll('[data-preview-source-key]')).some(node => node.textContent.includes('重复文字')),
            'ambiguous text in the same source block must not be guessed');
        ambiguous.preview.querySelector('[data-preview-source-action="split"]').click();
        assert.strictEqual(ambiguous.w.document.getElementById('markdownEditor').value, '- 重复文字\n- 重复文字\n\n```text\ncode\n```\n');
    } finally { ambiguous.dom.window.close(); }
}

async function mermaidRenderDuringSave() {
    const source = '示例正文\n\n```mermaid\ngraph TD\nA-->B\n```\n';
    const ctx = await create(source);
    try {
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).at(-1)?.text, source);
        const diagram = ctx.preview.querySelector('.mermaid');
        diagram.setAttribute('data-processed', 'true');
        diagram.innerHTML = '<svg><text>rendered</text></svg>';
        ack(ctx);
        await wait(100);
        assert(!ctx.w.document.body.classList.contains('edit-mode'), 'a completed Mermaid render is not a new user draft');
    } finally { ctx.dom.window.close(); }
}

async function protectedDomAndSearch() {
    const source = '正文内容\n\n```text\nprotected\n```\n';
    const ctx = await create(source);
    try {
        const span = mapped(ctx, '正文内容');
        span.innerHTML = '正文<mark class="search-highlight">内容</mark>';
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).at(-1)?.text, source, 'search highlights must not become document edits');
        ack(ctx);
        await wait(100);
        ctx.w.document.getElementById('previewEditButton').click();
        await wait(100);
        ctx.preview.querySelector('.code-line').textContent = 'unexpected code mutation';
        const before = saves(ctx).length;
        ctx.w.document.getElementById('saveEditsButton').click();
        assert.strictEqual(saves(ctx).length, before, 'unexpected changes outside mapped text must not be discarded silently');
        assert(ctx.w.document.getElementById('previewDraftRecovery').classList.contains('show'));
    } finally { ctx.dom.window.close(); }
}

async function extraSample(file) {
    const source = fs.readFileSync(file, 'utf8');
    const ctx = await create(source);
    try {
        const target = ctx.preview.querySelector('[data-preview-source-key]');
        assert(target, 'copied sample must offer at least one safely mapped text area');
        const originalText = target.textContent;
        assert.strictEqual(source.indexOf(originalText), source.lastIndexOf(originalText), 'sample edit must be unique for the test');
        const started = performance.now();
        edit(ctx, target, originalText + ' 测试修改');
        console.log(`临时样本：${Buffer.byteLength(source)} 字节，${ctx.preview.querySelectorAll('[data-preview-source-key]').length} 个可映射文字区域；单次输入模拟耗时 ${Math.round(performance.now() - started)} ms。`);
        ctx.w.document.getElementById('toggleEditModeButton').click();
        await wait(80);
        assert.strictEqual(ctx.w.document.getElementById('markdownEditor').value, source.replace(originalText, originalText + ' 测试修改'));
    } finally { ctx.dom.window.close(); }
}

(async () => {
    await complexSaveAndSwitch();
    await saveInFlight();
    await autoSaveAndLimits();
    await recovery();
    await compositionAndUndo();
    await mermaidRenderDuringSave();
    await protectedDomAndSearch();
    if (process.env.MD_PREVIEW_SAMPLE) await extraSample(process.env.MD_PREVIEW_SAMPLE);
    console.log('预览保真测试通过：复杂文档局部修改、字节对照、切换、保存中继续编辑、自动保存及草稿恢复。');
})().catch(error => { console.error(error); process.exitCode = 1; });
