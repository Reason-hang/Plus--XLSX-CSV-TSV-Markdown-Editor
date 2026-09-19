import { Icons } from '../../shared/icons';
import { ToolbarButton } from '../../shared/toolbarManager';

export interface CreateXlsxToolbarButtonsOptions {
    onFind: () => void;
    textColorIcon: string;
    bgColorIcon: string;
    onEditFile: () => void;
    onToggleTableEdit: () => void;
    onSaveTableEdits: () => void;
    onCancelTableEdits: () => void;
    onInsertControl: () => void;
    onFormatBold: () => void;
    onFormatItalic: () => void;
    onFormatTextColor: () => void;
    onFormatBackgroundColor: () => void;
    onToggleExpand: () => void;
    onTogglePlainView: () => void;
    onVersionHistory: () => void;
    onOpenSettings: () => void;
    onToggleBackground: () => void;
    onHelp: () => void;
    onConvertFile: () => void;
    onEnableAsDefault: () => void;
    onRefresh: () => void;
    onToggleRtl: () => void;
    onProjects: () => void;
}

export function createXlsxToolbarButtons(options: CreateXlsxToolbarButtonsOptions): ToolbarButton[] {
    return [
        {
            id: 'enableAsDefaultButton',
            icon: Icons.Zap,
            label: '设为默认',
            tooltip: '将表格查看器设为 XLSX 文件的默认编辑器',
            hidden: true,
            onClick: options.onEnableAsDefault
        },
        {
            id: 'refreshButton',
            icon: Icons.Refresh,
            tooltip: '从磁盘重新加载文件',
            cls: 'icon-only',
            onClick: options.onRefresh
        },
        {
            id: 'toggleRtlButton',
            icon: Icons.TextDirection,
            label: 'RTL',
            tooltip: '切换从右到左（RTL）/ 从左到右（LTR）文字方向',
            onClick: options.onToggleRtl
        },
        {
            id: 'editFileButton',
            icon: Icons.EditFile,
            label: '编辑文件',
            tooltip: '在默认文本编辑器中打开此文件',
            hidden: true,
            onClick: options.onEditFile
        },
        {
            id: 'toggleTableEditButton',
            icon: '',
            label: '编辑表格',
            tooltip: '直接在表格中编辑 XLSX（仅文本）',
            onClick: options.onToggleTableEdit
        },
        {
            id: 'saveTableEditsButton',
            icon: Icons.Save,
            tooltip: '保存表格编辑',
            cls: 'icon-only',
            hidden: true,
            onClick: options.onSaveTableEdits
        },
        {
            id: 'cancelTableEditsButton',
            icon: Icons.Cancel,
            label: '取消',
            tooltip: '取消表格编辑',
            hidden: true,
            onClick: options.onCancelTableEdits
        },
        {
            id: 'formatBoldButton',
            icon: Icons.Bold,
            cls: 'icon-only',
            tooltip: '将选中文字加粗（Ctrl/Cmd+B）',
            hidden: true,
            onClick: options.onFormatBold
        },
        {
            id: 'formatItalicButton',
            icon: Icons.Italic,
            cls: 'icon-only',
            tooltip: '将选中文字设为斜体（Ctrl/Cmd+I）',
            hidden: true,
            onClick: options.onFormatItalic
        },
        {
            id: 'formatTextColorButton',
            icon: options.textColorIcon,
            cls: 'icon-only',
            tooltip: '设置选中文字颜色',
            hidden: true,
            onClick: options.onFormatTextColor
        },
        {
            id: 'formatBackgroundColorButton',
            icon: options.bgColorIcon,
            cls: 'icon-only',
            tooltip: '设置选中文字背景色',
            hidden: true,
            onClick: options.onFormatBackgroundColor
        },
        {
            id: 'toggleExpandButton',
            icon: Icons.Expand,
            label: '展开',
            tooltip: '切换列宽（默认 / 全部展开）',
            onClick: options.onToggleExpand
        },
        {
            id: 'findButton',
            icon: Icons.Search,
            cls: 'icon-only',
            tooltip: '在工作表中查找（Ctrl/Cmd+F）',
            onClick: options.onFind
        },
        {
            id: 'togglePlainViewButton',
            icon: Icons.Table,
            label: '纯文本',
            tooltip: '切换纯文本视图（移除所有样式）',
            onClick: options.onTogglePlainView
        },
        {
            id: 'openSettingsButton',
            icon: Icons.Settings,
            tooltip: '工作表设置',
            cls: 'icon-only',
            onClick: options.onOpenSettings
        },
        {
            id: 'insertControlButton',
            icon: Icons.TableInsert,
            label: '插入',
            tooltip: '向选中单元格插入复选框、下拉列表、评分或日期',
            hidden: true,
            onClick: options.onInsertControl
        },
        {
            id: 'toggleBackgroundButton',
            icon: Icons.ThemeLight + Icons.ThemeDark + Icons.ThemeVSCode,
            tooltip: '切换主题',
            onClick: options.onToggleBackground
        },
        {
            id: 'versionHistoryButton',
            icon: Icons.VersionHistory,
            tooltip: '版本历史',
            cls: 'icon-only',
            onClick: options.onVersionHistory
        },
        {
            id: 'convertFileButton',
            icon: Icons.Convert,
            label: '转换',
            tooltip: '将此文件转换为 CSV、TSV 或 XLSX',
            onClick: options.onConvertFile
        },
        {
            id: 'projectsButton',
            icon: Icons.Link,
            tooltip: '其他项目',
            cls: 'icon-only',
            onClick: options.onProjects
        },
        {
            id: 'helpButton',
            icon: Icons.Help,
            tooltip: '帮助与反馈',
            cls: 'icon-only',
            onClick: options.onHelp
        }
    ];
}
