import * as assert from 'assert';
import { validateWebviewMessage, WEBVIEW_LIMITS } from '../shared/webviewMessageSchema';

suite('Webview 消息边界', () => {
    test('上游剪贴板请求仅允许表格使用', () => {
        assert.strictEqual(validateWebviewMessage({ command: 'requestPaste' }, 'spreadsheet').ok, true);
        assert.strictEqual(validateWebviewMessage({ command: 'requestPaste' }, 'markdown').ok, false);
    });
    test('Markdown 自动保存允许 silent 布尔值，拒绝超限和错误类型', () => {
        assert.strictEqual(validateWebviewMessage({ command: 'saveMarkdown', text: '内容', silent: true }, 'markdown').ok, true);
        assert.strictEqual(validateWebviewMessage({ command: 'saveMarkdown', text: '内容', silent: 'yes' }, 'markdown').ok, false);
        assert.strictEqual(validateWebviewMessage({ command: 'saveMarkdown', text: 'x'.repeat(WEBVIEW_LIMITS.maxMarkdownContentBytes + 1) }, 'markdown').ok, false);
    });
    test('拒绝未知命令和非法坐标', () => {
        assert.strictEqual(validateWebviewMessage({ command: 'unknown' }, 'spreadsheet').ok, false);
        assert.strictEqual(validateWebviewMessage({ command: 'getRows', start: -1, end: 2, sheetIndex: 0, requestId: 'r' }, 'spreadsheet').ok, false);
    });
    test('滚动诊断只接收有界数值及布尔设置', () => {
        const diagnostic = { command: 'reportScrollDiagnostics', phase: 'editor-input', epoch: 1,
            scrollTops: { editor: 30, preview: 20, content: 0, document: 0 },
            settings: { syncScroll: false, stickyToolbar: true } };
        assert.strictEqual(validateWebviewMessage(diagnostic, 'markdown').ok, true);
        assert.strictEqual(validateWebviewMessage({ ...diagnostic, scrollTops: { ...diagnostic.scrollTops, editor: -1 } }, 'markdown').ok, false);
        assert.strictEqual(validateWebviewMessage(diagnostic, 'spreadsheet').ok, false);
    });
});
