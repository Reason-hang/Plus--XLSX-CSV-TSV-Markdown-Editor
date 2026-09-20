# Changelog

本仓库当前文档入口已统一收录在 docs/00-文档总索引.md；关键研发与测试决策记录在 docs/AI自主决策记录文档.md。历史版本条目保留原始变更语义，不作为当前功能事实。

## v1.9.98-local.13 - 核心界面汉化简体中文 V2版本修复

- 修复 Markdown 的“分栏编辑”与“预览编辑”切换后，Webview 因自动聚焦而将外层页面滚出视口、内容区看似空白的问题。
- Webview 明确使用视口高度，`#content` 可在固定可用高度内收缩；进入编辑模式仍自动获得输入焦点，但使用 `preventScroll`，不再触发宿主页面滚动。
- 添加静态回归断言，要求两个编辑模式保留无滚动聚焦和内容区视口边界。
- VSIX 版本升级为 `1.9.98-local.13`。

## v1.9.98-local.12 - 核心界面汉化简体中文

- Markdown 与表格 Webview 的主工具栏按钮、图标按钮悬停提示、格式工具栏、设置浮层字段和关闭按钮统一改为简体中文。
- 翻译 Markdown 的内置说明气泡、分栏/预览编辑表格操作，以及表格编辑条的边框、字体、对齐、合并和格式按钮。
- 保留 `Markdown`、`RTL`、`CSV`、`TSV`、`XLSX` 等技术缩写，保持配置键、数据值、命令和扩展 API 不变。
- 增加核心简体中文界面文案静态回归断言。
- VSIX 版本升级为 `1.9.98-local.12`。

## v1.9.98-local.11 - Markdown 工具栏高度与深色表格层次修复

- 修复 `Split Edit` 与 `Preview Edit` 中格式工具栏被内容区覆盖/裁切的问题：固定头部改由 `.toolbar-wrapper` 承载主工具栏与格式工具栏，内容区按两者实际总高度避让。
- `ToolbarManager` 现在观测并测量工具栏布局宿主；格式工具栏显示、隐藏或换行后会重新计算头部高度。电子表格仅含主工具栏时保持原有高度上限策略。
- Markdown 深色预览表格交替行统一为：奇数行 `#161617`，偶数行 `#27272A`；外置 Less 主题同步提高单双行区分度。
- 增加静态回归断言，防止重新把格式工具栏置于裁切容器或遗漏总高度测量。
- VSIX 版本升级为 `1.9.98-local.11`。

## v1.9.98-local.10 - Webview 输入边界与本地资源治理

- 新增共享 `src/shared/webviewMessageSchema.ts`，统一校验两个 Extension Host 的 Webview command、字段类型、数组条数、字符串字节数、Base64、坐标、合并面积和错误码。
- 对 Markdown 正文、图片 sources、PDF Base64、反馈字段/请求体和表格 `edits`、`richEdits`、`styleEdits`、`operations` 设置上限；超限在文件、网络和状态副作用前拒绝，不静默截断。
- 为 `StyleStorage` 增加 cells、merges 和序列化 JSON 字节上限；CSV/TSV 主文件写入前先验证元数据容量，拒绝时保留上一份有效 workspaceState。
- 将 Markdown 图片和相对文件打开边界升级为 realpath containment；工作区外图片只能来自 `xlsxViewer.md.externalResourceRoots` 明确配置的可信根目录。
- 将 KaTeX CSS 与字体随 VSIX 放入 `resources/md/katex`，移除 CDN stylesheet，并收紧 Markdown Webview 的 `style-src`/`font-src` 外部来源。
- 增加 schema、symlink 和 StyleStorage 容量回归测试及安全脚本断言。
- VSIX 版本升级为 `1.9.98-local.10`。

## v1.9.98-local.9 - Markdown 标题配色与格式工具栏布局修复

- 新增 `xlsxViewer.md.headingColor`，默认值为 `#569CD6`，统一作用于 Markdown 预览的 h1-h6。
- 将标题颜色接入 Settings 面板、内置 Markdown CSS、外置 Less 主题和运行时 CSS 变量，避免外置主题覆盖配置值。
- 修复窄分栏中格式工具栏按钮被 Flex 压缩、末尾工具组不可见的问题；工具栏允许换行，按钮和分隔线保持固定尺寸。
- 明确 `.8` 未包含标题颜色配置和工具栏布局修复；本版本专门补齐该验收缺口。
- VSIX 版本升级为 `1.9.98-local.9`。

## 上游 v1.9.98 基线变更

- 修复 Markdown 预览中的行内代码字号异常。
- 修复外部磁盘、包含空格的目录和 Typora 笔记中的图片路径无法加载的问题。
- 增加本地 HTML 图片标签的兼容处理；本 Fork 同时保留本地路径校验和 Webview 资源根限制。

## v1.9.98-local.8 - 代码审计修复与 Extension Host 验收

- 修复 Markdown Webview CSP 中不必要的 `'unsafe-eval'`，并将该约束加入安全回归检查。
- 在根级 `overrides` 中固定 `diff` `^8.0.4`、`serialize-javascript` `^7.0.6`，以及 ExcelJS 使用的 `uuid` `^11.1.1`；不降级 ExcelJS，不使用 `npm audit fix --force`。
- 修复 Extension Host 测试入口：显式使用 Mocha BDD 界面，并为 headless/Docker 执行加入禁用 GPU 与共享内存降级参数。
- 在 Node 24 + Docker + Xvfb 中完成干净安装、类型检查、构建、安全回归和 4 项 Extension Host 测试；在线 `npm audit` 结果为 0 项漏洞。
- 保留外部 KaTeX CSS CDN、绝对路径图片和大批量 Webview 消息作为代码审计报告中的后续治理项；这些边界未被隐瞒为已修复。
- VSIX 版本升级为 `1.9.98-local.8`。

## v1.9.98-local.7 - Markdown 双栏字号与安全治理闭环

- 新增 `xlsxViewer.md.editorFontSize` 和 `xlsxViewer.md.editorLineHeight`，可独立调整 `Split Edit` 左侧 Markdown 编辑区。
- 保留并明确 `xlsxViewer.md.previewFontSize` 和 `xlsxViewer.md.previewLineHeight`，左右视图均可在 `settings.json` 中配置。
- 新增 `Settings` 面板的 `Markdown appearance` 受控分组，可直接调整 `<mark>`、预览和编辑区的外观字段；配置通过 CSS 变量复用，不引入任意 CSS/脚本编辑器。
- 明确重点高亮快捷键是扩展包内置的 `contributes.keybindings`，不再把用户级 `keybindings.json` 作为正式方案；快捷键继续生成标准 `<mark>…</mark>`。
- 将原作者仓库 `v1.9.98`（`fd6ed727bf241f6fd2c1380a609e7c728e108ee4`）正式建立为本地集成基线，并保留路径/图片兼容修复与资源根安全边界。
- 补充上游 `v1.9.97` 与本地安全修复链路的来源对比、Webview 风险边界和三 IDE 真实验收门禁。
- 完善版本记录、安装回退、构建和安全治理文档，版本号升级为 `1.9.98-local.7`。

## v1.9.98-local.6 - Markdown 重点高亮快捷键

- 新增默认快捷键：macOS 为 `⌘ Command + ⌥ Option + ⇧ Shift + 3`，Windows/Linux 为 `Ctrl + Alt + Shift + 3`。
- 原生 Markdown 编辑器和插件的 `Split Edit` 左侧编辑区均会将选中文本包裹为标准、可保存的 `<mark>选中文本</mark>`。
- 右侧预览沿用全局 `<mark>` 配置，实时显示橙色重点高亮；不再写入会被安全策略净化的内联 `style`。

## v1.9.98-local.5 - 深色 Markdown 预览修复

- 修复未显式配置预览颜色时，Markdown 预览错误使用根节点浅色变量、未跟随 IDE 深色主题的问题。
- Markdown 表格表头、单元格文字现在始终继承当前主题前景色；表格正文使用深浅交替行，提高深色主题下的可读性。
- 保持用户显式预览配色和外置 Markdown 主题的覆盖优先级不变。

## v1.9.98-local.3 - 安全与稳定性修复

- 修复 Markdown 原始 HTML 和表格单元格内容直接进入 `innerHTML` 的注入风险，增加输出净化、CSP nonce 和安全链接校验。
- 修复 Markdown、CSV/TSV、XLSX 保存及版本恢复缺少写入前文件一致性校验的问题，检测到外部修改时拒绝覆盖。
- 核心文件写入改为临时文件加原子替换，降低进程中断造成半写文件的风险。
- Markdown 版本历史改为独立快照加索引，并增加 48 小时、200 条和 50 MiB 上限；兼容迁移旧 JSON 历史。
- 修复 CSV 分隔符模块级可变状态、UTF-8 BOM 和稀疏 XLSX 有效范围风险；转换后样式失败时不再误报为整个转换失败。
- 新增 `npm run verify:security` 安全与回归静态测试；补齐 `@vscode/test-cli` / `@vscode/test-electron` 和安全回归测试源，在线依赖审计当前仍有 6 项漏洞（2 low、3 moderate、1 high、0 critical），high 项来自测试工具链；三 IDE 实机验收仍需单独完成。
- 移除无自动修复的 `markdown-it-katex`，改用直接 `katex` 集成并强制 `trust: false`；补充 Mermaid 代码块内容和语言类名的 HTML 属性边界转义，并按锁文件执行不带 `--force` 的可兼容传递依赖修复。

## v1.9.98-local.2 - 完整 Markdown 主题增强版

- 新增版本化主题目录：`themes/markdown-theme`，以 `theme.less` 为唯一人工维护源，单次编译为 `markdown-theme.css`。
- 新增 `theme:build`、`theme:watch`、`theme:audit` 与 `verify:theme-system`，支持 `@import` 依赖监听、SHA-256 manifest 与 MPE 样式迁移审计。
- 新增 XLSX 插件外置主题配置、文件监听、手工重载、状态查看、主题目录打开和同路径失败回退。
- Markdown 预览目录同时使用 `.toc-panel` 与 `.md-sidebar-toc`，便于与 MPE 主题共享目录规则。
- 保持 XLSX、CSV、TSV provider、样式和保存链路不变。
- 新增全中文主题、安装、迁移、回退和维护成本说明；真实三 IDE 验收仍需安装 VSIX 后完成。

## v1.9.97 - XLSX XML Namespace Compatibility
- Fixed an issue where XLSX files with XML namespace prefixes  failed to open.
- Added automatic XML namespace sanitization to ensure seamless loading and editing across all OpenXML spreadsheet variants.

## v1.9.96 - Scroll Preservation & Popup Notification Controls
- Fixed scroll reset on content save across all file types (XLSX, CSV, TSV, and Markdown), keeping editor and preview scroll positions intact.
- Added `xlsxViewer.showPopups` setting allowing users to enable or disable save/autosave popup notifications.
- Updated toast notifications to be non-blocking (`pointer-events: none`) so popups do not interrupt user editing or require waiting.

## v1.9.95 - Right-to-Left (RTL) Text Direction Support
- Added Right-to-Left (RTL) text direction support across CSV, XLSX, TSV, and Markdown editors.
- Added RTL / LTR toggle button to the editor toolbars.
- Added automatic RTL content detection for Arabic, Hebrew, Persian, Urdu, and other RTL scripts on document load.
- Added RTL table layout and element attribute formatting for table cells, sticky row headers, formula bars, and Markdown preview elements.

## v1.9.94 - Native PDF Exporter Module
- Added `MdToPdfExporter` for fast client-side PDF export (< 50ms) with selectable text (`puppeteer-core` and `html2canvas` removed).
- Fixed heading `#` permalink text, emoji garbled characters, and added SVG rasterization for Mermaid diagrams.

## v1.9.93 - Date Parsing Fixes for Non-Date Values
- Fixed an issue where plain digits, fractions (e.g., "1/2"), ranges (e.g., "1-2"), and alphanumeric codes (e.g., "EVT-001") were incorrectly parsed and converted into dates in CSV, TSV, and XLSX sheets.

## v1.9.92 - PDF Export, CSV Separators & Date Offsets
- Implemented high-fidelity PDF Export functionality for Markdown previews using headless Puppeteer-Core, resolving UI freezing and style/font rendering issues.
- Added CSV delimiter options allowing users to configure and toggle between comma (,) and semicolon (;) separators.
- Resolved timezone offset issues where Excel dates displayed one day behind for certain timezones.

## v1.9.91 - Sticky Header Layout and Border Fixes
- Fixed sticky header disappearing when scrolling past the first few rows (virtual scrolling logic now keeps row 0 rendered).
- Fixed the row header "1" cell not staying sticky when the header is sticky.

## v1.9.9 - Text Wrap Settings & Projects Modal
- Added a default "Text Wrap" setting (defaulting to off) for XLSX, CSV, and TSV files.
- Added a right-click context menu "Text Wrap" toggle for cells, rows, and columns to wrap specific selections.
- Optimized text wrap settings application to be smooth and CSS-only, avoiding a visible blank screen/flicker.
- Added a toolbar button before Help & Feedback that lists other open source projects (`openpart` and `vibed-puppet`) in a beautiful modal, across all 4 editor formats (XLSX, CSV, TSV, Markdown).

## v1.9.8 - Styled Mode Simple Editing
- Allowed simple direct editing in spreadsheet styled mode without entering full table edit mode, matching the plain mode behavior.
- Added a refresh button to the toolbar to manually refresh the file from disk.

## v1.9.7 - Live Reload Support
- Added live-reload support to automatically refresh the spreadsheet and markdown editors when files are modified externally (e.g., via Notepad or another external tool).
- Added filesystem watchers to track disk updates for spreadsheet (.xlsx, .csv, .tsv) and markdown (.md) documents.
- Integrated a prevention mechanism for internal saves to avoid infinite loop refreshes.

## v1.9.6 - Column Header Sort Menu Checkbox
- Added a "First row as header" checkbox directly in the column context menu above the sort options.
- Prevented the header row from being sorted or filtered when "First row as header" is checked.
- Changed default setting of "First row as header" to checked (true) for CSV, TSV, and XLSX files.

## v1.9.5 - Support Paste, Context Menus, Markdown Flowcharts, and Copy Optimization
- Added support for pasting spreadsheet grid data (using tab and newline delimiters).
- Added Copy and Paste actions directly in the cell right-click context menu.
- Optimized copying of large ranges of cells (making it instant for 10000+ cells).
- Added Mermaid flowchart and diagram rendering support in Markdown editor and preview.

## v1.9.4 - Name Fix
- Reverted the accidental name change.

## v1.9.3 - Bug Fixes
- Fixed an issue where the Backspace and Delete keys would not work in the spreadsheet editor.

## v1.9.2 - Fixed Cell and Header Actions
- Fixed an issue where delete column/row actions were not working.
- Fixed an issue where the header row toggle would not open the settings panel.

## v1.9.1 - Markdown mathemical formula rendering fix
- Added support for rendering mathematical formulas in Markdown files using KaTex.

## v1.9.0 - Checkbox bug fix
-- FIx a bug where 1 and 0 values in xlsx files would be rendered as checkboxes, now only cells with the "checkbox" format will be rendered as checkboxes.

## v1.8.9 - Unified XLSX/CSV/TSV Webviews & fixed some bugs
- Unified the XLSX, CSV, and TSV editors into a single webview implementation with same features and toolbar for all formats like google sheets.
- Now just like google sheets, styles can be added to csv and tsv files as well and they will be preserved in a temporary cache for 48 hours, surviving file close and reopen.
- Added a setting to control the visibility of the "Edit Table" button in CSV/TSV files, allowing users to choose between direct editing and table edit mode.
- Added sort adn filter for spreadsheet files.
- Improved version history reliability.

## v1.8.8 - System Info Editor Name & Feedback Modal Spacing
- Added editor name detection (VS Code, Cursor, etc.) to system information in feedback modal

## v1.8.7 - Feedback Modal UI & Markdown Relative Links
- Added support for relative links in Markdown files.
- Modified help and feedback UI, now opens the form directly in the vscode and user can submit feedback without leaving vscode.

## v1.8.6 - Bug Fixes
- Fixed an issue where the hover changed the text color of cells in csv and tsv.

## v1.8.5 - UI Polish & New Features
- Changed the theme toggle button to a pill-shaped toggle.
- Added support for checkbox, dropdown, rating and date in xlsx.
- Repolished the table UI.
- Added autosave in settings for csv, tsv and xlsx.
- Fixed the bug where the toolbar wouldn't occupy full width of the editor when the window is scrolled.
- Added support for images in xlsx.

## v1.8.4 - Google Sheets-Style Editing Features
- Added Find in the toolbar for CSV, TSV, and XLSX.
- Added text alignment (horizontal and vertical), borders, font size, font family, wrap text strikethrough, painter, clear formatting, and merge cell controls in XLSX edit mode.

## v1.8.3 - Cross-Format File Conversion
- Added centralized file conversion system to convert between CSV, TSV, and XLSX.
- Added a "Convert" action directly in CSV/TSV/XLSX toolbars for supported formats.
- Implemented conversion logic for multi-sheet XLSX to single-sheet formats (notifies when extra sheets are dropped).
- Centralized tabular data handling to allow easy addition of future formats.

## v1.8.2 - Version History, Undo/Redo, and Focus Fixes
- Fixed Version History preview/restore flow so preview remains read-only until Restore is confirmed.
- Improved Undo/Redo handling to preserve non-structural scroll position and avoid data loss during table edits.
- Replaced the version history button label with an SVG-only icon in table/XLSX toolbars.
- Added focus capture to table and XLSX webviews so clicking the grid clears file selection and Delete targets the table cell.
- Mirrored version-history preview behavior into the XLSX and MD editor for a consistent experience across CSV, TSV, MD and XLSX.
- Fixed sticky toolbar and header layout issues in xlsx and md.
- Added Spacious Cells support to XLSX tables, matching the CSV/TSV behavior.
- Fixed ctrl + z and ctrl + y not working properly in xlsx edit mode.
- Modified UI for xlsx to match the google sheets style more closely.

## v1.8.1 - Copy Fix & Version History
- Fixed an issue where Ctrl+C, Ctrl+V, and Ctrl+A were incorrectly intercepted while editing a cell, restoring native browser text selection.
- Redesigned and centered the Autosave confirmation alert for better visibility.
- Updated Ctrl+Z and Ctrl+Y to properly handle custom Undo/Redo tracking behaviors inside the editor.
- Added a new Version History timeline and button, archiving the last 2 days of historical states to allow precise structural restoration.

## v1.8.0 - Spacious Cells & UI Fixes
- Added support for spacious cells in the table view.
- Fixed the unsticky toolbar leaving empty space below the table and lacking background color.
- Fixed the sticky header offset gap when spacious cells and sticky headers are both enabled.
- Changed UI for csv and tsv to match the google sheets style more closely.
- Removed Edit Table button and allowed editing directly in the table view for csv and tsv.
- Added autosave for csv and tsv when editing directly in the table view.
- Added row and column addition and deletion for csv and tsv in the table view.
- Added cell deletion and shift up/left for csv and tsv in the table view.

## v1.7.9 - XLSX Edit Mode & Formatting Fixes
- Fixed XLSX table edit mode so background color targets the active cell instead of leaking to multiple previously-selected cells.
- Fixed XLSX table edit mode cell selection behavior for reliable single-cell targeting.
- Fixed rich-text visibility in XLSX edit mode so bold/italic formatting remains visible while editing.
- Improved rich-text save/load consistency for XLSX table edits.
- Fixed table edit mode for csv and tsv.

## v1.7.8 - Markdown Preview Edit Undo/Redo Fixes
- Fixed Preview Edit undo/redo so `Ctrl+Z` and `Ctrl+Y` now work reliably for table row/column add/remove actions.
- Prevented undo/redo shortcuts in Preview Edit from falling through to VS Code and undoing unrelated file editor actions.
- Added dedicated Preview Edit history tracking for contenteditable changes and table structure mutations.
- Fixed an issue where the Add Row, Column action could modify the wrong table when multiple tables are present.

## v1.7.7 - Markdown Outline & Heading Cleanup
- Fixed a regression where old heading copy-link artifacts could pollute the Outline and rendered heading text.
- Markdown save now strips stale internal `[ # ](#... "Copy link")` heading fragments left behind by earlier saves.
- Improved split-view sync scroll mapping so editor and preview stay aligned more reliably after resize and wrapped content changes.
- Fixed the outline panel showing unnecessary information for headings that have copy links.

## v1.7.6 - Markdown Preview Edit & Code Block Fixes
- Fixed a Preview Edit save bug where headings could gain extra `#` characters because heading anchor UI leaked into markdown conversion.
- Tightened the code block line-number gutter to remove the leftover blank space before line numbers.
- Improved code block readability and table insertion behavior in Markdown preview edit mode.

## v1.7.5 - Local image support in Markdown preview
- Fixed an issue where local image paths (relative/absolute/file URIs) in Markdown did not load in the webview preview.

## v1.7.4 - Markdown Edit & Layout Bug Fixes
- Added **Preview Edit** mode.
- Split‑view edit no longer opens with the editor pane scrolled all the way to the right.
- "Preview on Left" setting respects split‑view layout and no longer collapses the panels vertically.
- Heading anchor links are hidden while in preview‑edit mode to prevent visual clutter.

## v1.7.3 - Advanced Markdown Editing & UI Fixes
- **Outline Toggle Button Fix**: The outline toggle button now shows a visible accent-colored background when active, making it clearly distinguishable from inactive state.
- **Formatting Toolbar**: A full formatting toolbar appears in edit mode with grouped buttons for text formatting, headings, lists, inserts, undo/redo, line operations, and text transforms.
- **New Editing Features**:
  - **Duplicate Line** (Ctrl+Shift+D): Duplicate the current line below.
  - **Delete Line** (Ctrl+Shift+K): Delete the current line.
  - **Move Line Up/Down** (Alt+Up/Down): Move the current line or selection up or down.
  - **Select Word** (Ctrl+D): Select the word at cursor.
  - **Go to Line** (Ctrl+G): Jump to a specific line number.
  - **Transform Case**: Uppercase (Ctrl+Shift+U), lowercase (Ctrl+U), and Title Case transforms for selected text.
  - **Sort Lines**: Sort selected lines alphabetically.
  - **Trim Trailing Whitespace**: Remove trailing spaces from all lines.
- **Scroll Performance**: All scroll handlers now use requestAnimationFrame throttling and passive event listeners. Data-line element queries are cached for smoother sync scrolling.
- **Outline Auto-Scroll**: The TOC panel now auto-scrolls to keep the active heading visible as you scroll through the document.

## v1.7.2 - Remove heading anchors & fix external link popup
- Removed heading anchor copy links from Markdown preview.
- Fixed external link handling so VS Code's confirmation popup opens correctly (added e.stopPropagation on link clicks).
- Minor CSS cleanup to remove heading anchor styles.

## v1.7.1 - Markdown Outline & UI Tweaks
- **Markdown Outline**: Added an Outline panel with heading navigation and a setting to control its visibility via the Settings panel.
- **Copy Enhancements**: Added **Copy** buttons for code blocks, heading anchors that copy deep links to the clipboard, and improved inline/code block labeling.
- **External Link Handling**: External links now open via VS Code's external API for consistent behavior.
- **UI Tweaks & Fixes**: Refined button colors, fixed split-edit visibility for Save/Cancel, and improved heading anchor UX.

## v1.7.0 - XLSX Toolbar Fix
- Restored the XLSX sheet selector at the start of the toolbar.

## v1.6.9 - Editor Association Fixes
- Fixed bug where disabling the Markdown custom editor could leave workspace or workspace-folder settings such that new `.md` files still opened in the extension. The disable flow now removes `xlsxViewer.md` associations across all configuration scopes (Global, Workspace, Workspace Folder) so your chosen default editor is preserved.
- Set the Markdown custom editor priority to `option` so it won't open automatically unless explicitly selected.

## v1.6.8 - Theme & UI Fixes
- **Settings Panel**: Fixed settings panel colors so they now follow the active VS Code theme when `vscode` theme mode is selected; checkboxes are themed and accessible.
- **Tooltips**: Root/global tooltip background was changed from black to the root theme background so it matches the overall theme and improves contrast.
- **Visual Tweaks**: Refined glass backdrop and shadow values for better integration with VS Code widgets and improved focus/contrast for checkboxes.

## v1.6.7 - Editor Association Management
- **Markdown Editor Controls**: Added a toolbar **Disable MD** button in the Markdown viewer that lets users disable the extension for `.md` files. The button prompts for confirmation, removes the association, and triggers VS Code's **"Reopen With..."** picker to select a new default editor.
- **Enable Button for Markdown**: When viewing a Markdown file via "Open With..." while it is not the default editor, an **Enable MD** button appears in the toolbar to quickly set XLSX Viewer as the default for `.md` files.
- **Set as Default for All File Types**: Added a **"Set as Default"** button (lightning bolt icon) to CSV, TSV, and XLSX viewers. This button only appears when this extension is NOT currently the default editor for that file type, allowing you to quickly make XLSX Viewer the default.
- **XLSX Viewer Shortcut**: Added an "Open in XLSX Viewer" button in the editor title bar for `.xlsx` files, allowing you to quickly switch to this extension's viewer when the file is opened in another editor.
- **UI**: Added new `Zap` and `ZapOff` icons for managing editor associations.

## v1.6.6 - Help & Feedback
- **Help Button**: Added a help button to the toolbar in all webviews (XLSX, CSV, TSV, Markdown) to easily access documentation and provide feedback.

## v1.6.5 - Markdown Viewer & Editor
- **Markdown Viewer & Editor (.md)**: Added a new Github Flavored Markdown viewer & editor for `.md` files with preview and edit modes, a toolbar (Edit Preview, Save, Cancel, Word Wrap, Settings), and a lightweight renderer for common Markdown (.md) features (headers, lists, code blocks, tables, task lists, images, links).
- **Split Edit Mode**: Live preview with synchronized scrolling between editor and preview panes.
- **Repository Update**:
  - Updated GitHub repository URL to `https://github.com/Mahmadabid/XLSX-CSV-TSV-MARKDOWN-Editor-Vscode-Extension`.

## v1.6.4 - Plain View Styling & Repository Update
- **Plain View Styling**:
  - Fixed header row styling in plain view mode to match CSV behavior (bold text with header background).
  - Sticky header now properly displays with theme colors in plain view mode.
- **Repository Update**:
  - Updated GitHub repository URL to `https://github.com/Mahmadabid/XLSX-CSV-TSV-Editor-Vscode-Extension`.

## v1.6.3 - XLSX Plain View & Virtualization
- **Plain View Mode**:
  - Added **Plain View** button to XLSX toolbar that removes all Excel styling (colors, fonts, borders) and displays data like CSV/TSV.
  - Toggle between styled and plain view for cleaner data inspection.
- **XLSX Virtualization**:
  - Added virtualization (windowed rendering) for XLSX files to drastically improve performance and reduce memory usage when opening large spreadsheets.
  - Implemented virtual scrolling and adaptive row rendering so only visible rows are rendered at any time.

## v1.6.2 - Minor Fixes
- **Minor Fixes**:
  - Fixed xlsx color issues in vscode/dark mode.

## v1.6.1 - Minor Fixes
- **Minor Fixes**:
  - Fixed xlsx color issues in vscode mode.

## v1.6.0 - TSV Support
- **New Name & Description**:
  - Extension renamed from `XLSX Viewer & CSV Editor` to `XLSX, CSV & TSV Editor` to better reflect its expanded functionality.
- **TSV Support**:
  - Added a new **TSV Viewer & Editor** with the same features as the CSV editor (table view, in-table Edit/Save/Cancel, virtualization for large files, copy/paste compatible with Excel/Google Sheets using tab delimiters).
  - The editor toolbar, settings panel, and the **Open in Table View** command now support `.tsv` files.

## v1.5.9 - Minor Fixes
- **Minor Fixes**:
  - Fixed table stretching issue when opening CSV files in certain window sizes.

## v1.5.8 - Bug Fixes
- **Bug Fixes**:
  - Resolved copy and scrollbar related bugs in CSV editor.

## v1.5.7 - CSV Virtualization
- **CSV Virtualization**:
  - Added virtualization (windowed rendering) for CSV files to drastically improve performance and reduce memory usage when opening large CSVs.
  - Implemented virtual scrolling and adaptive row rendering so only visible rows are rendered at any time.

## v1.5.6 - VS Code Theme Support
- **VS Code Theme Support**:
  - Added **VS Code** theme option that mirrors the editor's native theme (Light / Dark / High Contrast).
  - New `ThemeManager` component centralizes theme logic and persistence.
  - **Persistent Theme**: The extension now automatically remembers your last used theme and applies it to new files.
  - Interactive tooltip on the theme button with quick-switch action and accessibility labels.

## v1.5.5 - Dark Mode Fixes
- **Dark Mode Fixes**:
  - Corrected text color in dark mode for XLSX views to ensure readability.
  - Updated CSS rules to maintain consistent appearance across different themes.
  - Ensured that default cell colors adapt properly in dark mode without losing visibility.

## v1.5.4 - XLSX Editing & UI Improvements
- **New Name & Description**:
  - Extension renamed from `XLSX Viewer & CSV Editor` to `XLSX, CSV & TSV Editor` to better reflect its expanded functionality.
  - Updated extension description to highlight both XLSX viewing/editing and CSV editing capabilities.
- **XLSX Editing & Toolbar (New approach)**:
  - Introduced **in-webview table editing** for XLSX files: toggle **Edit** to make changes, then **Save** to persist changes back to the `.xlsx` file or **Cancel** to discard.
  - **Implementation detail**: edits are applied in the webview and written to disk using ExcelJS; the extension attempts to preserve formatting and merged cells where possible.
  - Added **Undo/Redo** support and keyboard shortcuts for edit mode (Ctrl+S / Ctrl+Z / Ctrl+Y / Enter).
  - **Toolbar & Settings parity**: toolbar controls and the Settings panel (header toggle, sticky header, sticky toolbar, hyperlink preview) were added to XLSX views to match CSV editor UX.
  - **UX improvements**: refined toolbar responsiveness, consistent sticky headers, and polished visual styles across XLSX and CSV editors.

## v1.5.3 - UI Polish & Settings UX
- **UI Polish & Settings UX**:
  - Redesigned **Settings panel** with backdrop blur, smoother rounded corners, grouped checkboxes, and responsive Cancel button that wraps on small screens.
  - Settings panel features:
    - **Header Row**: toggle the first row to be treated as header (bold first row).
    - **Sticky Header**: keep the first row sticky when header is enabled.
    - **Sticky Toolbar**: keep the toolbar fixed at the top of the editor.

## v1.5.2 - Premium UX Refinements & Bug Fixes
- **Premium CSV Editor UX**:
  - Added **Undo (Ctrl+Z)** and **Redo (Ctrl+Y)** functionality in table edit mode.
  - Improved Keyboard Navigation: **Enter** key now moves to the cell below instead of adding a newline.
  - Refined **Save Behavior**: Ctrl+S now saves changes, clears selection, and blurs active cell without exiting edit mode.
  - Added visual **Save Confirmation** (premium horizontal toast with green tick).
  - Added **Edit Mode Indicator**: Sharp outer border and active cell highlighting.
  - Fixed horizontal scrolling and text truncation issues in edit mode.
  - Added subtle hover highlights for table cells.

## v1.5.1 - CSV Table Editing
- Added in-table **Edit Table** mode for CSV files with **Save** and **Cancel** actions.
- While editing, the **Edit File** and **Edit Table** buttons are hidden to reduce accidental mode switching.
- Improved webview reliability by waiting for the webview to be ready before streaming table rows.

## v1.5.0 - Merged Cells & Resizing Support

### **Merged Cell Support:**
- Full support for both horizontal and vertical merged cells from Excel files
- Proper content alignment and positioning within merged cells
- Maintains original Excel formatting and alignment

### **Interactive Resizing:**
- Drag column borders to resize column widths
- Drag row borders to resize row heights
- Visual resize handles on headers with hover effects
- Real-time size indicators during resizing

### **Auto-Fit Functionality:**
- Auto-fit button to automatically resize all columns based on content
- Double-click column borders to auto-fit individual columns
- Double-click row borders to auto-fit individual rows
- Smart content-based sizing with maximum width limits

## v1.4.0 - Excel-like Multi-Selection & Copy
- **Multi-Selection for Rows/Columns:**
  - Hold <kbd>Ctrl</kbd> and click multiple row or column headers to select/deselect multiple rows or columns.
  - Hold <kbd>Shift</kbd> and click to select a range of rows or columns.
- **Excel/Google Sheets Compatible Copy:**
  - Pasting into Excel or Google Sheets will place data in the correct cells, not a single cell.
- **Improved Selection Management:**
  - Visual feedback for multi-row and multi-column selection.
  - Selection info box shows the size of the current selection, Displayed at bottom right corner.

## v1.3.0 - Enhanced Selection Features
- **Text Selection**: Added text selection for copying with ease.
- **Cell Selection**: Improved cell, row, and column selection functionality
- **Dark Mode Support**: Enhanced text selection visibility in both light and dark modes
- **UI Improvements**: Better visual feedback for selections and copying

## v1.2.0 - Enhanced Toggle Background
- **Improved Toggle Background**: Updated toggle button functionality for light and dark modes with alternating icons.
- **UI Enhancements**: Adjusted icon sizes and improved visual consistency.

## v1.1.0 - XLSX Viewer & CSV Editor (New Name)
- **New Name**: Previously known as `XLSX Viewer`.
- **Features**: Added CSV file editing capabilities in a structured table view.
- **Bug Fixes**: Improved performance and UI enhancements.

## v1.0.0 - XLSX Viewer
- Initial release with basic functionality for viewing Excel files.
