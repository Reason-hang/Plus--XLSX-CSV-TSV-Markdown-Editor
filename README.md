# Plus XLSX, CSV, TSV & Markdown Editor

## 目录

- [功能概览](#功能概览)
- [Markdown 完整主题增强](#markdown-完整主题增强)
- [重点高亮写法](#重点高亮写法)
- [相对上游 v1.9.97 的增强](#相对上游-v1997-的增强)
- [版本记录表](#版本记录表)
- [当前安装方式](#当前安装方式)
- [开发与验证](#开发与验证)
- [公开发布计划](#公开发布计划)
- [贡献与反馈](#贡献与反馈)
- [许可证与来源说明](#许可证与来源说明)

这是一个面向 VS Code 系 IDE 的开源 Fork 项目，用于在编辑器内查看和编辑 XLSX、CSV、TSV 与 GitHub Flavored Markdown 文件。

项目以原作者仓库的 `v1.9.98`（提交 `fd6ed727bf241f6fd2c1380a609e7c728e108ee4`）作为当前集成基线，并在此基础上保留本地安全修复和 Markdown 主题增强；`v1.9.97` 仍作为历史功能对比基线。主题增强用一份版本化 Less 主题生成单一 CSS，供本扩展与 Markdown Preview Enhanced（MPE）共同使用。

> 安全提示：`1.9.98-local.15` 当前锁文件在线审计为 0 项漏洞；Markdown Webview 已改为随 VSIX 加载本地 KaTeX CSS/字体，并对消息、Markdown、图片、PDF、反馈、表格编辑和 StyleStorage 设置边界。三个 IDE 的真实交互仍需现场验收。
> 当前版本是本地开发补丁 `1.9.98-local.15`，尚未发布到 VS Code Marketplace 或 Open VSX。请不要将本仓库误认为原作者的官方商店扩展。

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
- 自动目录面板按 H1–H6 以固定 20px 级距显示，并为深层标题提供树形引导、整行高亮和长中文标题换行，便于浏览长文档。
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
  "xlsxViewer.md.headingColor": "#569CD6",
  "xlsxViewer.md.externalResourceRoots": [],
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

安全审计与修复证据见：[代码审计报告](docs/05-测试与验收/代码审计报告-2026-09-15-v1.9.98-local.7.md)。

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

### 高亮快捷键的配置边界

高亮快捷键是插件内置能力，定义在扩展包 `package.json` 的 `contributes.keybindings` 中；用户不需要、也不应把它复制到 IDE 的 `keybindings.json` 作为本项目的正式配置方案。这样可以让同一个 VSIX 在 VS Code、Cursor 和 Antigravity 中保持一致，并始终生成标准、可保存、可跨 IDE 阅读的 `<mark>…</mark>` 标签。

此前文档中曾建议通过用户级 `keybindings.json` 配置快捷键，该建议已被本版本的内置快捷键方案取代。`keybindings.json` 仍可用于用户自定义其他 IDE 快捷键，但不作为本插件重点高亮快捷键的交付入口。

### Markdown 左右视图字号配置

`1.9.98-local.10` 支持分别配置 `Split Edit` 左侧编辑区和右侧预览区的字号、行高，并新增统一控制 h1-h6 的标题颜色配置和可信外部图片根目录配置。在 IDE 的 `Preferences: Open User Settings (JSON)` 中加入：

```json
{
  "xlsxViewer.md.editorFontSize": "16px",
  "xlsxViewer.md.editorLineHeight": "1.8",
  "xlsxViewer.md.previewFontSize": "17px",
  "xlsxViewer.md.previewLineHeight": "1.8",
  "xlsxViewer.md.headingColor": "#569CD6",
  "xlsxViewer.md.externalResourceRoots": []
}
```

修改后执行 `Developer: Reload Window`。字号配置写在 `settings.json`，不是 `keybindings.json`；不需要在 Markdown 正文中加入 `<style>`。

也可以直接打开插件工具栏中的 `Settings` 面板，在 `Markdown appearance` 分组调整高亮、标题颜色、预览颜色、字号和行高。面板只暴露受控的外观字段，不提供任意 CSS/脚本编辑；空的预览颜色、字号或行高会继续跟随 IDE 主题。保存后当前 Webview 会立即应用，重载窗口后仍会从扩展设置恢复。

## 相对上游 v1.9.97 的增强

当前本地包为 `1.9.98-local.15`；集成基线为上游 `v1.9.98`（`fd6ed727`），功能差异仍以历史上游 `v1.9.97`（`cb1c765`）作为完整对照，XLSX、CSV、TSV 原有编辑能力保持不变，新增与修复如下：

| 模块 | 新增或修改 | 实际作用 |
| --- | --- | --- |
| Markdown 外观 | 全局 `<mark>` 配置、h1-h6 标题颜色、预览背景/文字/字号/行高配置 | 统一重点样式、标题层级和阅读体验，无需逐篇写内联样式 |
| Markdown 工具栏 | 固定头部按主工具栏与格式工具栏的实际总高度避让内容区 | Split Edit、Preview Edit 下格式工具栏不再被内容区覆盖或裁切 |
| Markdown 左侧大纲 | H1-H6 固定 20px 级距、树形引导、整行高亮和长标题换行 | 深层标题层级更易辨识，活动标题不再横向跳位 |
| 核心界面语言 | 工具栏、悬停提示、格式工具栏和设置字段使用简体中文 | 日常操作不再混用英文；技术缩写和配置键保持兼容 |
| 输入边界治理 | 统一 Webview message schema、Markdown/PDF/反馈/图片 payload、表格编辑、坐标和 StyleStorage 容量限制 | 超限直接拒绝，拒绝前不写文件、不发网络请求、不更新状态 |
| 本地资源与路径 | KaTeX CSS/字体随 VSIX 提供；Markdown 图片使用 realpath containment 和可信外部根目录 | 支持离线公式渲染，拒绝未授权 symlink 越界资源 |
| 双栏排版 | 新增编辑区字号/行高设置 `xlsxViewer.md.editorFontSize`、`xlsxViewer.md.editorLineHeight` | 左侧编辑与右侧预览可分别调节，不影响 IDE 其他编辑器 |
| 重点高亮快捷键 | `⌘⌥⇧3`（Windows/Linux：`Ctrl+Alt+Shift+3`）将选区写成 `<mark>…</mark>` | 编辑和预览同步高亮，文档可保存、可跨 IDE 阅读 |
| 统一主题 | Less 单一主题源、外置 CSS、manifest 校验、自动监听刷新、MPE 适配 | 本插件与 MPE 可复用同一主题 |
| 深色预览 | 未配置预览颜色时跟随 IDE；表头文字继承主题前景色，表格奇数行 `#161617`、偶数行 `#27272A` | 深色模式下预览、表头和表格单双行均可读 |
| 安全 | Markdown 净化、Webview CSP nonce、表格单元格 HTML 转义 | 打开不可信 Markdown 或表格时降低脚本执行风险 |
| 保存与冲突 | 原子保存、外部修改指纹检测、历史最多 200 条/50 MiB | 降低写入损坏和旧窗口覆盖新文件的风险 |
| 表格与转换 | CSV BOM 清理、超大或稀疏 XLSX 保护、多 Sheet 转 CSV/TSV 前确认 | 改善兼容性，避免卡死或无感知丢失工作表 |
| 验证 | 新增主题、安全、保存、BOM、历史上限回归检查 | 后续维护可更早发现回归 |
| 审计修复 | 移除 Markdown CSP 中无必要的 `unsafe-eval`；锁文件覆盖 `diff`、`serialize-javascript`、ExcelJS 使用的 `uuid` | 降低 Webview 脚本执行面，依赖在线审计为 0 |

## 版本记录表

完整版本台账见 [版本记录表](docs/07-版本与发布/版本记录表.md)：按版本记录最重要变化、新增、修改、修复、删除、受影响功能、数据与文件影响、提交 SHA 和验证交付证据。需要交给其他 AI 填写时，使用 [版本记录表模板](docs/07-版本与发布/版本记录表模板.md)。

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
npm test  # 首次运行会下载对应 VS Code Extension Host
npx --yes --cache /private/tmp/xlsx-viewer-local-patch-npm-cache @vscode/vsce@3.9.2 package --out "release/muhammad-ahmad.xlsx-viewer-1.9.98-local.15.vsix"
```

手动安装或将旧版本替换为 `.14`：

1. 下载或选择 `muhammad-ahmad.xlsx-viewer-1.9.98-local.15.vsix`。
2. 在 VS Code、Cursor 或 Antigravity 按 `⌘ Command + ⇧ Shift + P`，执行 `Extensions: Install from VSIX...`。
3. 选择该 VSIX；出现升级提示时确认。扩展 ID 相同且 `.15` 版本更高，无需先卸载旧版本。
4. 再按 `⌘ Command + ⇧ Shift + P`，执行 `Developer: Reload Window`。
5. 关闭并重新打开 Markdown 文件，点击 `Split Edit`，确认右侧预览与表格样式。

当前 `.15` 发布包为 `release/muhammad-ahmad.xlsx-viewer-1.9.98-local.15.vsix`；包外 SHA-256 为 `ccd606d0cbad2001a299391aa868539731d97c294cf96e3ad2ff31da058318e6`。VSIX 内文档不自引用自身哈希。

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
