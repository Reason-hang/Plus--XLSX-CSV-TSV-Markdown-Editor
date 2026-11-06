import { MD_CONFIGURABLE_ITEMS, MD_TOOLBAR_ITEMS, MdToolbarContext, MdToolbarLayout, defaultMdToolbarLayout, mdToolbarItemState, resolveMdToolbarLayout, isMdToolbarLayout } from '../../shared/mdToolbarLayout';
import { I18n } from '../shared/i18n';

interface LayoutHost {
    context: () => MdToolbarContext;
    save: (layout: MdToolbarLayout, requestId: string, revision: string) => void;
}

/** Owns presentation only. Reorders existing nodes without rebinding action handlers. */
export class MdToolbarController {
    private layout = defaultMdToolbarLayout();
    private draft = defaultMdToolbarLayout();
    private revision = '';
    private panel: HTMLDivElement;
    private list: HTMLDivElement;
    private status: HTMLParagraphElement;
    private preview: HTMLElement;
    private applyButton: HTMLButtonElement;
    private pending: string | null = null;
    private timer: number | undefined;
    private dragId: string | null = null;
    private discardArmed = false;
    private conflicting = false;
    private unsupported = false;
    private previousFocus: HTMLElement | null = null;
    private readonly nodes = new Map<string, HTMLElement[]>();
    private readonly itemsHost: HTMLDivElement;

    private t(zh: string, en: string): string { return I18n.getLanguage() === 'zh' ? zh : en; }
    private name(id: string): string {
        const item = MD_CONFIGURABLE_ITEMS.find(entry => entry.id === id);
        return item ? this.t(item.zh, item.en) : id;
    }

    constructor(private readonly host: LayoutHost) {
        const toolbar = document.getElementById('toolbar')!;
        this.itemsHost = document.createElement('div');
        this.itemsHost.className = 'md-toolbar-items';
        toolbar.classList.add('md-custom-toolbar');
        MD_TOOLBAR_ITEMS.forEach(item => {
            this.nodes.set(item.id, item.nodes.map(id => document.getElementById(id))
                .filter((el): el is HTMLElement => !!el)
                .map(el => {
                    const node = (el.closest('.tooltip') || el) as HTMLElement;
                    node.classList.remove('edit-mode-hide');
                    return node;
                }));
        });
        toolbar.appendChild(this.itemsHost);
        this.panel = document.createElement('div');
        this.panel.className = 'md-layout-backdrop';
        this.panel.hidden = true;
        this.panel.innerHTML = `<section class="md-layout-dialog" role="dialog" aria-modal="true" aria-labelledby="mdLayoutTitle">
            <header><h2 id="mdLayoutTitle"></h2><button type="button" data-close></button></header>
            <div class="md-layout-body"><details><summary data-preview-label></summary><div class="md-layout-preview"></div></details>
            <div class="md-layout-lists"></div></div>
            <footer><p data-fixed></p><p class="md-layout-status" role="status" aria-live="polite"></p>
            <div class="md-layout-actions"><button type="button" data-reset></button><span></span><button type="button" data-cancel></button><button type="button" data-apply></button></div></footer>
        </section>`;
        document.body.appendChild(this.panel);
        this.list = this.panel.querySelector('.md-layout-lists')!;
        this.status = this.panel.querySelector('.md-layout-status')!;
        this.preview = this.panel.querySelector('.md-layout-preview')!;
        this.applyButton = this.panel.querySelector('[data-apply]')!;
        this.panel.querySelector('[data-close]')!.addEventListener('click', () => this.close());
        this.panel.querySelector('[data-cancel]')!.addEventListener('click', () => this.close());
        this.panel.querySelector('[data-reset]')!.addEventListener('click', () => {
            if (this.pending) { return; }
            this.draft = defaultMdToolbarLayout(); this.conflicting = false; this.changed();
        });
        this.applyButton.addEventListener('click', () => this.save());
        this.panel.addEventListener('keydown', event => this.onKey(event));
        this.panel.addEventListener('click', event => { if (event.target === this.panel) { this.close(); } });
        I18n.onLanguageChange(() => { if (!this.panel.hidden) { this.render(); } });
    }

    receive(raw: unknown, revision: string, legacy: boolean): void {
        const wasDirty = this.dirty();
        const changed = revision !== this.revision;
        this.unsupported = !!raw && !isMdToolbarLayout(raw);
        this.layout = resolveMdToolbarLayout(raw, legacy);
        this.revision = revision;
        this.apply();
        if (!this.panel.hidden && changed && !this.pending) {
            if (wasDirty) {
                this.conflicting = true;
                this.say(this.t('布局已被其他窗口更新。请重新打开配置，或恢复默认后应用。', 'Layout changed elsewhere. Reopen or reset before applying.'));
                this.applyButton.disabled = true;
            } else { this.draft = this.clone(this.layout); this.render(); }
        }
        if (!this.panel.hidden && raw && !isMdToolbarLayout(raw)) {
            this.say(this.t('现有配置格式不受支持，已显示默认布局；原配置未被覆盖。', 'Unsupported layout; showing defaults without overwriting the original.'));
        }
    }

    apply(): void {
        const ctx = this.host.context();
        const ordered = [...this.layout.order, 'save', 'cancel', 'settings'];
        for (const id of ordered) {
            const item = MD_TOOLBAR_ITEMS.find(entry => entry.id === id);
            if (!item) { continue; }
            const state = mdToolbarItemState(item, this.layout, ctx);
            for (const node of this.nodes.get(id) || []) {
                const button = node.querySelector('button');
                const associationMatch = id !== 'mdAssociation' || button?.id === (ctx.mdEnabled ? 'disableMdEditorButton' : 'enableMdEditorButton');
                node.classList.toggle('hidden', !state.visible || !associationMatch);
                if (button) {
                    button.disabled = !state.enabled;
                    button.setAttribute('aria-label', this.t(item.zh, item.en));
                }
                const target = id === 'settings' ? document.getElementById('toolbar')! : this.itemsHost;
                target.appendChild(node);
            }
        }
    }

    open(): void {
        if (this.host.context().saving || !this.panel.hidden) { return; }
        const active = document.activeElement as HTMLElement;
        this.previousFocus = active?.getClientRects().length ? active : document.getElementById('openSettingsButton');
        this.draft = this.clone(this.layout); this.discardArmed = false; this.conflicting = false;
        this.panel.hidden = false;
        this.panel.querySelector('details')!.open = false;
        this.say(this.unsupported ? this.t('现有配置格式不受支持；原配置保留，应用后将使用本页布局。', 'Unsupported layout retained; applying will replace it with this layout.') : ''); this.render();
        (this.panel.querySelector('[data-close]') as HTMLElement).focus();
    }

    private close(): void {
        if (this.pending) { return; }
        if (this.dirty() && !this.discardArmed) {
            this.discardArmed = true;
            this.say(this.t('有未应用的布局，继续关闭将放弃修改。再次点击关闭或按 Esc 确认。', 'Unsaved layout. Close again or press Esc to discard.'));
            return;
        }
        this.panel.hidden = true;
        this.previousFocus?.focus({ preventScroll: true });
    }

    private clone(layout: MdToolbarLayout): MdToolbarLayout { return { version: 1, order: [...layout.order], hidden: [...layout.hidden] }; }
    private dirty(): boolean { return JSON.stringify(this.draft) !== JSON.stringify(this.layout); }
    private say(text: string): void { this.status.textContent = text; }
    private shown(): string[] { return this.draft.order.filter(id => MD_CONFIGURABLE_ITEMS.some(item => item.id === id) && !this.draft.hidden.includes(id)); }
    private changed(focusId?: string): void {
        this.discardArmed = false; this.say(''); this.render();
        if (focusId) { this.list.querySelector<HTMLElement>(`[data-item="${focusId}"]`)?.focus(); }
    }

    private render(): void {
        this.panel.querySelector('#mdLayoutTitle')!.textContent = this.t('自定义工具栏', 'Customize toolbar');
        this.panel.querySelector('[data-close]')!.textContent = this.t('关闭', 'Close');
        this.panel.querySelector('[data-cancel]')!.textContent = this.t('取消', 'Cancel');
        this.panel.querySelector('[data-reset]')!.textContent = this.t('恢复默认', 'Reset');
        this.applyButton.textContent = this.pending ? this.t('应用中…', 'Applying…') : this.t('应用布局', 'Apply layout');
        this.applyButton.disabled = !!this.pending || this.conflicting;
        this.panel.querySelector('[data-fixed]')!.textContent = this.t('固定保留：设置入口 · 保存/取消由编辑状态控制', 'Settings stays available; Save/Cancel follow edit state.');
        this.panel.querySelector('[data-preview-label]')!.textContent = this.t('预览布局', 'Preview layout');
        const shown = this.shown();
        this.preview.textContent = [...shown.map(id => this.name(id)), this.t('设置', 'Settings')].join('  ·  ');
        this.list.replaceChildren();
        const hidden = MD_CONFIGURABLE_ITEMS.filter(item => this.draft.hidden.includes(item.id)).map(item => item.id);
        for (const [ids, visible] of [[shown, true], [hidden, false]] as const) {
            const title = document.createElement('h3');
            title.textContent = visible ? this.t(`已显示 ${ids.length} 项 · 拖动排序，Alt + 方向键移动`, `${ids.length} shown · Drag or Alt + arrows to reorder`) : this.t(`未显示 ${ids.length} 项 · 点击添加`, `${ids.length} hidden · Click to add`);
            this.list.appendChild(title);
            const grid = document.createElement('div'); grid.className = 'md-layout-grid';
            this.list.appendChild(grid);
            for (const id of ids) {
                const card: HTMLElement = document.createElement(visible ? 'div' : 'button');
                card.className = 'md-layout-card'; card.dataset.item = id;
                card.tabIndex = 0;
                card.setAttribute('aria-label', this.name(id) + (visible ? this.t('，可拖动或用 Alt 加方向键排序', ', drag or Alt + arrows to reorder') : this.t('，添加到工具栏', ', add to toolbar')));
                if (visible) {
                    card.draggable = !this.pending;
                    const handle = document.createElement('span'); handle.textContent = '⠿'; handle.setAttribute('aria-hidden', 'true');
                    const label = document.createElement('span'); label.textContent = this.name(id); label.className = 'md-layout-name';
                    const hide = document.createElement('button'); hide.type = 'button'; hide.textContent = '×';
                    hide.title = this.t('从工具栏隐藏', 'Hide from toolbar'); hide.setAttribute('aria-label', `${hide.title}：${this.name(id)}`);
                    hide.disabled = !!this.pending;
                    hide.addEventListener('click', () => { this.draft.hidden.push(id); this.changed(id); });
                    card.append(handle, label, hide);
                    card.addEventListener('dragstart', event => {
                        this.dragId = id; event.dataTransfer?.setData('text/plain', id);
                        if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; }
                    });
                    card.addEventListener('dragover', event => {
                        if (!this.dragId || this.pending) { return; }
                        event.preventDefault();
                        const after = event.clientX > card.getBoundingClientRect().left + card.clientWidth / 2;
                        card.dataset.drop = after ? 'after' : 'before';
                    });
                    card.addEventListener('dragleave', () => { delete card.dataset.drop; });
                    card.addEventListener('drop', event => {
                        event.preventDefault();
                        const after = card.dataset.drop === 'after'; delete card.dataset.drop;
                        const source = this.dragId; this.dragId = null;
                        if (!source || source === id || this.pending) { return; }
                        this.draft.order = this.draft.order.filter(entry => entry !== source);
                        this.draft.order.splice(this.draft.order.indexOf(id) + (after ? 1 : 0), 0, source);
                        this.changed(source); this.announcePosition(source);
                    });
                    card.addEventListener('dragend', () => {
                        this.dragId = null; this.list.querySelectorAll('[data-drop]').forEach(el => el.removeAttribute('data-drop'));
                    });
                    card.addEventListener('keydown', event => {
                        if (!event.altKey || !event.key.startsWith('Arrow') || this.pending) { return; }
                        event.preventDefault();
                        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
                        const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -cols : cols;
                        const from = shown.indexOf(id); const to = Math.max(0, Math.min(shown.length - 1, from + delta));
                        if (from === to) { return; }
                        const target = shown[to];
                        this.draft.order = this.draft.order.filter(entry => entry !== id);
                        this.draft.order.splice(this.draft.order.indexOf(target) + (delta > 0 ? 1 : 0), 0, id);
                        this.changed(id); this.announcePosition(id);
                    });
                } else {
                    card.textContent = '+ ' + this.name(id); (card as HTMLButtonElement).disabled = !!this.pending;
                    card.addEventListener('click', () => {
                        if (this.pending) { return; }
                        this.draft.hidden = this.draft.hidden.filter(entry => entry !== id);
                        this.draft.order = [...this.draft.order.filter(entry => entry !== id), id]; this.changed(id);
                    });
                }
                grid.appendChild(card);
            }
        }
    }

    private announcePosition(id: string): void {
        const index = this.shown().indexOf(id) + 1;
        this.say(this.t(`${this.name(id)}已移到第 ${index} 项`, `${this.name(id)} moved to position ${index}`));
    }

    private onKey(event: KeyboardEvent): void {
        if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); this.close(); }
        if (event.key !== 'Tab') { return; }
        const els = Array.from(this.panel.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"], summary')).filter(el => el.getClientRects().length);
        const first = els[0]; const last = els[els.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }

    private save(): void {
        if (this.pending || this.conflicting) { return; }
        const id = 'layout-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        this.pending = id; this.say(''); this.render();
        this.host.save(this.clone(this.draft), id, this.revision);
        this.timer = window.setTimeout(() => {
            if (this.pending !== id) { return; }
            this.pending = null; this.render();
            this.say(this.t('保存响应超时，请重新打开配置核对后重试。', 'Save response timed out. Reopen to check before retrying.'));
            this.conflicting = true; this.applyButton.disabled = true;
        }, 15000);
    }

    saved(requestId: string, ok: boolean, message?: string): void {
        if (requestId !== this.pending) { return; }
        window.clearTimeout(this.timer); this.pending = null;
        if (ok) { this.layout = this.clone(this.draft); this.apply(); this.panel.hidden = true; this.previousFocus?.focus({ preventScroll: true }); }
        else { this.render(); this.say(message || this.t('保存失败，草稿已保留，请重试。', 'Save failed. Draft retained; retry.')); }
    }
}
