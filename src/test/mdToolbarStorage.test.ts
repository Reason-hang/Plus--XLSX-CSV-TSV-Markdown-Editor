import * as assert from 'assert';
import type { Memento } from 'vscode';
import { MdToolbarStorage } from '../shared/mdToolbarStorage';
import { defaultMdToolbarLayout } from '../shared/mdToolbarLayout';

suite('Markdown 工具栏持久化', () => {
    test('旧设置只读取，保存成功后从扩展状态恢复', async () => {
        const data = new Map<string, unknown>();
        const state = { get: (key: string) => data.get(key), update: async (key: string, value: unknown) => { data.set(key, value); }, keys: () => [...data.keys()] } as Memento;
        const legacy = defaultMdToolbarLayout();
        const storage = new MdToolbarStorage(state, () => legacy);
        const initial = storage.read();
        assert.strictEqual(data.size, 0);
        const layout = { ...legacy, hidden: ['rtl', 'info'] };
        const saved = await storage.save(layout, initial.revision);
        assert.deepStrictEqual(saved.layout, layout);
        assert.deepStrictEqual(new MdToolbarStorage(state, () => null).read().layout, layout);
        await assert.rejects(storage.save(legacy, initial.revision), /布局已发生变化/);
        assert.deepStrictEqual(storage.read().layout, layout);
    });

    test('存储失败不覆盖原布局，后续重试仍可保存', async () => {
        const data = new Map<string, unknown>();
        let fail = true;
        const state = { get: (key: string) => data.get(key), update: async (key: string, value: unknown) => { if (fail) { throw new Error('写入失败'); } data.set(key, value); }, keys: () => [...data.keys()] } as Memento;
        const storage = new MdToolbarStorage(state, () => null);
        const initial = storage.read();
        const layout = defaultMdToolbarLayout();
        await assert.rejects(storage.save(layout, initial.revision), /写入失败/);
        assert.strictEqual(storage.read().revision, initial.revision);
        fail = false;
        assert.deepStrictEqual((await storage.save(layout, initial.revision)).layout, layout);
    });
});
