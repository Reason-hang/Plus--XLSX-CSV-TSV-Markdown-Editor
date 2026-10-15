/** Pure layout contract shared by the host and Webview. Never stores executable code. */
export interface MdToolbarItem {
    id: string;
    nodes: string[];
    zh: string;
    en: string;
    mode?: 'preview' | 'edit';
    liveOnly?: boolean;
    configurable?: boolean;
    blockWhileSaving?: boolean;
    kind?: 'action' | 'decoration';
}

export const MD_TOOLBAR_ITEMS: readonly MdToolbarItem[] = [
    { id: 'mdAssociation', nodes: ['enableMdEditorButton', 'disableMdEditorButton'], zh: '启用/禁用 MD', en: 'Enable/Disable MD', mode: 'preview', blockWhileSaving: true },
    { id: 'refresh', nodes: ['refreshButton'], zh: '刷新', en: 'Reload', mode: 'preview', liveOnly: true, blockWhileSaving: true },
    { id: 'editFile', nodes: ['toggleViewButton'], zh: '编辑文件', en: 'Edit file', liveOnly: true, blockWhileSaving: true },
    { id: 'splitEdit', nodes: ['toggleEditModeButton'], zh: '分屏编辑', en: 'Split edit', mode: 'preview', liveOnly: true, blockWhileSaving: true },
    { id: 'previewEdit', nodes: ['previewEditButton'], zh: '所见即所得', en: 'Preview edit', mode: 'preview', liveOnly: true, blockWhileSaving: true },
    { id: 'save', nodes: ['saveEditsButton'], zh: '保存', en: 'Save', mode: 'edit', liveOnly: true, configurable: false, blockWhileSaving: true },
    { id: 'cancel', nodes: ['cancelEditsButton'], zh: '取消编辑', en: 'Cancel edit', mode: 'edit', liveOnly: true, configurable: false, blockWhileSaving: true },
    { id: 'outline', nodes: ['toggleTocButton'], zh: '大纲', en: 'Outline' },
    { id: 'rtl', nodes: ['toggleRtlButton'], zh: 'RTL 文本方向', en: 'RTL direction' },
    { id: 'backToTop', nodes: ['backToTopButton'], zh: '返回顶部', en: 'Back to top' },
    { id: 'search', nodes: ['searchButton'], zh: '搜索', en: 'Search' },
    { id: 'settings', nodes: ['openSettingsButton'], zh: '设置', en: 'Settings', configurable: false, blockWhileSaving: true },
    { id: 'theme', nodes: ['toggleBackgroundButton'], zh: '切换主题', en: 'Theme', mode: 'preview', blockWhileSaving: true },
    { id: 'language', nodes: ['toggleLanguageButton'], zh: '切换语言', en: 'Language', mode: 'preview' },
    { id: 'focus', nodes: ['focusModeButton'], zh: '专注模式', en: 'Focus mode', mode: 'preview' },
    { id: 'copyHtml', nodes: ['copyHtmlButton'], zh: '复制 HTML', en: 'Copy HTML', mode: 'preview' },
    { id: 'exportPdf', nodes: ['exportPdfButton'], zh: '导出 PDF', en: 'Export PDF', mode: 'preview' },
    { id: 'history', nodes: ['versionHistoryButton'], zh: '版本历史', en: 'Version history', mode: 'preview', blockWhileSaving: true },
    { id: 'projects', nodes: ['projectsButton'], zh: '其他项目', en: 'Other projects', mode: 'preview' },
    { id: 'help', nodes: ['helpButton'], zh: '帮助与反馈', en: 'Help & feedback', mode: 'preview' },
    { id: 'info', nodes: ['mdToolbarInfo'], zh: '说明图片/Logo', en: 'Info image/Logo', mode: 'preview', kind: 'decoration' }
];

export interface MdToolbarLayout { version: 1; order: string[]; hidden: string[]; }
export interface MdToolbarContext { editing: boolean; history: boolean; saving: boolean; mdEnabled: boolean; }
export const MD_CONFIGURABLE_ITEMS = MD_TOOLBAR_ITEMS.filter(item => item.configurable !== false);

export function isMdToolbarLayout(value: unknown): value is MdToolbarLayout {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { return false; }
    const layout = value as Record<string, unknown>;
    const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64 &&
        v.every(id => typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id));
    return layout.version === 1 && ids(layout.order) && ids(layout.hidden);
}

export function defaultMdToolbarLayout(moveAssociationToEnd = false): MdToolbarLayout {
    const order = MD_CONFIGURABLE_ITEMS.map(item => item.id);
    if (moveAssociationToEnd) {
        order.splice(order.indexOf('mdAssociation'), 1);
        order.splice(order.indexOf('help'), 0, 'mdAssociation');
    }
    return { version: 1, order, hidden: [] };
}

/** Preserve unknown IDs for downgrade/upgrade; only the catalog can render them. */
export function resolveMdToolbarLayout(raw: unknown, legacy = false): MdToolbarLayout {
    if (!isMdToolbarLayout(raw)) { return defaultMdToolbarLayout(legacy); }
    const protectedIds = new Set(MD_TOOLBAR_ITEMS.filter(item => item.configurable === false).map(item => item.id));
    const order = [...new Set(raw.order)].filter(id => !protectedIds.has(id));
    const defaults = defaultMdToolbarLayout().order;
    for (let i = 0; i < defaults.length; i++) {
        const id = defaults[i];
        if (order.includes(id)) { continue; }
        // New actions follow the next known default neighbor (backToTop precedes search).
        const next = defaults.slice(i + 1).find(other => order.includes(other));
        order.splice(next ? order.indexOf(next) : order.length, 0, id);
    }
    return { version: 1, order, hidden: [...new Set(raw.hidden)].filter(id => !protectedIds.has(id)) };
}

export function mdToolbarItemState(item: MdToolbarItem, layout: MdToolbarLayout, ctx: MdToolbarContext): { visible: boolean; enabled: boolean } {
    const allowed = (item.mode !== 'preview' || !ctx.editing) && (item.mode !== 'edit' || ctx.editing) && (!item.liveOnly || !ctx.history);
    return {
        visible: allowed && (item.configurable === false || !layout.hidden.includes(item.id)),
        enabled: allowed && !(ctx.saving && item.blockWhileSaving)
    };
}
