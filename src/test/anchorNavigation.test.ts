import * as assert from 'assert';
import { resolveHeadingId } from '../webviews/md/anchorNavigation';

suite('Markdown 正文目录锚点', () => {
    const headings = [
        { id: 'exact-id', text: '精确标题' },
        { id: 'guide', text: '操作指南（补充说明）' },
        { id: 'duplicate-1', text: '重复标题' },
        { id: 'duplicate-2', text: '重复标题' }
    ];

    test('精确 ID 优先于可读标题，支持百分号编码', () => {
        assert.strictEqual(resolveHeadingId('exact-id', '重复标题', headings), 'exact-id');
        assert.strictEqual(resolveHeadingId('exact%2Did', '', headings), 'exact-id');
    });

    test('仅对唯一标题进行回退，不猜测重复或不存在的目标', () => {
        assert.strictEqual(resolveHeadingId('unknown', '操作指南', headings), 'guide');
        assert.strictEqual(resolveHeadingId('unknown', '重复标题', headings), null);
        assert.strictEqual(resolveHeadingId('unknown', '不存在', headings), null);
        assert.strictEqual(resolveHeadingId('%E4%ZZ', '操作指南', headings), null);
    });
});
