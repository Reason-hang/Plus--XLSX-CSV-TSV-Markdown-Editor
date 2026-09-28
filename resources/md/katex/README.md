# Bundled KaTeX stylesheet and fonts

This directory contains the `katex.min.css` stylesheet and font files copied
from the installed `katex` package at build time. The current package version
is `0.16.47`.

The Markdown Webview loads this stylesheet through `webview.asWebviewUri`.
It does not use the KaTeX CDN, so formula rendering does not require network
access and the VSIX contains the CSS/font resources it needs.
