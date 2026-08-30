# XLSX, CSV, TSV & Markdown Editor：完整增强版说明

## 1. 目标与边界

本 Fork 是个人侧载用的补丁版，基于上游 `muhammad-ahmad.xlsx-viewer` v1.9.97。当前版本为 `1.9.98-local.2`，扩展 ID 仍为 `muhammad-ahmad.xlsx-viewer`，因此同一个 IDE 中会替换官方扩展，不能并存。

本次完整增强版的目标是：只维护一份 Less 主题源码，生成一份 CSS，同时供本扩展和 Markdown Preview Enhanced（MPE）使用；Markdown 正文只写语义明确的 `<mark>重点</mark>`，不再为每篇文档插入 `<style>` 或冗长的 `<span style="...">`。

不在本次范围：重命名 Publisher、发布 Marketplace、修改 XLSX/CSV/TSV 作业逻辑，或自动改写现有 MPE 的 `style.less`。

## 2. 最终结构

```text
themes/markdown-theme/
├── theme.less                         # 唯一人工维护入口
├── partials/                          # 颜色、排版、正文、目录分层
├── scripts/build-theme.mjs            # 唯一 Less 编译器
├── scripts/watch-theme.mjs            # 监听 theme.less 与 @import 依赖
├── scripts/audit-compatibility.mjs    # MPE 样式迁移审计器
├── adapters/mpe-adapter.less          # MPE 只读取已编译 CSS 的适配模板
└── dist/
    ├── markdown-theme.css             # 自动生成；两个预览器共同消费
    ├── theme-manifest.json            # SHA-256 与依赖清单
    └── compatibility-report.md        # 审计器生成的迁移报告
```

数据流为：`theme.less` → 单次 Less 编译 → `markdown-theme.css` → XLSX 插件与 MPE 分别加载。两套插件不会直接编译同一份 Less，也不会跨 Webview 相互污染样式。

## 3. 首次启用

在仓库根目录执行：

```zsh
cd "/Users/lizhihang/Documents/Codex/2026-07-28/xian/xlsx-viewer-local-patch"
npm ci --cache /private/tmp/xlsx-viewer-local-patch-npm-cache --no-audit --no-fund
npm --prefix themes/markdown-theme ci --cache /private/tmp/xlsx-viewer-markdown-theme-npm-cache --no-audit --no-fund
npm run theme:build
pwd
```

最后一条会输出仓库绝对路径。将该路径替换到 IDE 的用户设置 JSON：

```jsonc
{
  "xlsxViewer.md.theme.enabled": true,
  "xlsxViewer.md.theme.cssFile": "/仓库绝对路径/themes/markdown-theme/dist/markdown-theme.css",
  "xlsxViewer.md.theme.manifestFile": "/仓库绝对路径/themes/markdown-theme/dist/theme-manifest.json",
  "xlsxViewer.md.theme.watch": true
}
```

在 VS Code、Cursor、Antigravity 中各配置一次。三个 IDE 可指向同一仓库内的 CSS 文件，因此主题内容只维护一份。

## 4. 日常使用与修改主题

Markdown 正文只写：

```html
普通文字，<mark>这是橙色重点</mark>，后面继续是普通文字。
```

日常改主题时只编辑 `themes/markdown-theme/theme.less` 或 `partials/*.less`，然后任选一种方式：

```zsh
# 修改一次后手动构建
npm run theme:build

# 开发时持续监听 @import 依赖；按 Ctrl + C 停止
npm run theme:watch
```

CSS 会原子替换，插件在开启 `xlsxViewer.md.theme.watch` 时自动加载新文件。也可执行命令面板中的：

```text
Markdown: 重新加载外置 Markdown 主题
Markdown: 显示外置 Markdown 主题状态
Markdown: 打开外置 Markdown 主题目录
```

主题加载约束：仅接受 2 MiB 以内的本地、已编译 CSS；拒绝 `@import`、远程/data/javascript 资源与 `html`、`body` 全局选择器。若当前 CSS 保存坏了，插件会继续保留同一路径上一次成功加载的 CSS，不会使预览白屏。

## 5. MPE 适配

不要让 MPE 与 XLSX 插件直接分别编译 `theme.less`。先运行 `npm run theme:build`，再把 `themes/markdown-theme/adapters/mpe-adapter.less` 中的一行复制到 MPE 的 Global `style.less`，并替换为真实绝对路径：

```less
@import (inline) "/仓库绝对路径/themes/markdown-theme/dist/markdown-theme.css";
```

MPE 的 `style.less` 此后只保留这条适配导入；主题细节统一回到 `theme.less`。主题已同时兼容 `.toc-panel` 和 MPE 的 `.md-sidebar-toc`；正文均以 `.markdown-preview` 为作用域。若迁移旧 MPE 样式，执行：

```zsh
npm run theme:audit -- "/你的/MPE/style.less"
```

审计会输出 `themes/markdown-theme/dist/compatibility-report.md` 和 `migration-draft.less`：前者标出可直接复用、目录别名和必须人工处理的 `html/body`、`@import` 规则；后者把可安全复用的规则整理为 Less 草稿，但不会被自动加载，必须人工审阅后再合并进 `theme.less` 或对应 partial。

## 6. 固定配置与外置主题的优先级

1. 扩展内置样式：最低优先级。
2. 旧的 `xlsxViewer.md.mark*`、`preview*` 固定配置：用于不启用外置主题的轻量场景。
3. 外置 `markdown-theme.css`：启用后最后注入，覆盖同一选择器。
4. Markdown 正文内 `<style>`：仍可能覆盖预览，但不推荐继续使用。

推荐统一使用外置主题，不要同时把同一属性写在固定设置、主题 CSS 与单篇 `<style>` 中。

## 7. 构建、验证与 VSIX 安装

```zsh
cd "/Users/lizhihang/Documents/Codex/2026-07-28/xian/xlsx-viewer-local-patch"
npm run theme:build
npm run theme:audit
npm run check-types
npm run lint
npm run package
npm run verify:local-patch
npm run verify:theme-system
npx --yes --cache /private/tmp/xlsx-viewer-local-patch-npm-cache @vscode/vsce@3.9.2 package --out "release/muhammad-ahmad.xlsx-viewer-1.9.98-local.2.vsix"
```

通过 IDE 的 `Extensions: Install from VSIX...` 安装；不要直接把解压目录复制到 `~/.vscode/extensions`、`~/.cursor/extensions` 或 `~/.antigravity/extensions`。安装后关闭该扩展的自动更新，避免被官方版本覆盖。

## 8. 验收、回退与维护成本

| 验收项 | 自动化 | 真实 IDE 手工验收 |
| --- | --- | --- |
| Less 单次编译、依赖清单、SHA-256 | 是 | 不需要 |
| 主题 CSS 注入、路径校验、失败回退 | 类型检查与源码验证 | 打开 Markdown 后确认状态和刷新 |
| `<mark>` 橙底、目录深色、表格/代码/引用样式 | CSS 选择器验证 | VS Code、Cursor、Antigravity 各至少一次 |
| XLSX、CSV、TSV 无回归 | 构建与静态验证 | 各打开、编辑、保存一次 |

| 事项 | 成本 | 风险 |
| --- | --- | --- |
| 改颜色、字号、表格或目录样式 | 1–5 分钟 | 低 |
| 新增主题 partial 或 CSS 规则 | 10–30 分钟 | 低 |
| 迁移旧 MPE 样式 | 30–90 分钟 | 中，审计器可缩小人工范围 |
| 上游小版本升级 | 1–3 小时 | 中，需重新验证 Markdown 与三类表格 |
| 上游重构 Markdown Webview | 4–8 小时 | 中高，需要重新核对注入点与 DOM class |

回退时重新安装官方扩展即可；Markdown 源文件只含标准 `<mark>`，不会丢失内容。保留当前 VSIX、Git 提交与 `themes/markdown-theme`，再升级或回退。
