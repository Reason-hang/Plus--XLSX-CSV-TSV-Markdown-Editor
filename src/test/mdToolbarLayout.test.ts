import * as assert from 'assert';
import { MD_CONFIGURABLE_ITEMS, MD_TOOLBAR_ITEMS, defaultMdToolbarLayout, isMdToolbarLayout, mdToolbarItemState, resolveMdToolbarLayout } from '../shared/mdToolbarLayout';

suite('Markdown 工具栏布局契约', () => {
    test('动作标识唯一，新版默认项包含字体大小控制与 Logo', () => {
        const order = defaultMdToolbarLayout().order;
        assert.strictEqual(new Set(MD_TOOLBAR_ITEMS.map(item => item.id)).size, MD_TOOLBAR_ITEMS.length);
        for (const id of ['increaseTextSize', 'decreaseTextSize', 'resetTextSize', 'info']) { assert.ok(order.includes(id)); }
        assert.ok(!MD_CONFIGURABLE_ITEMS.some(item => item.id === 'backToTop'));
    });

    test('旧顺序与隐藏项保留，新动作接入且固定入口不可隐藏', () => {
        const layout = resolveMdToolbarLayout({ version: 1, order: ['search', 'search', 'settings', 'futureAction'], hidden: ['rtl', 'rtl', 'save', 'cancel', 'settings', 'futureAction'] });
        assert.strictEqual(layout.order.filter(id => id === 'search').length, 1);
        assert.ok(layout.order.includes('futureAction'));
        assert.ok(layout.order.includes('increaseTextSize'));
        assert.deepStrictEqual(layout.hidden, ['rtl', 'futureAction']);
        assert.ok(!layout.order.includes('settings'));
    });

    test('旧版放置设置只在没有有效布局时使用', () => {
        const migrated = resolveMdToolbarLayout(null, true);
        assert.strictEqual(migrated.order[migrated.order.indexOf('help') - 1], 'mdAssociation');
        const custom = defaultMdToolbarLayout();
        custom.order.reverse();
        assert.deepStrictEqual(resolveMdToolbarLayout(custom, true).order, custom.order);
    });

    test('非法与超出限制的布局被拒绝，未知版本不被修改', () => {
        for (const raw of [null, [], { version: 1, order: ['<script>'], hidden: [] }, { version: 1, order: new Array(65).fill('x'), hidden: [] }, { version: 2, order: [], hidden: [] }]) {
            assert.strictEqual(isMdToolbarLayout(raw), false);
        }
        const future = { version: 99, custom: 'keep' };
        resolveMdToolbarLayout(future);
        assert.deepStrictEqual(future, { version: 99, custom: 'keep' });
    });

    test('隐藏偏好跨编辑、历史和保存状态保留，固定入口仍可使用', () => {
        const layout = defaultMdToolbarLayout();
        layout.hidden = ['splitEdit', 'rtl', 'save', 'cancel', 'settings'];
        for (const editing of [false, true]) {
            for (const history of [false, true]) {
                for (const saving of [false, true]) {
                    for (const id of ['splitEdit', 'rtl']) {
                        const item = MD_TOOLBAR_ITEMS.find(entry => entry.id === id)!;
                        assert.strictEqual(mdToolbarItemState(item, layout, { editing, history, saving, mdEnabled: true }).visible, false);
                    }
                }
            }
        }
        const state = (id: string, editing: boolean, history: boolean, saving = false) => mdToolbarItemState(MD_TOOLBAR_ITEMS.find(item => item.id === id)!, layout, { editing, history, saving, mdEnabled: true });
        assert.strictEqual(state('save', true, false).visible, true);
        assert.strictEqual(state('cancel', true, false).visible, true);
        assert.strictEqual(state('save', true, false, true).enabled, false);
        assert.strictEqual(state('save', true, true).visible, false);
        assert.strictEqual(state('settings', false, true).visible, true);
    });
});
