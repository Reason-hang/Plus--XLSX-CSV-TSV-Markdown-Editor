# AI自主决策记录文档

> 状态：持续记录
> 更新时间：2026-09-19
> 任务：整理文档目录、收敛当前项目事实、补齐完整增强版说明，并在验证后推送仓库

## 目录

- [记录规则](#记录规则)
- [当前基线](#当前基线)
- [决策记录](#决策记录)
- [执行与验证记录](#执行与验证记录)
- [未决事项与回滚](#未决事项与回滚)

## 记录规则

本文件只记录影响范围、实现方式、质量门槛、跨平台迁移或交付结果的中等及高等决策。低风险的排版、措辞和局部格式调整不单独记录。

每条记录包含：背景、证据、候选方案、决策、执行范围、验证方式、偏差和残余风险。无法从当前源码或命令结果确认的内容标记为“待验证”，不把推测写成事实。

## 当前基线

| 项目 | 事实 |
| --- | --- |
| 仓库 | 当前工作区对应的 Plus XLSX, CSV, TSV & Markdown Editor Fork |
| 分支 | codex/release-1.9.98-local.7（本地修复工作分支，已推送到 `personal/main`） |
| 上游集成基线 | v1.9.98，`fd6ed727bf241f6fd2c1380a609e7c728e108ee4` |
| 历史对比基线 | v1.9.97，`cb1c765c0da95d49ecd50ec3b0e26ca7ca185ebb` |
| 当前版本 | 1.9.98-local.13 |
| 远端发布目标 | personal/main |
| 主题实现 | 已有外置 CSS、manifest、监听、回退和 MPE 适配基础 |
| 真实 IDE 验收 | `.12` 仍需在 VS Code、Cursor、Antigravity 中人工执行 |

## 决策记录

### D-021：固定头部以工具栏包装器作为高度与定位边界

- 风险等级：高。
- 背景：`.10` 的真实 Antigravity 截图显示 Split Edit 下第二行格式工具栏被内容区覆盖，并非单纯的横向 Flex 挤压。
- 证据：主工具栏使用 fixed 定位，格式工具栏被移入 `overflow: hidden` 的 `.toolbar-wrapper`；`ToolbarManager.updateHeaderHeight()` 只测量内层 `#toolbar`，而 `#content` 使用 `100vh - --header-height`。
- 决策：由 `.toolbar-wrapper` 统一固定和承载两层工具栏；高度观测与 CSS 变量均使用该包装器的实际高度。格式栏显示、隐藏或重排后在下一帧回算高度。
- 原因：这是最小且可回退的层级修复，既保持 Sticky Toolbar，也避免以关闭功能或增加固定魔法高度掩盖问题；电子表格只有主工具栏时仍沿用原上限策略。
- 验证方式：类型、构建、静态回归、主题、文档、VSIX 验包；三个 IDE 安装 `.11` 后检查 Split Edit、Preview Edit 和窄分栏。
- 残余风险：真实窗口尚未加载 `.11`，不能把源代码与静态验证替代为现场 UI 通过。

### D-001：以当前源码、配置和验证产物作为唯一事实源

- 风险等级：中
- 背景：历史对话和旧交付物中存在不同版本、不同主题方案和不同路径描述。
- 证据：当前 package.json 版本已升级为 1.9.98-local.10；src/shared/markdownThemeService.ts 已包含外置 CSS 加载、路径校验、manifest 提示、监听和失败回退；审计修复还增加了渲染净化、保存一致性校验、原子写入和依赖覆盖；`.10` 新增共享 Webview schema、realpath 检查、StyleStorage 容量校验和本地 KaTeX 资源。
- 候选方案：直接沿用旧文档；以当前工作区重新核对；只整理用户提供的方案文本。
- 决策：以当前工作区源码、package.json、生成物、测试命令和 Git 现场为准；旧描述只有在当前代码仍支持时才保留。
- 执行范围：所有 README、docs、主题说明和测试说明。
- 验证方式：读取 Git 状态、版本、远端、源码标记和现有 Markdown 文件清单。
- 残余风险：未进行三套 IDE 的真实 UI 验收。

### D-002：保留根目录入口，新增 docs 分域目录

- 风险等级：中
- 背景：用户要求按跨平台目录规范整理全部文档，但 VSIX 和仓库用户仍需要根目录 README 作为入口。
- 候选方案：把全部 README 移入 docs；保持现状只增加索引；保留根入口并在 docs 下按领域拆分。
- 决策：采用第三种方案。根目录 README 和 README-LOCAL-PATCH 保留；新增 docs/00-文档总索引.md、六个分域目录和本决策文档。
- 原因：兼顾目录规范、VSIX 内文档可达性和升级兼容，避免移动文件造成链接及用户操作回归。
- 执行范围：新增 docs 文档、补充根文档目录、建立相对链接。
- 验证方式：文档链接检查、目录清单检查、Git diff 检查。
- 残余风险：根目录 README 与 docs 仍存在概览信息，需要以后以索引和根入口职责维护，避免复制全文。

### D-003：采用“一份主题源、一次编译、两个消费者”

- 风险等级：中
- 背景：XLSX 插件和 MPE 都需要深色主题及橙色 mark 高亮，但 DOM 和 Less 行为不完全相同。
- 候选方案：两插件分别编译同一 Less；只维护 XLSX 主题；统一编译 CSS 后由两个插件分别加载。
- 决策：保留统一编译架构。theme.less 和 partial 是唯一人工源，dist/markdown-theme.css 是共享消费物；MPE 通过适配层内联 CSS。
- 原因：消除双编译差异，降低迁移和长期维护成本；两个 Webview 的 CSS 隔离不需要额外做跨插件冲突处理。
- 执行范围：架构文档、MPE 迁移文档、主题目录说明和运维说明。
- 验证方式：主题构建、CSS 中无 @import、选择器兼容检查、manifest SHA-256。
- 残余风险：MPE 和 XLSX 的具体 DOM 仍可能随上游升级变化，需要人工回归。

### D-004：生成报告不得持久化本机绝对路径

- 风险等级：中
- 背景：主题审计报告原本把当前 Mac 的绝对路径写入生成 Markdown，换机器后会产生误导并暴露本机目录。
- 证据：当前生成报告包含 /Users/.../xlsx-viewer-local-patch/...。
- 候选方案：保留绝对路径；完全删除输入和输出路径；改为主题目录内相对路径，外部输入只保留文件名。
- 决策：采用第三种方案。审计器统一使用相对展示路径；构建和运行时配置仍明确要求用户填写本机绝对 CSS 路径。
- 原因：文档可迁移，同时保留报告定位能力；不混淆“文档展示路径”和“运行时必须的绝对配置路径”。
- 执行范围：audit-compatibility.mjs、生成的 compatibility report 和 migration draft。
- 验证方式：重新运行 npm run theme:audit，扫描 Markdown 是否残留本机路径。
- 残余风险：用户自定义输入文件名本身可能含敏感信息；报告只在本地生成，不作为公开数据上传。

### D-005：把文档校验做成仓库级验证命令

- 风险等级：中
- 背景：仅人工检查无法稳定发现失效相对链接、本机绝对路径和旧版本残留。
- 候选方案：每次人工检查；使用通用 Markdown 工具但不固定规则；新增轻量 verify:docs 检查当前明确的目录规范。
- 决策：新增轻量仓库脚本，检查索引存在、内部 Markdown 链接可解析、文档不含本机仓库绝对路径和旧补丁版本残留。
- 原因：实现简单、可重复、与个人工具定位匹配，不引入企业级文档系统。
- 执行范围：scripts/verify-docs.mjs、package.json、文档验收清单。
- 验证方式：构建后执行 npm run verify:docs，再用 git diff --check 检查空白和补丁格式。
- 残余风险：轻量解析器不能替代完整 Markdown 渲染器；代码块中的示例路径需要避免误判。

### D-006：采用非强制覆盖的两阶段 Git 交付核对

- 风险等级：中
- 背景：用户要求最终推送到目标仓库，同时文档和生成物必须与最后验证结果一致。
- 候选方案：直接强制推送；只在本地提交；先正常推送，再核对远端并补充最终交付记录。
- 决策：采用第三种方案。先提交并正常推送 personal/main，读取远端 ref 和工作区；推送结果写回本文件后，再以普通提交完成最终记录同步。
- 原因：不覆盖远端未知提交，且让决策记录包含真实提交和推送证据。
- 执行范围：当前分支到 personal/main，不修改 origin，不执行 force push。
- 验证方式：推送前检查暂存区，推送后使用 git ls-remote personal refs/heads/main 和 git status 核对。
- 残余风险：目标仓库权限、网络或远端新增提交可能导致推送暂停。

### D-007：以远端实际 ref 作为最终推送证据

- 风险等级：中
- 背景：本地 push 返回成功仍需要确认 GitHub main 的实际指向和工作区状态。
- 决策：使用 git ls-remote personal refs/heads/main 读取远端实际 commit，并与本地 HEAD 比对；一致后才关闭本次交付。
- 执行范围：本次文档治理提交及其后续决策记录提交。
- 验证方式：远端 main 已返回 6a45bde3519062c18980ba6d41079b86510025a4；首次推送后工作区无未提交变更。
- 残余风险：后续其他协作者仍可能继续向 main 推送，当前证据只代表核对时刻。

### D-008：以附加代码审计报告为历史基线，并按当前源码重新判定

- 风险等级：高
- 背景：用户提供的审计报告针对 `1.9.98-local.2`，且报告明确说明未修改源码、没有 Git Commit Hash；当前工作区已经存在主题补丁和本轮未提交的修复。
- 候选方案：直接复制旧报告结论；忽略旧报告；逐项把旧证据映射到当前调用链后再更新结论。
- 决策：采用第三种方案。旧报告只作为问题清单和证据线索，修复状态必须以当前源码、测试结果和最终提交为准。
- 执行范围：Markdown 渲染、表格渲染、保存与恢复、文件转换、版本历史、主题安全、依赖和架构边界。
- 验证方式：重新检查关键 `innerHTML`、文件写入、消息处理和配置链路；新增 `npm run verify:security`；把未能联网确认的依赖项保留为待验证。
- 残余风险：无法在当前环境替代真实 Extension Host、三 IDE 交互和联网依赖扫描。

### D-009：采用轻量 Markdown 输出净化与收紧 CSP，而不是关闭全部原始 HTML

- 风险等级：高
- 背景：项目需要继续支持 `<mark>`、表格、Mermaid 和已有 Markdown 内容；简单关闭 `html` 会破坏既定功能。
- 候选方案：关闭原始 HTML；引入新的运行时依赖；在现有 Webview 中加入最小净化层并移除脚本能力。
- 决策：采用第三种方案。渲染结果进入 `innerHTML` 前移除脚本、`style` 标签、事件属性、危险链接和高风险资源；保留普通安全 HTML 与安全内联样式，Mermaid 统一使用 `securityLevel: strict`；宿主内联脚本改用 nonce。该记录形成时曾保留 `unsafe-eval` 兼容边界；`.8` 审计确认无实际需求后已删除，并加入回归断言。
- 原因：不新增生产依赖，保持 `<mark>` 和 Mermaid 主流程，修复面可审计且适合个人工具。
- 验证方式：`verify:security` 检查净化入口、CSP nonce、data URI 白名单和 Mermaid strict 配置；真实恶意文件回归仍需 IDE 手工验收。
- 残余风险：当前净化器不是通用 DOMPurify 替代品；公式渲染已改为直接使用 `katex`，测试工具链仍有依赖审计残余。

### D-010：保存与恢复采用“哈希冲突保护 + 原子替换”双重防护

- 风险等级：高
- 背景：旧报告指出 CSV/TSV、XLSX、Markdown 保存链路可能静默覆盖外部修改，直接写入也可能在中断时留下半写文件。
- 候选方案：只增加 mtime 检查；只改原子写入；保存前 SHA-256 比对并使用同目录临时文件加 rename。
- 决策：采用第三种方案。加载或成功保存后记录文件哈希；保存和版本恢复写入前重新比对，不一致即拒绝覆盖；本地文件写入统一通过共享原子写入工具。
- 原因：哈希比 mtime 更能识别内容变化，原子替换降低截断风险，且不引入复杂三方合并。
- 验证方式：静态检查所有核心保存与恢复入口，`verify:security` 检查恢复前校验，类型检查和构建通过；TOCTOU 窗口和断电持久性仍需真实环境验证。
- 残余风险：检查与 rename 之间仍存在极窄 TOCTOU 窗口；当前工具未承诺 fsync 级断电持久性。

### D-011：Markdown 历史改为独立快照，并设置明确资源上限

- 风险等级：中高
- 背景：旧报告指出全文嵌入单一 JSON 会随持续编辑重复存储并整体重写。
- 候选方案：仅延长防抖；继续使用全文 JSON；改为独立 Markdown 快照加元数据索引，并保留旧格式迁移。
- 决策：采用第三种方案。防抖改为 30 秒，历史保留 48 小时、最多 200 条、总量最多 50 MiB；迁移旧 JSON 时同样执行时间、条数和字节上限；单个超过上限的文档不生成历史快照。
- 原因：把磁盘和索引增长从无界改为有界，同时保留已有查看与恢复能力。
- 验证方式：类型检查、`verify:security` 和版本历史源码断言；真实长时间编辑性能曲线需在 IDE 中补测。
- 残余风险：表格侧版本历史仍是独立实现，尚未抽取为共享服务；老版本遗留 JSON 不会被自动物理删除。

### D-012：修复表格输入边界和转换状态，不改变既有表格业务入口

- 风险等级：中
- 背景：旧报告还指出普通单元格 `0`/`false` 可能被当成空值、富文本和属性拼接存在注入面、CSV BOM 未处理、稀疏 XLSX 可能造成资源放大、转换后样式失败会误报整体失败，以及分隔符使用模块级可变状态。
- 决策：抽取共享单元格显示值和 HTML 转义；保留 `0`、`false` 和公式结果；富文本仅允许 Provider 生成的有限标签；读取 CSV/TSV 时去除 UTF-8 BOM；对过大或过稀疏工作表停止读取；移除分隔符全局状态；转换成功但样式应用失败时明确提示部分成功。
- 原因：均为局部修复，不改变 XLSX/CSV/TSV 的用户操作路径，优先降低数据损坏与安全风险。
- 验证方式：`verify:security` 覆盖 `0`、`false`、公式、富文本、属性引号和路径边界；表格真实编辑回归仍需三 IDE 手工执行。
- 残余风险：对历史复杂 XLSX 的稀疏范围阈值需要结合真实文件样本持续校准。

### D-013：依赖漏洞在线审计后按风险分层处置

- 风险等级：中高
- 背景：附加报告列出了 `markdown-it-katex`、`exceljs`、`mermaid` 相关依赖风险；网络恢复后已取得当前锁文件的在线审计结果。
- 决策：移除无自动修复的 `markdown-it-katex`，改用直接 `katex` 集成并强制 `trust: false`；另只执行不带 `--force` 的 `npm audit fix --package-lock-only`，更新兼容范围内的传递依赖；保留 `exceljs`、`mocha`、`vscode-test` 的审计残余，不用静态测试通过冒充依赖漏洞已解决。
- 原因：`--force` 会引入主版本变更，可能破坏 Markdown、XLSX 和测试链路；当前结果必须区分已修复传递依赖、代码级缓解和仍需替换或豁免的依赖风险。
- 验证方式：移除公式插件后，`npm audit --json --package-lock-only` 当前结果为 8 项（4 low、3 moderate、1 high、0 critical）；已重新执行 KaTeX 公式回归、类型检查、安全回归、生产构建和文档检查。high 项来自测试工具链，公开发布前必须处置或正式豁免。
- 残余风险：测试工具链依赖漏洞仍未全部关闭；真实 Extension Host 行为和三 IDE 交互仍需现场验收。

### D-014：版本、文档、审计报告和验证命令随修复同批交付

- 风险等级：中
- 背景：只修代码会造成 README、版本号、测试门槛和审计结论互相矛盾。
- 决策：将版本提升为 `1.9.98-local.3`，同步 package lock、README、CHANGELOG、docs 索引、测试清单、当前状态、运维说明和本审计报告；以 `verify:docs`、`verify:security` 和最终远端 ref 作为交付门槛。
- 验证方式：全量自动化检查、VSIX 打包、Git diff 检查、提交后 `git ls-remote personal refs/heads/main` 比对。
- 残余风险：三套 IDE 的真实 UI 验收由用户在目标环境完成，本轮不能代替。

### D-015：将重点高亮快捷键的正式入口固定为扩展内置贡献点

- 风险等级：中
- 背景：历史说明曾要求用户将 `editor.action.insertSnippet` 写入 `keybindings.json`，这会造成“插件自带能力”和“用户本地覆盖”边界混淆，也可能在不同 IDE 中出现配置漂移。
- 候选方案：继续要求用户配置 `keybindings.json`；完全移除快捷键；在扩展 `package.json` 的 `contributes.keybindings` 中声明 macOS 与 Windows/Linux 快捷键，并在 README 明确用户级文件不是正式入口。
- 决策：采用第三种方案。扩展内置 `⌘⌥⇧3` / `Ctrl+Alt+Shift+3`，统一生成标准 `<mark>${TM_SELECTED_TEXT}</mark>`；用户级 `keybindings.json` 仅保留给其他个人快捷键。
- 原因：安装 VSIX 后开箱即用，跨 VS Code、Cursor、Antigravity 的交付行为一致，Markdown 文件仍保持跨 IDE 可读。
- 执行范围：package.json、README、README-LOCAL-PATCH、CHANGELOG、版本记录和验收清单。
- 验证方式：源码与 VSIX manifest 检查快捷键、when 条件和 snippet 内容；真实 IDE 交互仍需人工验收。
- 残余风险：用户已有相同快捷键绑定时，IDE 的快捷键解析优先级可能覆盖扩展贡献点；需要在目标 IDE 中记录冲突处理结果。

### D-016：为 Markdown 双栏分别提供字号与行高设置

- 风险等级：低至中
- 背景：`.6` 右侧预览可配置字号，但左侧 Webview 编辑区固定为 `13px / 1.6`，用户无法在不放大整个 IDE 的情况下改善写作体验。
- 候选方案：只建议 `window.zoomLevel`；只提高固定 CSS 默认值；新增 `xlsxViewer.md.editorFontSize` 和 `xlsxViewer.md.editorLineHeight`，沿用现有 `previewFontSize` / `previewLineHeight` 配置链路。
- 决策：采用第三种方案，默认编辑区 `16px / 1.8`，预览区继续支持单独配置；同时把已有 `<mark>` 和预览颜色设置纳入同一个 `Markdown appearance` 受控面板。CSS 通过稳定变量接入，不开放任意 CSS/脚本编辑，也不影响 XLSX、CSV、TSV。
- 原因：只改变 Markdown Webview 的显示，不扩大 IDE 全局影响面，且设置可被未来主题或用户配置覆盖。
- 执行范围：package.json、package-lock.json、mdEditorProvider、mdWebview、mdWebview.css、SettingsManager、主题 CSS、verify-local-patch 与用户文档。
- 验证方式：类型、Lint、源码标记、构建产物和设置默认值检查；真实三 IDE 字号体验仍需现场验收。
- 残余风险：非法 CSS 值由 Webview CSS 解析器忽略；当前设置是字符串而不是带单位的枚举，文档需提示用户填写合法 CSS 值。

### D-017：以原作者 v1.9.98 建立新的集成基线

- 风险等级：中高
- 背景：本地 Fork 早期以 v1.9.97 作为功能对照，但原作者仓库已经发布 v1.9.98；继续在旧基线上开发会让外部路径、图片兼容和后续合并边界不清晰。
- 决策：拉取并核对原作者仓库 `v1.9.98`，以提交 `fd6ed727bf241f6fd2c1380a609e7c728e108ee4` 建立集成基线；保留 `v1.9.97` 作为历史差异基线，并以非快进合并提交保留来源边界。
- 原因：功能版本号、上游变更和本地安全修复链路可独立追溯；上游的图片路径兼容合并后仍受本地路径校验和 Webview 资源根限制约束。
- 验证方式：`git ls-remote`、Tag 父子关系、合并冲突核对、类型检查、Lint、生产构建、`verify:security` 和 VSIX 包内容检查。
- 残余风险：真实 VS Code、Cursor、Antigravity Extension Host 的安装与交互仍需现场验收；上游后续版本仍需按同一流程重新核对。

### D-018：把轻量外观配置做成可扩展但受控的配置层

- 风险等级：中
- 背景：如果每次字号、行高或高亮颜色需求都直接改 CSS 并重新发版，维护成本会持续上升；如果开放完整主题编辑器，又会扩大安全和兼容范围。
- 决策：采用“稳定配置对象 + CSS 变量 + 数据驱动设置面板”的轻量方案，首批覆盖高亮、预览和左右编辑字号/行高；新增字段只需同步 manifest、宿主读写、面板定义、验证和文档，不引入任意 CSS/脚本编辑。
- 原因：满足长期调整和多 IDE 同步需求，同时保持实现边界、回滚和审计成本可控。
- 验证方式：设置默认值断言、受控 CSS 值校验、面板字段源码检查、类型/Lint/构建、安全回归和文档门禁；真实界面持久化需在三 IDE 现场记录。
- 残余风险：用户输入的 CSS 值仍需遵守文档中的合法值约束；未来新增字段不能绕过同一校验链路。

### D-020：将用户验收发现的标题配色和工具栏布局缺口收敛为 `.9` 最小修复

- 风险等级：中
- 背景：`.8` 已实现 Markdown 外观配置，但未包含“不同 Markdown 层级标题默认预设为蓝色”的配置项；真实验收截图同时显示格式工具栏在窄分栏中被 Flex 压缩并裁切，末尾工具组不可见。
- 证据：当前 `package.json` 没有 `xlsxViewer.md.headingColor`；`tokens.less` 将 h1-h6 统一设为浅色；`resources/md/mdWebview.css` 的 `.formatting-toolbar` 采用单行横向滚动且 `.fmt-btn` 未声明不可收缩。
- 候选方案：只调整截图中的颜色和宽度；新增完整主题/设置链路并修复工具栏布局；重做整个 Markdown 工具栏。
- 决策：采用第二种方案。新增一个受控的 `xlsxViewer.md.headingColor`，默认 `#569CD6`，贯通设置、运行时变量、内置 CSS 和外置 Less 主题；只调整格式工具栏的换行和 Flex 收缩规则，不重做按钮功能。
- 原因：标题颜色需要在三个配置入口（用户设置、Settings 面板、外置主题）保持同一事实源；工具栏问题是布局约束缺失，不是按钮逻辑缺失。最小修复可以覆盖当前验收场景，避免扩大到 XLSX/CSV/TSV 代码。
- 执行范围：package.json、package-lock.json、src/mdEditorProvider.ts、src/webviews/md/mdWebview.ts、resources/md/mdWebview.css、themes/markdown-theme/partials、验证脚本、README/CHANGELOG/开发/测试/版本文档。
- 验证方式：类型检查、主题构建、源码回归、文档验证、VSIX manifest/文件范围核对；三个 IDE 需分别重载窗口后确认 h1-h6、标题颜色持久化和工具栏完整可见。
- 偏差：`.8` 文档曾将 Markdown 外观配置描述为已完整覆盖，但实际缺少标题颜色字段；本次明确记录为需求遗漏并升级版本，不把截图或静态 CSS 检查冒充真实 IDE 验收。
- 残余风险：工具栏多行布局的最终高度、窄分栏交互和外置主题覆盖关系仍需三个 IDE 现场确认；六项审计 P2 仍未在 `.9` 中展开治理。

### D-021：按用户要求在研发完成后执行独立 code-audit，再进入安装和发布

- 风险等级：高
- 背景：本轮不仅要实现六项输入边界和本地资源治理，还要求在研发完成后进行独立代码审计，审计发现的问题必须先修复并重新验证，不能把实现者自检当作最终质量门禁。
- 决策：先完成 `.10` 研发实现和自动化测试，再按 `code-audit` skill 的整仓范围、调用链、边界、安全、性能、架构、数据一致性清单生成 Markdown 审计报告；审计问题进入修复循环，修复后重新跑全部门禁，最后才安装三个 IDE 并尝试推送。
- 约束：`code-audit` skill 的审计阶段只产出报告；用户明确授权“审计后修复”，因此修复动作在审计报告生成后单独执行，不把审计过程和代码修改混在同一证据中。
- 验证方式：审计报告必须包含文件路径、行号、调用链、触发条件、风险等级、验证方式和未覆盖范围；修复后检查报告问题已关闭或明确保留；类型、Lint、测试源、`verify:security`、`verify:local-patch`、`verify:theme-system`、`verify:docs`、主题构建、VSIX manifest/文件范围/SHA-256 均重新执行。
- 残余风险：真实 VS Code、Cursor、Antigravity GUI、断网 KaTeX、跨平台 Windows symlink 仍需用户现场补证；GitHub 实时远端指针已在推送后实时核对，但该证据只代表核对时刻。

### D-019：对 `.7` 进行代码审计后升级为 `.8`，优先关闭可验证的安全与测试门禁问题

- 风险等级：中高
- 背景：`.7` 审计时发现 Markdown CSP 仍声明无实际用途的 `unsafe-eval`，锁文件有 6 项在线依赖告警（2 low、3 moderate、1 high），且宿主 macOS 的 VS Code Extension Host 以 `SIGABRT` 退出，无法证明测试结果。
- 候选方案：使用 `npm audit fix --force`；只在 README 中豁免告警；或用兼容的根级 overrides 修复依赖、收紧 CSP，并在 Docker + Xvfb 中复跑真实 Extension Host。
- 决策：采用第三种方案，版本升级为 `1.9.98-local.8`。覆盖 `diff`、`serialize-javascript` 和 ExcelJS 使用的 `uuid`，不降级 ExcelJS；删除 `unsafe-eval`；将 VS Code 测试 CLI 显式切换为 Mocha BDD，并加入 headless 启动参数。
- 原因：高危依赖来自开发/构建链，必须消除而不能以“VSIX 不包含它”代替；`--force` 可能破坏 ExcelJS 和测试链路；Docker 可提供可重复的 Extension Host 证据，但不能冒充三个本地 IDE 的人工验收。
- 执行范围：package.json、package-lock.json、src/mdEditorProvider.ts、scripts/verify-security.mjs、.vscode-test.mjs、README/CHANGELOG/版本记录和本审计报告。
- 验证方式：干净依赖安装后 `npm audit` 为 0；Node 24 + Linux arm64 + Xvfb 中 Extension Host 4 项测试通过；类型检查、构建、安全、主题、文档和 VSIX 验包继续执行。
- 偏差：宿主 macOS 直接运行下载的 Code 仍以 134/SIGABRT 中止，因此本机 Extension Host 仍标记为环境限制；Docker 运行已证明测试代码和扩展 Host 可以正常启动。
- 残余风险：外部 KaTeX CSS CDN、绝对路径图片和 Webview 大批量消息的边界治理未纳入 `.8` 的行为改造，已在审计报告中列为 P2 后续事项。

## 执行与验证记录

### 2026-09-15：`.10` 输入边界治理、代码审计修复与发布候选

1. 复核截图与当前源码，确认标题颜色配置在 `.8` 的 package、provider、Webview 和主题链路中均缺失；确认工具栏显示问题来自 Flex 收缩与单行溢出约束，并已由 `.9` 修复。
2. 新增共享 `webviewMessageSchema.ts`，覆盖 Markdown/Spreadsheet 两个 Extension Host 消息入口、字段类型、条数、字节、Base64、坐标、合并面积和错误码。
3. 增加 Markdown/Webview payload、表格编辑、StyleStorage 容量、realpath/symlink 边界和本地 KaTeX CSS/字体；补充 schema/symlink/StyleStorage 回归。
4. 已执行 `code-audit` skill 并建立独立 `.10` 审计报告；按报告修复可选字段类型放行、列坐标轴上限、保存错误提示和新增 schema lint warning，补充对应回归断言。
5. 已通过类型、编译、安全、本地补丁、主题和文档验证；`npm audit --json --package-lock-only` 为 0 项漏洞；生产构建和 VSIX 验包通过。
6. 已生成 `release/muhammad-ahmad.xlsx-viewer-1.9.98-local.10.vsix`，119 files、3,100,499 bytes；包外 SHA-256 为 `fd9ed64532dd6c9351b9671c69b55a4d2f9c7383630844efa2f526b93f31cf45`，包内已核对本地 KaTeX CSS/字体、`.10` manifest 和 `headingColor` 默认值，包内文档不自引用自身哈希。
7. `npm test` 的测试源编译和 CLI 配置通过，但 macOS Extension Host 仍以 SIGABRT 终止；Docker arm64 干净安装 615 个包且审计为 0 项，但本轮 Linux VS Code 运行时下载未进入测试进程，不能记为 Extension Host 通过。
8. 已将最终 `.10` VSIX 安装到 VS Code、Cursor、Antigravity IDE，三个 CLI 均核对为 `muhammad-ahmad.xlsx-viewer@1.9.98-local.10`；窗口重载和真实交互验收仍需现场记录。
9. 代码、资源和审计修复提交为 `6d2d44dbe5c7308ba6d4edd170b43530f1ec4991`；版本台账和审计证据回填提交为 `c7dedd2b8fb6aaee52121871403428d99dc36fdb`。最终文档证据提交前 `git ls-remote personal refs/heads/main` 返回 `a60a917a282a6e14fc7523bf2bec0c015487e90f`，与当时的本地 `HEAD`、`refs/remotes/personal/main` 一致；本次最终文档提交后的实时指针以最后一次交付核对为准。

### 2026-09-15：`.7` 代码审计、`.8` 修复与 Docker 验收

1. 以 `release/muhammad-ahmad.xlsx-viewer-1.9.98-local.7.vsix`（SHA-256 `4aa6e05167154f07fccb1645b90c0f9ddd36b2c837c891c26c0399be067045f9`）及其源代码提交 `dfe100d6ce21cb3d6321d1d54a2217e461520172` 为初始审计对象。
2. 复核发现 `.7` 锁文件为 6 项在线告警；通过根级 overrides 生成新锁文件后，干净临时副本 `npm audit --package-lock-only` 和 `npm audit --omit=dev` 均为 0 项。
3. 移除 Markdown CSP 中的 `unsafe-eval`，并加入 `verify:security` 回归断言。
4. 修正 `.vscode-test.mjs` 的 Mocha UI 与 headless 启动参数；Docker Node 24 + Linux arm64 + Xvfb 中 Extension Host 测试 4 项通过。
5. 宿主 macOS 直接启动同版本 Code 仍以 SIGABRT/134 退出，记录为本机环境限制；没有将该限制写成代码测试失败或“已在宿主通过”。
6. 当前修复版本为 `1.9.98-local.8`，代码与文档修复提交为 `2178c410e4698119b7a987aa9dc66f4926ad17d1`，版本台账/审计证据提交为 `fbaf3f735b9ec3f151976267aacf1ff27092e77c`；VSIX 已完成生产构建与验包，SHA-256 为 `9d5f19906d46fda3b757c3f9e1fef891e2da5ca16ab2b40d0161835fbdb6f4f2`；最终文档提交链已正常推送，并已核对 `personal/main`。

### 2026-09-15：v1.9.98 集成与 `.7` 外观配置层（本轮）

1. 已从原作者仓库核对并拉取 `v1.9.98`，确认其提交为 `fd6ed727bf241f6fd2c1380a609e7c728e108ee4`，并以非快进合并保留上游来源边界。
2. 已将上游外部路径/图片兼容变更合入，同时保留本 Fork 的工作区边界、图片扩展名约束和动态资源根限制。
3. 已将 Markdown 外观配置收敛为数据驱动的受控面板，覆盖 `<mark>`、预览和左右编辑字号/行高；没有引入任意 CSS/脚本编辑器。
4. 已补充设置持久化、CSS 值校验、设置面板分组、验证脚本和 README/架构/运维/版本记录文档。
5. 本轮自动化检查已通过：类型检查、Lint（仅保留 2 个未修改上游 warning）、生产构建、`verify:security`、`verify:local-patch`、`verify:docs`；真实三 IDE 仍待现场验收。
6. 已恢复安全/可靠性 Extension Host 测试源，并补齐 `@vscode/test-cli`、`@vscode/test-electron`；`npm test` 已下载 VS Code 1.137.0 测试运行时，但当前 macOS 执行环境启动 Code 进程以 SIGABRT 终止，故只把测试源编译和 CLI 配置记为通过，Extension Host 结果记为阻塞。
7. 当前锁文件在线审计为 6 项（2 low、3 moderate、1 high、0 critical）；移除废弃的 `vscode-test` 直接依赖后，仅执行不带 `--force` 的兼容修复，high 项仍来自开发测试工具链。
8. 已生成 `release/muhammad-ahmad.xlsx-viewer-1.9.98-local.7.vsix`，SHA-256 为 `4aa6e05167154f07fccb1645b90c0f9ddd36b2c837c891c26c0399be067045f9`；代码与文档交付提交为 `2f69e73bde2db15366b83132ef2d0d366d72d198`。推送后以 `git ls-remote personal refs/heads/main` 核对远端最终提交，不使用强制推送。

### 2026-08-31：已完成的关键步骤

1. 已读取目录规范和 AI 决策记录规范。
2. 已核对当前版本、分支、远端和已有文档。
3. 已完成 docs 分域结构和总索引设计。
4. 已修正主题审计生成器的路径展示策略。
5. 已新增产品、架构、迁移、开发、测试、运维和本决策文档。
6. 已新增 verify:docs，扫描仓库 Markdown 文件并通过内部链接、绝对路径和旧版本残留检查。
7. 已完成主题构建和 MPE 迁移审计；主题 CSS SHA-256 为 07cdf56e65aa4c170e1c1a467c1aa407816a20765d91b5c8210a0c21266b319a。
8. 已通过 check-types、verify:local-patch、verify:theme-system、verify:docs 和 git diff --check。
9. lint 通过且无 error；本轮修复后仅保留 2 个未修改上游文件的 warning。
10. 已完成生产构建和 VSIX 内容核对；包内包含 docs、主题生成物和 verify-docs.mjs，且不包含主题工程 node_modules。
11. 已完成最终 VSIX 重打包，文档和 CHANGELOG 已包含本轮更新。
12. 已完成首次正常推送；远端 personal/main 已核对为 6a45bde3519062c18980ba6d41079b86510025a4，与本地 HEAD 一致，工作区干净。
13. 已提交本次推送证据并完成最终同步；远端 personal/main 已核对为 0d0f92437870583dd5dd1244603e0aee005bcb96，与本地 HEAD 一致，工作区干净。

### 2026-08-31：本轮代码审计修复与交付（代码与文档已完成，真实 IDE 验收待现场）

1. 已读取并纳入用户提供的 `XLSX-CSV-TSV-Markdown-Editor_代码审计报告.md`，按当前源码逐项复核，不直接沿用旧版本结论。
2. 已完成 Markdown 输出净化、CSP nonce、Mermaid strict、安全链接和 data URI 白名单处理。
3. 已完成 Markdown、CSV/TSV、XLSX 保存与版本恢复的哈希冲突保护，以及核心本地写入原子替换。
4. 已完成 Markdown 历史快照迁移、30 秒防抖、48 小时/200 条/50 MiB 上限。
5. 已完成表格普通值、富文本、属性、BOM、稀疏工作表、CSV 分隔符和转换部分成功状态修复。
6. 已新增 `npm run verify:security`，当前已通过；在线依赖审计已完成，锁文件仍有 8 项漏洞（4 low、3 moderate、1 high、0 critical），high 项来自测试工具链。
7. 已移除无自动修复的 `markdown-it-katex`，改用直接 `katex` 集成并完成公式回归；同时补充 Mermaid 代码块文本和语言类名的属性转义，避免不可信 fence 元数据进入 HTML 属性。
8. 当前版本已提升为 `1.9.98-local.3`，审计报告、README、CHANGELOG 和验证清单已同步更新。
9. 首轮代码与文档提交已完成；本次决策记录补录后重新执行 `verify:docs`、`git diff --check` 并重打包最终 VSIX。
10. 首轮提交 `0f74795757e85bd308abe54db5db26079d13ea53` 已推送到 `personal/main`，远端 SHA 与本地 HEAD 一致；本次决策记录补录将作为后续最终文档提交的一部分。

## 未决事项与回滚

### 待验证事项

- VS Code、Cursor、Antigravity 是否都能在真实环境安装并正常加载本地 VSIX。
- 三套 IDE 使用同一份 CSS 时，实际目录、表格、代码块和主题刷新效果是否完全一致。
- 最终代码与文档已推送并核对 `personal/main`；剩余待验证事项仅为 VS Code、Cursor、Antigravity 的现场安装和真实 UI 交互验收。

### 回滚策略

- 文档变更：回退本次文档提交，不触碰用户 Markdown。
- 主题异常：关闭 xlsxViewer.md.theme.enabled，或恢复上一份 CSS、manifest 和 VSIX。
- 扩展升级异常：重新安装此前保留的本地 VSIX，或安装官方同标识扩展。
- 推送前发现冲突：停止推送，先读取远端最新提交并重新判断，不强制覆盖远端。
