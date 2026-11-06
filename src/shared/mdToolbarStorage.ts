import { createHash } from 'crypto';
import type { Memento } from 'vscode';
import { MdToolbarLayout, resolveMdToolbarLayout } from './mdToolbarLayout';

const KEY = 'mdToolbarLayout.v1';

/** 扩展状态为首选；仅在不存在新数据时读取旧设置，原值不被迁移读取覆盖。 */
export class MdToolbarStorage {
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly state: Memento, private readonly readLegacy: () => unknown) {}

    read(): { layout: unknown; revision: string } {
        const stored = this.state.get<unknown>(KEY);
        const layout = stored === undefined ? this.readLegacy() ?? null : stored;
        return { layout, revision: createHash('sha256').update(JSON.stringify(layout)).digest('hex') };
    }

    async save(layout: MdToolbarLayout, revision: string): Promise<{ layout: unknown; revision: string }> {
        const operation = this.queue.then(async () => {
            if (this.read().revision !== revision) { throw new Error('布局已发生变化，请重新打开配置后再应用。'); }
            await this.state.update(KEY, resolveMdToolbarLayout(layout));
            return this.read();
        });
        this.queue = operation.then(() => undefined, () => undefined);
        return operation;
    }
}
