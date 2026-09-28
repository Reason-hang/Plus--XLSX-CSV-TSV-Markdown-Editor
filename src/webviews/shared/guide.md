# Webview 共享组件说明

## 目录

- [组件](#组件)
- [Markdown 外置主题](#markdown-外置主题)

本目录存放 Markdown、CSV、TSV、XLSX Webview 共用的前端组件与工具。

## 组件

### `common.ts`

通用工具与常量：VS Code API 包装、虚拟滚动参数、`debounce` 等。

### `virtualLoader.ts`

虚拟滚动数据加载器，负责向扩展宿主请求表格行数据。

### `themeManager.ts`

管理浅色、深色和 VS Code 高对比度主题切换。

### `settingsManager.ts`

管理设置面板及设置持久化。

### `toolbarManager.ts`

管理工具栏按钮、分组与状态。

### `utils.ts`

常用前端工具，包括 DOM 查询、提示消息、剪贴板、HTML 转义与单元格文本规范化。

### `icons.ts`

工具栏使用的 SVG 图标字符串。

### `infoTooltip.ts`

在工具栏注入说明性提示，用于解释视图切换等操作。

## Markdown 外置主题

完整主题不放在本目录。扩展宿主读取 `xlsxViewer.md.theme.cssFile` 指向的已编译 CSS，并在 Markdown Webview 中以最后加载的 `<style>` 注入。主题源码、构建器、MPE 适配层和迁移审计器均位于 `themes/markdown-theme/`；详细规则见其 [README](../../../themes/markdown-theme/README.md)。
