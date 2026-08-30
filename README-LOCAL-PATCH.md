# XLSX, CSV, TSV & Markdown Editor：本地 Markdown 外观补丁版

## 1. 这是什么

这是一个仅供个人侧载使用的 VSIX 补丁版，基于上游
[`muhammad-ahmad.xlsx-viewer` v1.9.97](https://github.com/Mahmadabid/XLSX-CSV-TSV-MARKDOWN-Editor-Vscode-Extension/tree/v1.9.97)
构建。

- 扩展标识保持为 `muhammad-ahmad.xlsx-viewer`，因此可直接替换同一 IDE 中的原版扩展。
- 本地补丁版本为 `1.9.98-local.1`，用于与上游 `1.9.97` 区分。
- 不发布到扩展商店；不上传任何文档或配置；不改 XLSX、CSV、TSV 的 provider、脚本或样式。
- 原项目的 MIT LICENSE、README 和版权信息均保留在包内。

> 同一个 IDE 中，补丁版与官方版不能并存：两者使用同一扩展标识。安装本补丁会替换该 IDE 中的官方版；重新安装官方版即可回退。

## 2. 已实现效果

以后 Markdown 正文只需写：

```html
这是普通文字，<mark>这是重点文字</mark>，后面继续是普通文字。
```

保存后，在本扩展的 Markdown 预览中，所有 `<mark>...</mark>` 默认显示为：

- 橙色背景：`#FF4E00`
- 文字颜色：继承当前主题正文色
- 字重：继承当前正文，不强制黑字或加粗
- 内边距：`0 2px`
- 圆角：`2px`

不需要再在每份 Markdown 的开头或结尾插入 `<style>`，也不需要使用冗长的 `<span style="...">`。

编辑视图仍会显示简短且语义明确的 `<mark>` 与 `</mark>` 标签；这是本扩展使用原生 `<textarea>` 作为源文件编辑器的正常行为。它不会改变文档内容，也不会影响保存、预览、导出或协作阅读。

## 3. 全局配置入口

在 VS Code、Cursor 或 Antigravity 的 **用户设置 JSON** 中配置一次，即对该 IDE 中所有使用本扩展打开的 Markdown 生效：

```jsonc
{
  // <mark> 全局样式
  "xlsxViewer.md.markBackgroundColor": "#FF4E00",
  "xlsxViewer.md.markTextColor": "inherit",
  "xlsxViewer.md.markFontWeight": "inherit",
  "xlsxViewer.md.markPadding": "0 2px",
  "xlsxViewer.md.markBorderRadius": "2px",

  // 预览窗格全局样式；空字符串表示沿用 IDE 主题
  "xlsxViewer.md.previewBackgroundColor": "",
  "xlsxViewer.md.previewTextColor": "",
  "xlsxViewer.md.previewFontSize": "",
  "xlsxViewer.md.previewLineHeight": ""
}
```

打开方式：`Cmd + Shift + P` → `Preferences: Open User Settings (JSON)`。

| 配置键 | 默认值 | 作用 |
| --- | --- | --- |
| `xlsxViewer.md.markBackgroundColor` | `#FF4E00` | `<mark>` 背景色 |
| `xlsxViewer.md.markTextColor` | `inherit` | `<mark>` 文字色；保持正文颜色 |
| `xlsxViewer.md.markFontWeight` | `inherit` | `<mark>` 字重；不强制加粗 |
| `xlsxViewer.md.markPadding` | `0 2px` | `<mark>` 内边距 |
| `xlsxViewer.md.markBorderRadius` | `2px` | `<mark>` 圆角 |
| `xlsxViewer.md.previewBackgroundColor` | 空 | 预览窗格背景色 |
| `xlsxViewer.md.previewTextColor` | 空 | 预览窗格正文色 |
| `xlsxViewer.md.previewFontSize` | 空 | 预览字号，例如 `15px` |
| `xlsxViewer.md.previewLineHeight` | 空 | 预览行高，例如 `1.7` |

例如，想让预览使用更柔和的深色阅读面：

```jsonc
{
  "xlsxViewer.md.markBackgroundColor": "#FF4E00",
  "xlsxViewer.md.previewBackgroundColor": "#1E1E1E",
  "xlsxViewer.md.previewTextColor": "#D4D4D4",
  "xlsxViewer.md.previewFontSize": "15px",
  "xlsxViewer.md.previewLineHeight": "1.75"
}
```

配置变化会通过 IDE 的设置变更事件即时下发给已打开的 Markdown 预览；若当前预览未刷新，关闭并重新打开该 Markdown 标签页即可。

## 4. 安装 VSIX

本包不应手动解压或复制到 `~/.vscode/extensions`、`~/.cursor/extensions` 或 `~/.antigravity/extensions`。请由对应 IDE 执行 **Install from VSIX**，让 IDE 自动写入自己的扩展目录。

### VS Code

1. 打开扩展页，点击右上角 `...`。
2. 选择 `Install from VSIX...`。
3. 选择 `release/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix`。
4. 重载窗口：`Cmd + Shift + P` → `Developer: Reload Window`。

若已安装 `code` 命令，也可在任意终端运行：

```zsh
code --install-extension "/完整路径/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix" --force
```

### Cursor

1. 打开扩展页，点击右上角 `...`。
2. 选择 `Install from VSIX...`。
3. 选择同一份 VSIX。
4. 执行 `Developer: Reload Window`。

若 Cursor 已安装 `cursor` 命令：

```zsh
cursor --install-extension "/完整路径/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix" --force
```

### Antigravity

在 Antigravity 中同样执行 `Extensions: Install from VSIX...`，选择同一份 VSIX 后重载窗口。若它提供 `antigravity` 命令行，命令形式为：

```zsh
antigravity --install-extension "/完整路径/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix" --force
```

IDE 会自行决定实际安装位置，例如 VS Code 通常为 `~/.vscode/extensions`、Cursor 通常为 `~/.cursor/extensions`。不要用“解压目录复制”替代 VSIX 安装，因为会遗漏扩展注册与版本管理。

### 安装后必须做的两件事

1. 在扩展详情页关闭该扩展的 **Auto Update / 自动更新**。否则扩展商店的后续官方版本可能覆盖本地补丁。
2. 用下面最小文档验收：

```md
# 验收

普通文字，<mark>橙色重点</mark>，普通文字。
```

预期：编辑视图可正常编辑和保存；预览为橙底重点文字，正文颜色和字重保持当前主题；不需要任何文档内 `<style>`。

## 5. 配置范围与协作建议

- **全局配置**：写在 `Preferences: Open User Settings (JSON)`；适合你自己的全部文档。
- **项目覆盖**：如某个仓库确实需要不同视觉风格，可在该仓库的 `.vscode/settings.json` 写同一配置键；它只影响该项目，不会写入 Markdown 正文。
- **文档语法**：协作文档推荐 `<mark>重点</mark>`。它是明确的 HTML 高亮语义；没有人会把 `==重点==` 误读为业务符号或特殊公式。
- **其他预览器**：本补丁仅作用于本扩展的 Markdown 预览。Markdown Preview Enhanced、GitHub、飞书等工具各自有独立样式机制；`<mark>` 本身仍可被它们正常识别。

## 6. 补丁结构：后续如何新增全局配置

全局外观配置的唯一链路为：

```text
package.json contributes.configuration
  → MDEditorProvider.getMarkdownSettings()
  → webview 的 appearance 对象
  → applyMarkdownAppearance()
  → resources/md/mdWebview.css 的 CSS 变量
```

新增一个全局 Markdown 外观项时，按下列最小步骤处理：

1. 在 `package.json` 增加 `xlsxViewer.md.*` 配置键、默认值和说明。
2. 在 `src/mdEditorProvider.ts` 的 `getMarkdownSettings()` 中读取该键，并放入 `appearance`。
3. 在 `src/webviews/md/mdWebview.ts` 的 `MarkdownAppearanceSettings` 与 `applyMarkdownAppearance()` 中增加一个 CSS 变量。
4. 在 `resources/md/mdWebview.css` 使用该变量。
5. 运行 `npm run compile`，再重新打包 VSIX。

这个结构刻意不提供任意 `customCss` 文本注入入口：固定且可见的配置键更稳定，也避免一条错误 CSS 影响整个预览页。需要新能力时按上述四步增加明确的设置项即可。

## 7. 构建与重新打包

在此项目根目录执行：

```zsh
cd "/Users/lizhihang/Documents/Codex/2026-07-28/xian/xlsx-viewer-local-patch"
npm ci --cache /private/tmp/xlsx-viewer-local-patch-npm-cache --no-audit --no-fund
npm run compile
npm run verify:local-patch
npx --yes @vscode/vsce package --out "release/muhammad-ahmad.xlsx-viewer-1.9.98-local.1.vsix"
```

构建后请重新执行第 4 节的安装和最小验收。`release/` 中的 VSIX 是可分发、可备份的安装包；`node_modules/` 和 `dist/` 都是可再生成构建产物，不需要纳入个人 Git 仓库。

## 8. 后续升级与维护成本

| 事项 | 是否改 Markdown 正文 | 预计成本 | 风险 |
| --- | --- | --- | --- |
| 更换橙色、字号、背景、行高 | 否，只改用户设置 | 1–3 分钟 | 低 |
| 增加一个明确的外观配置项 | 否，改补丁源码后重打包 | 20–40 分钟 | 低 |
| 上游小版本升级，Markdown 文件未大改 | 否，迁移补丁、构建、手工验收 | 30–90 分钟 | 中 |
| 上游重构 Markdown provider 或 webview | 否，但需重新定位四个补丁点 | 2–4 小时 | 中高 |

升级原则：先保留当前已验证的 VSIX 和 Git 标签；把上游新版本拉到独立分支后再迁移补丁；编译通过并完成 Markdown/XLSX/CSV/TSV 四类手工验收后，才安装到常用 IDE。不要直接在已验证版本上原地覆盖。

## 9. 回退

如需回到官方版：

1. 在对应 IDE 的扩展页卸载本扩展，或直接从扩展商店重新安装官方 `XLSX, CSV, TSV & Markdown Editor`。
2. 重载窗口。
3. 如要继续使用本地补丁，重新从 VSIX 安装，并再次关闭自动更新。

Markdown 源文件只含 `<mark>` 标签，不依赖本补丁才能保持文本内容；回退不会造成文档丢失。

## 10. 本次验证边界

已完成：

- 上游 `v1.9.97` 源码基线核对。
- TypeScript 类型检查通过。
- ESLint 通过，无 error；存在 5 条原项目未修改文件的历史 warning。
- 生产 esbuild 构建通过。

仍需在安装 VSIX 后人工验收：

- `<mark>` 在 VS Code、Cursor、Antigravity 的实际预览颜色是否为橙色。
- Markdown 保存、重新打开与设置即时刷新。
- XLSX、CSV、TSV 分别打开、编辑、保存一次。

这四项是 IDE 实际运行环境验收，不能由 TypeScript 编译代替。
