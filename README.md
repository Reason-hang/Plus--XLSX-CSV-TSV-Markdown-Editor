# Plus XLSX, CSV, TSV & Markdown Editor

这是一个面向 VS Code 系 IDE 的开源 Fork 项目，用于在编辑器内查看和编辑 XLSX、CSV、TSV 与 GitHub Flavored Markdown 文件。

项目基于上游 [`muhammad-ahmad.xlsx-viewer`](https://github.com/Mahmadabid/XLSX-CSV-TSV-MARKDOWN-Editor-Vscode-Extension) 的 `v1.9.97` 源码构建。本仓库当前包含一个本地 Markdown 外观补丁：为 `<mark>...</mark>` 提供全局橙色高亮，以及预览背景、文字、字号和行高等配置入口。

> 当前版本是本地开发补丁 `1.9.98-local.1`，尚未发布到 VS Code Marketplace 或 Open VSX。请不要将本仓库误认为原作者的官方商店扩展。

## 功能概览

### 电子表格编辑：XLSX、CSV、TSV

- 统一电子表格 Webview：XLSX、CSV、TSV 共用同一套表格界面和编辑链路。
- 类 Google Sheets 编辑：支持文字与背景颜色、删除线、对齐、边框、字号、字体、自动换行、清除格式和格式刷。
- CSV/TSV 样式模式：对于无法原生保存样式的分隔文本文件，可使用本地样式持久化。
- 单元格能力：支持复选框、下拉选项、评分、日期和图片等控件。
- 查找、排序、筛选：支持列头排序和包含、等于、前缀、非空、大小写敏感等筛选条件。
- 跨格式转换：可在 CSV、TSV、XLSX 之间转换。
- 历史版本与回退：可预览并恢复近期文件状态。
- 大文件虚拟滚动：降低大型 CSV、TSV、XLSX 文件的渲染压力。
- 表格选择与导航：支持多单元格、整行整列选择、调整宽高、自动适配和键盘导航。

### Markdown 查看与编辑

- 左右分栏编辑与同步滚动。
- 预览编辑模式：可在渲染后的预览区域修改 Markdown。
- 支持 GitHub Flavored Markdown，包括表格、任务列表、代码块和脚注。
- 自动目录面板，便于浏览长文档。
- 支持相对链接、本地图片、代码块复制与行号。
- 本地补丁版支持全局 `<mark>` 高亮；Markdown 正文只需写 `<mark>重点内容</mark>`。

## Markdown 全局外观补丁

在任一 Markdown 文档中使用：

```html
这是普通文字，<mark>这是重点文字</mark>，后面继续是普通文字。
```

默认效果为橙色背景 `#FF4E00`，不强制黑字或加粗。无需向每篇文档重复插入 `<style>` 或冗长的 `<span style="...">`。

可在 VS Code、Cursor 或 Antigravity 的用户设置中配置：

```jsonc
{
  "xlsxViewer.md.markBackgroundColor": "#FF4E00",
  "xlsxViewer.md.markTextColor": "inherit",
  "xlsxViewer.md.markFontWeight": "inherit",
  "xlsxViewer.md.markPadding": "0 2px",
  "xlsxViewer.md.markBorderRadius": "2px",
  "xlsxViewer.md.previewBackgroundColor": "#1E1E1E",
  "xlsxViewer.md.previewTextColor": "#D4D4D4",
  "xlsxViewer.md.previewFontSize": "15px",
  "xlsxViewer.md.previewLineHeight": "1.75"
}
```

完整的配置项、安装步骤、回退方法、构建方式与验证边界，请阅读：[本地 Markdown 外观补丁说明](README-LOCAL-PATCH.md)。

## 当前安装方式

当前分支尚未上架扩展商店，需自行构建 VSIX 后，通过 IDE 的 **Install from VSIX...** 安装。

```zsh
git clone https://github.com/Reason-hang/Plus--XLSX-CSV-TSV-Markdown-Editor.git
cd "Plus--XLSX-CSV-TSV-Markdown-Editor"
npm ci
npm run compile
npm run verify:local-patch
npx --yes @vscode/vsce package --out "release/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix"
```

然后在 VS Code、Cursor 或 Antigravity 中执行：

```text
Extensions: Install from VSIX...
```

选择刚生成的 VSIX 文件并重载窗口。

> 注意：当前补丁仍沿用上游扩展标识 `muhammad-ahmad.xlsx-viewer`，因此不能与原官方扩展并存。安装本地 VSIX 会替换同一 IDE 中的官方版；重新安装官方扩展即可回退。

## 开发与验证

```zsh
npm ci
npm run compile
npm run verify:local-patch
```

构建通过后，仍应在真实 IDE 中完成下列手工验收：

1. 打开 Markdown，确认编辑、保存、分栏预览和 `<mark>` 高亮正常。
2. 修改任一 `xlsxViewer.md.*` 配置，确认预览刷新后生效。
3. 分别打开、编辑并保存 XLSX、CSV、TSV，确认没有功能回归。
4. 在 VS Code、Cursor、Antigravity 各至少验证一次安装与基本使用。

## 公开发布计划

本项目后续若发布到 VS Code Marketplace 或 Open VSX，将以独立 Fork 身份发布：使用新的 Publisher、扩展名、`viewType`、命令 ID 和设置命名空间，避免与上游扩展发生冲突。当前不应使用本仓库内容替代或冒充原作者的商店扩展。

## 贡献与反馈

- 问题、建议和 Pull Request：请使用本仓库的 [Issues](https://github.com/Reason-hang/Plus--XLSX-CSV-TSV-Markdown-Editor/issues)。
- 上游功能问题或原始实现讨论：请前往 [上游仓库](https://github.com/Mahmadabid/XLSX-CSV-TSV-MARKDOWN-Editor-Vscode-Extension)。

## 许可证与来源说明

本项目沿用 [MIT License](LICENSE)。根据 MIT 许可证要求，原作者 Muhammad Ahmad 的版权与许可证文本已完整保留。

本项目是对上游 `muhammad-ahmad.xlsx-viewer` 的 Fork 和本地功能补丁，不与上游作者、其 Marketplace 发布者身份或其商店版本构成从属关系。
