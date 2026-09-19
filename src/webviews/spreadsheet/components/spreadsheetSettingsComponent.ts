import { SettingDefinition } from '../../shared/settingsManager';

export interface XlsxViewSettings {
    firstRowIsHeader: boolean;
    stickyToolbar: boolean;
    stickyHeader: boolean;
    autoSave: boolean;
    autoSaveMode: 'all' | 'controlsOnly';
    showManualSavePopup: boolean;
    showPopups: boolean;
    allowInteractiveControlsOutsideEditMode: boolean;
    hyperlinkPreview: boolean;
    spaciousCells: boolean;
    mergeWarningEnabled: boolean;
    isDefaultEditor?: boolean;
    textWrap: boolean;
    csvSeparator?: ',' | ';';
    textDirection?: 'auto' | 'ltr' | 'rtl';
}

export const defaultXlsxViewSettings: XlsxViewSettings = {
    firstRowIsHeader: true,
    stickyToolbar: true,
    stickyHeader: false,
    autoSave: false,
    autoSaveMode: 'all',
    showManualSavePopup: true,
    showPopups: true,
    allowInteractiveControlsOutsideEditMode: true,
    hyperlinkPreview: true,
    spaciousCells: false,
    mergeWarningEnabled: true,
    isDefaultEditor: true,
    textWrap: false,
    csvSeparator: ',',
    textDirection: 'auto'
};

export function normalizeXlsxSettings(next: any, previous: XlsxViewSettings): XlsxViewSettings {
    const normalized: XlsxViewSettings = {
        firstRowIsHeader: next && typeof next.firstRowIsHeader === 'boolean' ? next.firstRowIsHeader : previous.firstRowIsHeader,
        stickyToolbar: next && typeof next.stickyToolbar === 'boolean' ? next.stickyToolbar : previous.stickyToolbar,
        stickyHeader: next && typeof next.stickyHeader === 'boolean' ? next.stickyHeader : previous.stickyHeader,
        autoSave: next && typeof next.autoSave === 'boolean' ? next.autoSave : previous.autoSave,
        autoSaveMode: next && (next.autoSaveMode === 'all' || next.autoSaveMode === 'controlsOnly') ? next.autoSaveMode : previous.autoSaveMode,
        showManualSavePopup: next && typeof next.showManualSavePopup === 'boolean' ? next.showManualSavePopup : previous.showManualSavePopup,
        showPopups: next && typeof next.showPopups === 'boolean' ? next.showPopups : (previous.showPopups !== undefined ? previous.showPopups : true),
        allowInteractiveControlsOutsideEditMode: next && typeof next.allowInteractiveControlsOutsideEditMode === 'boolean' ? next.allowInteractiveControlsOutsideEditMode : previous.allowInteractiveControlsOutsideEditMode,
        hyperlinkPreview: next && typeof next.hyperlinkPreview === 'boolean' ? next.hyperlinkPreview : previous.hyperlinkPreview,
        spaciousCells: next && typeof next.spaciousCells === 'boolean' ? next.spaciousCells : previous.spaciousCells,
        mergeWarningEnabled: next && typeof next.mergeWarningEnabled === 'boolean' ? next.mergeWarningEnabled : previous.mergeWarningEnabled,
        isDefaultEditor: next && typeof next.isDefaultEditor === 'boolean' ? next.isDefaultEditor : previous.isDefaultEditor,
        textWrap: next && typeof next.textWrap === 'boolean' ? next.textWrap : previous.textWrap,
        csvSeparator: next && (next.csvSeparator === ',' || next.csvSeparator === ';') ? next.csvSeparator : (previous.csvSeparator || ','),
        textDirection: next && (next.textDirection === 'rtl' || next.textDirection === 'ltr' || next.textDirection === 'auto') ? next.textDirection : (previous.textDirection || 'auto')
    };

    if (!normalized.firstRowIsHeader) {
        normalized.stickyHeader = false;
    }

    return normalized;
}

export function syncSettingsCheckboxes(settings: XlsxViewSettings, fileType?: string): void {
    const chkHeader = document.getElementById('chkHeaderRow') as HTMLInputElement | null;
    const chkSticky = document.getElementById('chkStickyHeader') as HTMLInputElement | null;
    const chkToolbar = document.getElementById('chkStickyToolbar') as HTMLInputElement | null;
    const chkAutoSave = document.getElementById('chkAutoSave') as HTMLInputElement | null;
    const radioAutoSaveAll = document.getElementById('radioAutoSaveAll') as HTMLInputElement | null;
    const radioAutoSaveControlsOnly = document.getElementById('radioAutoSaveControlsOnly') as HTMLInputElement | null;
    const chkManualSavePopup = document.getElementById('chkShowManualSavePopup') as HTMLInputElement | null;
    const chkShowPopups = document.getElementById('chkShowPopups') as HTMLInputElement | null;
    const chkOutsideControls = document.getElementById('chkAllowInteractiveControlsOutsideEditMode') as HTMLInputElement | null;
    const chkHyperlink = document.getElementById('chkHyperlinkPreview') as HTMLInputElement | null;
    const chkSpacious = document.getElementById('chkSpaciousCells') as HTMLInputElement | null;
    const chkTextWrap = document.getElementById('chkTextWrap') as HTMLInputElement | null;
    const chkMergeWarning = document.getElementById('chkMergeWarningEnabled') as HTMLInputElement | null;

    const radioCsvSeparatorComma = document.getElementById('radioCsvSeparatorComma') as HTMLInputElement | null;
    const radioCsvSeparatorSemicolon = document.getElementById('radioCsvSeparatorSemicolon') as HTMLInputElement | null;

    if (chkHeader) chkHeader.checked = !!settings.firstRowIsHeader;
    if (chkSticky) {
        chkSticky.checked = !!settings.stickyHeader;
        chkSticky.disabled = !settings.firstRowIsHeader;
        if (chkSticky.parentElement) {
            chkSticky.parentElement.style.opacity = !settings.firstRowIsHeader ? '0.5' : '1';
            chkSticky.parentElement.style.pointerEvents = !settings.firstRowIsHeader ? 'none' : 'auto';
        }
    }
    if (chkToolbar) chkToolbar.checked = !!settings.stickyToolbar;
    if (chkAutoSave) chkAutoSave.checked = !!settings.autoSave;
    if (radioAutoSaveAll) radioAutoSaveAll.checked = settings.autoSaveMode !== 'controlsOnly';
    if (radioAutoSaveControlsOnly) radioAutoSaveControlsOnly.checked = settings.autoSaveMode === 'controlsOnly';
    if (chkManualSavePopup) chkManualSavePopup.checked = !!settings.showManualSavePopup;
    if (chkShowPopups) chkShowPopups.checked = settings.showPopups !== false;
    if (chkOutsideControls) chkOutsideControls.checked = !!settings.allowInteractiveControlsOutsideEditMode;
    if (chkHyperlink) chkHyperlink.checked = !!settings.hyperlinkPreview;
    if (chkSpacious) chkSpacious.checked = !!settings.spaciousCells;
    if (chkTextWrap) chkTextWrap.checked = !!settings.textWrap;
    if (chkMergeWarning) chkMergeWarning.checked = !!settings.mergeWarningEnabled;

    if (radioCsvSeparatorComma) radioCsvSeparatorComma.checked = settings.csvSeparator !== ';';
    if (radioCsvSeparatorSemicolon) radioCsvSeparatorSemicolon.checked = settings.csvSeparator === ';';

    const autoSaveEnabled = !!settings.autoSave;
    const manualSaveItem = chkManualSavePopup?.closest('.setting-item') as HTMLElement | null;
    const autoSaveAllItem = radioAutoSaveAll?.closest('.setting-item') as HTMLElement | null;
    const autoSaveControlsItem = radioAutoSaveControlsOnly?.closest('.setting-item') as HTMLElement | null;

    const commaItem = radioCsvSeparatorComma?.closest('.setting-item') as HTMLElement | null;
    const semicolonItem = radioCsvSeparatorSemicolon?.closest('.setting-item') as HTMLElement | null;

    if (manualSaveItem) {
        manualSaveItem.style.display = autoSaveEnabled ? 'none' : 'inline-flex';
    }
    if (autoSaveAllItem) {
        autoSaveAllItem.style.display = autoSaveEnabled ? 'inline-flex' : 'none';
    }
    if (autoSaveControlsItem) {
        autoSaveControlsItem.style.display = autoSaveEnabled ? 'inline-flex' : 'none';
    }

    if (commaItem) {
        commaItem.style.display = fileType === 'csv' ? 'inline-flex' : 'none';
    }
    if (semicolonItem) {
        semicolonItem.style.display = fileType === 'csv' ? 'inline-flex' : 'none';
    }
}

export function createXlsxSettingsDefinitions(
    getSettings: () => XlsxViewSettings,
    onApply: (next: XlsxViewSettings) => void,
    onPersist: () => void
): SettingDefinition[] {
    const applyAndPersist = (patch: Partial<XlsxViewSettings>) => {
        const settings = getSettings();
        const next: XlsxViewSettings = {
            ...settings,
            ...patch
        };

        if (!next.firstRowIsHeader) {
            next.stickyHeader = false;
        }

        onApply(next);
        onPersist();
    };

    return [
        {
            id: 'chkHeaderRow',
            label: '首行作为表头',
            tooltip: '将工作表第一行视为表头。',
            onChange: (val: boolean) => {
                const settings = getSettings();
                applyAndPersist({
                    firstRowIsHeader: val,
                    stickyHeader: val ? settings.stickyHeader : false
                });
            },
            defaultValue: getSettings().firstRowIsHeader
        },
        {
            id: 'chkStickyHeader',
            label: '固定表头',
            tooltip: '垂直滚动时保持表头可见。',
            onChange: (val: boolean) => {
                const settings = getSettings();
                applyAndPersist({ stickyHeader: settings.firstRowIsHeader ? val : false });
            },
            defaultValue: getSettings().stickyHeader
        },
        {
            id: 'chkStickyToolbar',
            label: '固定工具栏',
            tooltip: '滚动工作表时将顶部工具栏固定。',
            onChange: (val: boolean) => {
                applyAndPersist({ stickyToolbar: val });
            },
            defaultValue: getSettings().stickyToolbar
        },
        {
            id: 'chkAllowInteractiveControlsOutsideEditMode',
            label: '无需编辑模式即可操作复选框/下拉列表',
            tooltip: '无需进入表格编辑模式，即可切换复选框和选择下拉列表。',
            onChange: (val: boolean) => {
                applyAndPersist({ allowInteractiveControlsOutsideEditMode: val });
            },
            defaultValue: getSettings().allowInteractiveControlsOutsideEditMode
        },
        {
            id: 'chkHyperlinkPreview',
            label: '超链接预览',
            tooltip: '显示超链接悬停操作，包括在浏览器中打开和复制链接。',
            onChange: (val: boolean) => {
                applyAndPersist({ hyperlinkPreview: val });
            },
            defaultValue: getSettings().hyperlinkPreview
        },
        {
            id: 'chkSpaciousCells',
            label: '宽松单元格',
            tooltip: '增加行高和内边距，提升可读性。',
            onChange: (val: boolean) => {
                applyAndPersist({ spaciousCells: val });
            },
            defaultValue: getSettings().spaciousCells
        },
        {
            id: 'chkTextWrap',
            label: '单元格自动换行',
            tooltip: '默认启用单元格内文字自动换行。',
            onChange: (val: boolean) => {
                applyAndPersist({ textWrap: val });
            },
            defaultValue: getSettings().textWrap
        },
        {
            id: 'chkMergeWarningEnabled',
            label: '合并警告弹窗',
            tooltip: '合并单元格前请求确认，因为仅保留左上角单元格的值。',
            onChange: (val: boolean) => {
                applyAndPersist({ mergeWarningEnabled: val });
            },
            defaultValue: getSettings().mergeWarningEnabled
        },
        {
            id: 'chkAutoSave',
            label: '自动保存',
            tooltip: '文字、复选框、下拉列表或格式变更后自动保存。',
            onChange: (val: boolean) => {
                applyAndPersist({ autoSave: val });
            },
            defaultValue: getSettings().autoSave
        },
        {
            id: 'radioAutoSaveAll',
            label: '自动保存全部更改',
            tooltip: '自动保存所有待处理的工作表修改，包括文字、格式和结构操作。',
            className: 'setting-dependent setting-autosave-dependent',
            inputType: 'radio',
            groupName: 'xlsxAutoSaveMode',
            value: 'all',
            onChange: (val: string) => {
                applyAndPersist({ autoSaveMode: val === 'controlsOnly' ? 'controlsOnly' : 'all' });
            },
            defaultValue: getSettings().autoSaveMode === 'all'
        },
        {
            id: 'radioAutoSaveControlsOnly',
            label: '仅自动保存复选框/下拉列表',
            tooltip: '仅在复选框或下拉列表变更时触发自动保存。',
            className: 'setting-dependent setting-autosave-dependent',
            inputType: 'radio',
            groupName: 'xlsxAutoSaveMode',
            value: 'controlsOnly',
            onChange: (val: string) => {
                applyAndPersist({ autoSaveMode: val === 'controlsOnly' ? 'controlsOnly' : 'all' });
            },
            defaultValue: getSettings().autoSaveMode === 'controlsOnly'
        },
        {
            id: 'chkShowManualSavePopup',
            label: '手动保存提醒（关闭自动保存时）',
            tooltip: '关闭自动保存时，编辑后显示简短的手动保存提醒。',
            className: 'setting-dependent setting-autosave-dependent',
            onChange: (val: boolean) => {
                applyAndPersist({ showManualSavePopup: val });
            },
            defaultValue: getSettings().showManualSavePopup
        },
        {
            id: 'chkShowPopups',
            label: '显示通知弹窗',
            tooltip: '编辑时显示通知弹窗（例如保存/自动保存提示）；取消勾选可关闭。',
            onChange: (val: boolean) => {
                applyAndPersist({ showPopups: val });
            },
            defaultValue: getSettings().showPopups !== false
        },
        {
            id: 'radioCsvSeparatorComma',
            label: 'CSV 分隔符：逗号（,）',
            tooltip: '保存 CSV 文件时使用逗号作为分隔符。',
            inputType: 'radio',
            groupName: 'csvSeparatorMode',
            value: ',',
            onChange: (val: string) => {
                applyAndPersist({ csvSeparator: ',' });
            },
            defaultValue: getSettings().csvSeparator !== ';'
        },
        {
            id: 'radioCsvSeparatorSemicolon',
            label: 'CSV 分隔符：分号（;）',
            tooltip: '保存 CSV 文件时使用分号作为分隔符。',
            inputType: 'radio',
            groupName: 'csvSeparatorMode',
            value: ';',
            onChange: (val: string) => {
                applyAndPersist({ csvSeparator: ';' });
            },
            defaultValue: getSettings().csvSeparator === ';'
        }
    ];
}
