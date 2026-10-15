import * as assert from 'assert';
import { MD_CONFIGURABLE_ITEMS, MD_TOOLBAR_ITEMS, defaultMdToolbarLayout, isMdToolbarLayout, mdToolbarItemState, resolveMdToolbarLayout } from '../shared/mdToolbarLayout';
import { validateWebviewMessage } from '../shared/webviewMessageSchema';

describe('Markdown toolbar layout contract', () => {
    it('puts back-to-top directly before search and includes the logo item', () => {
        const layout = defaultMdToolbarLayout();
        assert.equal(layout.order[layout.order.indexOf('search') - 1], 'backToTop');
        assert.ok(layout.order.includes('info'));
        assert.equal(new Set(MD_TOOLBAR_ITEMS.map(item => item.id)).size, MD_TOOLBAR_ITEMS.length);
    });

    it('migrates the legacy placement only while no valid custom layout exists', () => {
        const migrated = resolveMdToolbarLayout(null, true);
        assert.equal(migrated.order[migrated.order.indexOf('help') - 1], 'mdAssociation');
        const custom = defaultMdToolbarLayout();
        custom.order.reverse();
        assert.deepStrictEqual(resolveMdToolbarLayout(custom, true).order, custom.order);
    });

    it('normalizes duplicates and protects fixed controls', () => {
        const layout = resolveMdToolbarLayout({ version: 1, order: ['search', 'search', 'settings'], hidden: ['save', 'cancel', 'settings', 'rtl', 'rtl'] });
        assert.equal(layout.order.filter(id => id === 'search').length, 1);
        assert.deepStrictEqual(layout.hidden, ['rtl']);
        assert.equal(layout.order.length, MD_CONFIGURABLE_ITEMS.length);
    });

    it('adds a new known action near its declared neighbor without resetting saved order', () => {
        const old = defaultMdToolbarLayout();
        old.order = old.order.filter(id => id !== 'backToTop');
        [old.order[0], old.order[1]] = [old.order[1], old.order[0]];
        old.hidden = ['theme'];
        const upgraded = resolveMdToolbarLayout(old);
        assert.deepStrictEqual(upgraded.order.slice(0, 2), old.order.slice(0, 2));
        assert.equal(upgraded.order[upgraded.order.indexOf('search') - 1], 'backToTop');
        assert.deepStrictEqual(upgraded.hidden, ['theme']);
    });

    it('preserves future IDs without rendering them and does not mutate unsupported data', () => {
        const raw = { version: 1, order: ['futureAction', 'search'], hidden: ['futureAction'] };
        const layout = resolveMdToolbarLayout(raw);
        assert.ok(layout.order.includes('futureAction'));
        assert.ok(layout.hidden.includes('futureAction'));
        assert.ok(!MD_CONFIGURABLE_ITEMS.some(item => item.id === 'futureAction'));
        const future = { version: 99, custom: 'keep' };
        resolveMdToolbarLayout(future);
        assert.deepStrictEqual(future, { version: 99, custom: 'keep' });
    });

    it('rejects malformed, executable and oversized layouts at the host boundary', () => {
        for (const raw of [null, [], { version: 1, order: ['<script>'], hidden: [] }, { version: 1, order: new Array(65).fill('x'), hidden: [] }, { version: 2, order: [], hidden: [] }]) {
            assert.equal(isMdToolbarLayout(raw), false);
            assert.equal(validateWebviewMessage({ command: 'saveMdToolbarLayout', requestId: 'test', revision: 'a'.repeat(64), layout: raw }, 'markdown').ok, false);
        }
        const message = { command: 'saveMdToolbarLayout', requestId: 'test', revision: 'a'.repeat(64), layout: defaultMdToolbarLayout() };
        assert.equal(validateWebviewMessage(message, 'markdown').ok, true);
        assert.equal(validateWebviewMessage(message, 'spreadsheet').ok, false);
        assert.equal(validateWebviewMessage({ ...message, revision: 'invalid' }, 'markdown').ok, false);
    });

    it('keeps user-hidden actions hidden across all modes and saving states', () => {
        const layout = defaultMdToolbarLayout(); layout.hidden = ['splitEdit', 'rtl'];
        for (const editing of [false, true]) {
            for (const history of [false, true]) {
                for (const saving of [false, true]) {
                    for (const id of layout.hidden) {
                        const item = MD_TOOLBAR_ITEMS.find(entry => entry.id === id)!;
                        assert.equal(mdToolbarItemState(item, layout, { editing, history, saving, mdEnabled: true }).visible, false);
                    }
                }
            }
        }
    });

    it('protects Save/Cancel and keeps history preview read-only', () => {
        const layout = defaultMdToolbarLayout(); layout.hidden = ['save', 'cancel', 'settings'];
        const state = (id: string, editing: boolean, history: boolean, saving = false) => mdToolbarItemState(MD_TOOLBAR_ITEMS.find(item => item.id === id)!, layout, { editing, history, saving, mdEnabled: true });
        assert.equal(state('save', true, false).visible, true);
        assert.equal(state('save', true, false, true).enabled, false);
        assert.equal(state('cancel', true, false).visible, true);
        assert.equal(state('splitEdit', false, true).visible, false);
        assert.equal(state('editFile', false, true).visible, false);
        assert.equal(state('save', true, true).visible, false);
        assert.equal(state('settings', false, true).visible, true);
        assert.equal(state('backToTop', false, true).enabled, true);
    });
});
