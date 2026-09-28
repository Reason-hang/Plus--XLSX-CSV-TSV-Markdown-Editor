# 统一 Markdown 主题

## 目录

- [常用命令](#常用命令)
- [规则](#规则)
- [MPE](#mpe)

这里是本仓库唯一的主题源。人工只维护 `theme.less` 与 `partials/*.less`；`dist/markdown-theme.css` 由构建器生成，供 XLSX 插件与 MPE 共同加载。

## 常用命令

在仓库根目录：

```zsh
npm --prefix themes/markdown-theme ci --cache /private/tmp/xlsx-viewer-markdown-theme-npm-cache --no-audit --no-fund
npm run theme:build
npm run theme:watch
npm run theme:audit -- "/你的/MPE/style.less"
```

`theme:audit` 会生成 `dist/compatibility-report.md` 与 `dist/migration-draft.less`。草稿不会自动参与构建，必须人工审阅后再合并。

## 规则

- 不要在主题中使用 `html`、`body` 或工具栏选择器；正文一律限定为 `.markdown-preview`。
- 目录同时使用 `.toc-panel, .md-sidebar-toc`，兼容 XLSX 插件与 MPE。
- 不要加入远程 URL、`data:` 或 `javascript:` 资源。
- 不手改 `dist/markdown-theme.css` 和 `dist/theme-manifest.json`；改 Less 后重新构建。

## MPE

MPE 只加载构建后的 CSS。将 `adapters/mpe-adapter.less` 的占位路径替换为本机绝对路径，再复制一行到 MPE 的 Global `style.less`。

完整的安装、外置配置、回退与验收说明见仓库根目录 [README-LOCAL-PATCH.md](../../README-LOCAL-PATCH.md)。
