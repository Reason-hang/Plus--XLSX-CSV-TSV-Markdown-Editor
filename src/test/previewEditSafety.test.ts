import * as assert from 'assert';
import { getPreviewEditTrailingNewlines, hasUnsafePreviewEditSource, reconcileEditorLineEndings } from '../webviews/md/previewEditSafety';

suite('Markdown 预览编辑保真门禁', () => {
    test('围栏和制表符必须拒绝 DOM 往返', () => {
        assert.strictEqual(hasUnsafePreviewEditSource('```mermaid\ngraph TD\nA-->B\n```'), true);
        assert.strictEqual(hasUnsafePreviewEditSource('~~~js\nconsole.log(1)\n~~~'), true);
        assert.strictEqual(hasUnsafePreviewEditSource('甲\t乙'), true);
        assert.strictEqual(hasUnsafePreviewEditSource('普通段落\n\n**重点**'), false);
    });

    test('只允许空白尾行差异，其他源文差异必须拒绝', () => {
        assert.strictEqual(getPreviewEditTrailingNewlines('## 标题\n\n', '## 标题'), '\n\n');
        assert.strictEqual(getPreviewEditTrailingNewlines('正文', '正文'), '');
        assert.strictEqual(getPreviewEditTrailingNewlines('==高亮==\n', '高亮'), null);
        assert.strictEqual(getPreviewEditTrailingNewlines('第一行\r\n第二行\r\n', '第一行\n第二行'), null);
    });

    test('源码编辑只更改实际输入的范围，保留原有 CRLF 与混合换行', () => {
        const original = '甲\r\n乙\n丙\r\n';
        assert.strictEqual(reconcileEditorLineEndings(original, '甲\n乙\n丙\n'), original);
        const first = reconcileEditorLineEndings(original, '甲\n乙改\n丙\n');
        assert.strictEqual(first, '甲\r\n乙改\n丙\r\n');
        assert.strictEqual(reconcileEditorLineEndings(first, '甲改\n乙改\n丙\n'), '甲改\r\n乙改\n丙\r\n');
        assert.strictEqual(reconcileEditorLineEndings('甲\r\n乙\r\n', '甲\n新\n乙\n'), '甲\r\n新\r\n乙\r\n');
        assert.strictEqual(reconcileEditorLineEndings('甲\r乙\n', '甲\n乙改\n'), '甲\r乙改\n');
    });
});
