# Plus XLSX, CSV, TSV & Markdown Editor

## 目录

- [功能概览](#功能概览)
- [Markdown 完整主题增强](#markdown-完整主题增强)
- [重点高亮写法](#重点高亮写法)
- [相对上游 v1.9.97 的增强](#相对上游-v1997-的增强)
- [当前安装方式](#当前安装方式)
- [开发与验证](#开发与验证)
- [公开发布计划](#公开发布计划)
- [贡献与反馈](#贡献与反馈)
- [许可证与来源说明](#许可证与来源说明)

这是一个面向 VS Code 系 IDE 的开源 Fork 项目，用于在编辑器内查看和编辑 XLSX、CSV、TSV 与 GitHub Flavored Markdown 文件。

项目基于上游 [`muhammad-ahmad.xlsx-viewer`](https://github.com/Mahmadabid/XLSX-CSV-TSV-MARKDOWN-Editor-Vscode-Extension) 的 `v1.9.97` 源码构建。本仓库当前包含完整 Markdown 主题增强：用一份版本化 Less 主题生成单一 CSS，供本扩展与 Markdown Preview Enhanced（MPE）共同使用。

> 安全提示：当前锁文件在线审计结果为 8 项漏洞（4 low、3 moderate、1 high、0 critical）；运行时公式渲染已移除无修复的 `markdown-it-katex`，当前 high 项来自测试工具链。个人使用应优先打开可信 Markdown，公开发布前必须完成依赖处置。
> 当前版本是本地开发补丁 `1.9.98-local.6`，尚未发布到 VS Code Marketplace 或 Open VSX。请不要将本仓库误认为原作者的官方商店扩展。

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
- 对 Markdown 和表格外部输入执行 HTML/属性净化；保存前检测文件是否被外部修改，避免静默覆盖。

## Markdown 完整主题增强

在任一 Markdown 文档中使用：

```html
这是普通文字，<mark>这是重点文字</mark>，后面继续是普通文字。
```

默认效果为橙色背景 `#FF4E00`，不强制黑字或加粗。无需向每篇文档重复插入 `<style>` 或冗长的 `<span style="...">`。主题源码只维护一次，编译后可由 XLSX 插件和 MPE 共同加载。

预览背景和文字颜色默认留空，即自动跟随 IDE 的深色或浅色主题；深色主题下表头文字可见，正文表格按深浅交替显示。可在 VS Code、Cursor 或 Antigravity 的用户设置中显式覆盖：

```jsonc
{
  "xlsxViewer.md.markBackgroundColor": "#FF4E00",
  "xlsxViewer.md.markTextColor": "inherit",
  "xlsxViewer.md.markFontWeight": "inherit",
  "xlsxViewer.md.markPadding": "0 2px",
  "xlsxViewer.md.markBorderRadius": "2px",
  "xlsxViewer.md.previewBackgroundColor": "",
  "xlsxViewer.md.previewTextColor": "",
  "xlsxViewer.md.previewFontSize": "15px",
  "xlsxViewer.md.previewLineHeight": "1.75"
}
```

启用完整主题后，再追加以下用户设置：

```jsonc
{
  "xlsxViewer.md.theme.enabled": true,
  "xlsxViewer.md.theme.cssFile": "/仓库绝对路径/themes/markdown-theme/dist/markdown-theme.css",
  "xlsxViewer.md.theme.watch": true
}
```

完整的主题结构、MPE 适配、迁移审计、安装、回退、构建与验证边界，请阅读：[完整增强版说明](README-LOCAL-PATCH.md) 和 [主题目录说明](themes/markdown-theme/README.md)。

安全审计与修复证据见：[代码审计报告](docs/05-测试与验收/代码审计报告-2026-08-31.md)。

## 重点高亮写法

推荐始终成对使用标准 HTML 语义标签：

```html
<mark>重点内容</mark>
```

也支持 Markdown-it 扩展语法：

```markdown
==重点内容==
```

两种写法都会渲染为重点高亮。不要只写开标签 `<mark>`：HTML 解析器会自动补全结束位置，但高亮范围可能延伸到当前段落、表格单元格或其他块的末尾，容易误伤后续内容。`<mark>重点</mark>` 语义明确、兼容性最好，推荐用于多人协作文档；`==重点==` 更短，但容易被误认为普通等号。

选中 Markdown 文本后，按 `⌘ Command + ⌥ Option + ⇧ Shift + 3`，会立即写入 `<mark>选中文本</mark>`。原生 Markdown 编辑器和插件的 `Split Edit` 左侧编辑区都支持；右侧预览会实时显示橙色高亮。未选中文本时不会插入空标签。Windows/Linux 使用 `Ctrl + Alt + Shift + 3`。`⌘B` 仅用于加粗，`**重点**` 只会加粗，`!!重点!!`、`{{重点}}`、`%%重点%%` 不会高亮。不要再在 Markdown 正文中写 `<style>` 修改预览样式：它不是受支持的主题入口，安全渲染会净化危险样式。

## 相对上游 v1.9.97 的增强

当前本地包为 `1.9.98-local.6`；对比上游 `v1.9.97`（`cb1c765`），XLSX、CSV、TSV 原有编辑能力保持不变，新增与修复如下：

| 模块 | 新增或修改 | 实际作用 |
| --- | --- | --- |
| Markdown 外观 | 全局 `<mark>` 配置、预览背景/文字/字号/行高配置 | 统一重点样式和阅读体验，无需逐篇写内联样式 |
| 重点高亮快捷键 | `⌘⌥⇧3`（Windows/Linux：`Ctrl+Alt+Shift+3`）将选区写成 `<mark>…</mark>` | 编辑和预览同步高亮，文档可保存、可跨 IDE 阅读 |
| 统一主题 | Less 单一主题源、外置 CSS、manifest 校验、自动监听刷新、MPE 适配 | 本插件与 MPE 可复用同一主题 |
| 深色预览 | 未配置预览颜色时跟随 IDE；表头文字继承主题前景色，表格交替行 | 深色模式下预览、表头和表格均可读 |
| 安全 | Markdown 净化、Webview CSP nonce、表格单元格 HTML 转义 | 打开不可信 Markdown 或表格时降低脚本执行风险 |
| 保存与冲突 | 原子保存、外部修改指纹检测、历史最多 200 条/50 MiB | 降低写入损坏和旧窗口覆盖新文件的风险 |
| 表格与转换 | CSV BOM 清理、超大或稀疏 XLSX 保护、多 Sheet 转 CSV/TSV 前确认 | 改善兼容性，避免卡死或无感知丢失工作表 |
| 验证 | 新增主题、安全、保存、BOM、历史上限回归检查 | 后续维护可更早发现回归 |

## 当前安装方式

完整文档入口见 [文档总索引](docs/00-文档总索引.md)；其中包含产品、架构、迁移、开发、测试、运维和 AI 决策记录。

当前分支尚未上架扩展商店，需自行构建 VSIX 后，通过 IDE 的 **Install from VSIX...** 安装。

```zsh
git clone https://github.com/Reason-hang/Plus--XLSX-CSV-TSV-Markdown-Editor.git
cd "Plus--XLSX-CSV-TSV-Markdown-Editor"
npm ci --cache /private/tmp/xlsx-viewer-local-patch-npm-cache --no-audit --no-fund
npm --prefix themes/markdown-theme ci --cache /private/tmp/xlsx-viewer-markdown-theme-npm-cache --no-audit --no-fund
npm run theme:build
npm run compile
npm run verify:security
npm run verify:local-patch
npm run verify:theme-system
npm run verify:docs
npx --yes --cache /private/tmp/xlsx-viewer-local-patch-npm-cache @vscode/vsce@3.9.2 package --out "release/muhammad-ahmad.xlsx-viewer-1.9.98-local.6.vsix"
```

手动安装或将 `.5` 替换为 `.6`：

1. 下载或选择 `muhammad-ahmad.xlsx-viewer-1.9.98-local.6.vsix`。
2. 在 VS Code、Cursor 或 Antigravity 按 `⌘ Command + ⇧ Shift + P`，执行 `Extensions: Install from VSIX...`。
3. 选择该 VSIX；出现升级提示时确认。扩展 ID 相同且 `.6` 版本更高，无需先卸载 `.5`。
4. 再按 `⌘ Command + ⇧ Shift + P`，执行 `Developer: Reload Window`。
5. 关闭并重新打开 Markdown 文件，点击 `Split Edit`，确认右侧预览与表格样式。

> 注意：当前补丁仍沿用上游扩展标识 `muhammad-ahmad.xlsx-viewer`，因此不能与原官方扩展并存。安装本地 VSIX 会替换同一 IDE 中的官方版；重新安装官方扩展即可回退。

## 开发与验证

```zsh
npm ci --cache /private/tmp/xlsx-viewer-local-patch-npm-cache --no-audit --no-fund
npm run theme:build
npm run theme:audit
npm run compile
npm run verify:security
npm run verify:local-patch
npm run verify:theme-system
npm run verify:docs
```

构建通过后，仍应在真实 IDE 中完成下列手工验收；自动化结果不能替代现场验收：

1. 打开 Markdown，确认编辑、保存、分栏预览和 `<mark>` 高亮正常。
2. 修改 `themes/markdown-theme/theme.less` 并执行 `npm run theme:build`，确认预览自动刷新后生效。
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
