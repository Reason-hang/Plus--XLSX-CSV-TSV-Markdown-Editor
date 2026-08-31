# Markdown 主题兼容审计报告

- 输入文件：examples/mpe-style.less
- 审计时间：2026-08-31T04:20:01.495Z
- 迁移草稿：dist/migration-draft.less

## 目录

- 可直接复用
- 自动兼容
- 需要人工处理
- 扫描结果

## 可直接复用

- .markdown-preview：已发现，可直接保留。
- 标准标签（标题、列表、表格、引用、代码、链接、mark）：可在 .markdown-preview 内直接复用。

## 自动兼容

- .md-sidebar-toc：XLSX 补丁版已为目录同时添加该 class，可与 .toc-panel 并列使用。

## 需要人工处理

- 发现 html/body 全局选择器：迁移时必须改为 .markdown-preview 或目录选择器，避免影响 XLSX 插件工具栏和编辑区。

## 扫描结果

| 项目 | 数量 |
| --- | ---: |
| html/body 全局选择器 | 2 |
| .md-sidebar-toc | 1 |
| .markdown-preview | 2 |
| @import | 0 |
