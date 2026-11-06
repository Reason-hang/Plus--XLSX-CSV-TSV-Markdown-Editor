# 个人维护功能与主题说明

当前源码候选基于上游 `v2.0.7`（`1335afc48f7b05f34495c9a271bce7656da3edaf`），版本为 `2.0.7-local.1`。完成真实 IDE 验收与发布前，它仍是候选版本。个人扩展 ID 沿用 `muhammad-ahmad.xlsx-viewer`。

## 功能归属

| 来源 | 主要功能 |
| --- | --- |
| 上游 `v2.0.7` | XLSX／CSV／TSV 统一编辑、Markdown 分屏与预览编辑、插件内自动保存、浮动返回顶部按钮等 |
| 个人维护 | Markdown 高亮及外观设置、外置主题与 MPE 适配、主工具栏排序与显隐、图片可信目录、文件保存保护、历史兼容及 Webview 输入限制 |
| 历史版本 | 已修复或被上游取代的功能与当时的验证情况，保留在 `docs/` 历史记录中，不等于当前版本已逐项通过真实 IDE 验收 |

个人版未额外恢复旧版工具栏上的返回顶部图标与命令，采用上游浮动按钮；也未将 Markdown 编辑接入 IDE 原生文本模型。

## 工具栏与自动保存

Markdown 预览右侧齿轮 → **自定义工具栏**：在已显示区拖动或使用 `Alt + 方向键` 排序，点击 `×` 隐藏；在未显示区点击项目重新添加。点击“应用布局”并等待成功后生效。设置入口固定保留；按钮还受阅读、编辑或保存状态约束。

布局作为当前 IDE 的扩展状态保存，支持读取旧版已有的合法布局；不写入 Markdown 文档，也不默认跨 IDE 同步。新版本真实宿主持久化验收情况应查看本轮记录。

Markdown 自动保存由插件单独控制，默认关闭。打开插件设置中的“自动保存”，并设置延迟；延迟为 `0` 时读取 IDE 的 `files.autoSaveDelay`。IDE 的 `files.autoSave` 开关本身不会自动开启本插件保存。

## 外观与外置主题

在 Markdown 设置的“外观”中，可调整标题和 `<mark>` 的颜色，以及预览／编辑区的背景、文字、字号和行高。留空的预览值跟随内置默认样式；文字缩放按钮在该基准上调整显示比例。

外置主题默认关闭，设置以下用户级配置后使用：

```jsonc
{
  "xlsxViewer.md.theme.enabled": true,
  "xlsxViewer.md.theme.cssFile": "/你的仓库绝对路径/themes/markdown-theme/dist/markdown-theme.css",
  "xlsxViewer.md.theme.manifestFile": "/你的仓库绝对路径/themes/markdown-theme/dist/theme-manifest.json",
  "xlsxViewer.md.theme.watch": true
}
```

主题文件位于 `themes/markdown-theme/`；请修改 `theme.less` 或 `partials/*.less`，不要手改生成的 CSS 和 manifest。首次构建需在主题目录安装锁文件指定的依赖，再从仓库根目录运行 `npm run theme:build`；开发监听使用 `npm run theme:watch`。项目提供 MPE 适配模板和 `npm run theme:audit`，不会自动修改 MPE 配置。详见 [主题说明](themes/markdown-theme/README.md)。

主题加载要求本地绝对路径及不超过 2 MiB 的 CSS；同路径更新无效时保留最近一次成功加载结果。主题 CSS 的规则检查是辅助校验，资源访问还受 Webview 内容安全策略限制。

## 文件与保存边界

- Markdown 预览编辑不能保证任意语法无损。遇到围栏、Tab 或无法安全往返的内容且实际修改时，使用分屏编辑；未修改时保留原始源码。
- 文件在外部发生更改后，保存或历史恢复会检查指纹并拒绝覆盖。原子替换降低半写风险，但不等于完整的跨进程事务。
- CSV／TSV 仅支持可安全往返的 UTF-8；保留可识别的 BOM、换行、末尾换行及字段引用。复杂 XLSX 中已知无法保真重写的部件会触发拒绝。
- Markdown 和表格的历史记录以索引和快照保存；Markdown 兼容旧格式。损坏或不可识别的索引不应被静默覆盖。回装旧扩展不能修复已经被覆盖的用户文件。

## 验证和安装

从源码仓库根目录可运行 `npm run package` 构建扩展代码，`npm run test:local` 执行不启动 IDE 的本地测试。两者的结果不能代替真实 IDE 操作验收。

`npm test` 只在用户明确授权启动隔离测试窗口，并通过 `VSCODE_EXECUTABLE_PATH` 指定现有 IDE 后使用；没有该路径时直接退出，不自动下载或升级 IDE。

最终 VSIX 需从对应的已验证源码重新构建，并分别记录包内版本、SHA-256、实际安装和运行验收。通过 IDE 的“从 VSIX 安装”选择该包；不直接复制解压目录。安装不会自动重载用户窗口。

历史资料：[旧版功能差异](docs/07-版本与发布/v1.9.97-对比1.9.98-local.10-功能差异清单.md)、[旧版审计处置](docs/05-测试与验收/v2.0.1-local.2-两份审计报告复核与处置.md)、[版本记录](docs/07-版本与发布/版本记录表-v2.2-续记.md)。
