import * as assert from 'assert';
import { getPreviewEditTrailingNewlines, hasUnsafePreviewEditSource } from '../webviews/md/previewEditSafety';

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
});
