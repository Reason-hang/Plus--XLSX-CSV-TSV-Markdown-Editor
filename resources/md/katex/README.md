# 内置 KaTeX 样式与字体

本目录保存与锁文件中 `katex` 版本 `0.16.45` 对应的 `katex.min.css` 和字体文件。Markdown Webview 使用 `webview.asWebviewUri` 加载这些本地资源，不依赖 KaTeX CDN。

升级 KaTeX 时应同时核对 JavaScript 依赖、CSS 和字体，并检查最终 VSIX 中的资源与离线渲染；源码中存在文件不代表安装包或真实 IDE 已验收。
