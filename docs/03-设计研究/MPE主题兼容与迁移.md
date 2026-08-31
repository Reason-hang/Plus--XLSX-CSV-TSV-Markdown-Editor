# MPE 主题兼容与迁移

> 状态：已实现，迁移结果需人工审阅
> 更新时间：2026-08-31
> 文档类型：设计研究短文档

## 目录

- [基本判断](#基本判断)
- [推荐结构](#推荐结构)
- [选择器迁移](#选择器迁移)
- [迁移步骤](#迁移步骤)
- [冲突边界](#冲突边界)

## 基本判断

MPE 和 XLSX 插件的 Markdown 预览运行在不同 Webview，因此两套 CSS 不会直接互相污染。但两者的 DOM 结构、Less 编译时机和刷新机制不完全相同，直接让两个插件各自编译同一份 style.less，后期容易出现结果不一致和问题难定位。

推荐只维护一份 theme.less，只编译一次 markdown-theme.css，再由两个插件分别加载这份最终 CSS。

## 推荐结构

~~~text
themes/markdown-theme/theme.less
  -> npm run theme:build
  -> themes/markdown-theme/dist/markdown-theme.css
  -> XLSX 插件外置 CSS
  -> MPE style.less 的 @import (inline) 适配层
~~~

MPE 适配层位于 themes/markdown-theme/adapters/mpe-adapter.less。复制其中的 @import (inline) 示例到 MPE 的 Global style.less，并把占位路径改成本机主题 CSS 的绝对路径。MPE 此后只负责读取生成的 CSS，不再直接编译主题源。

## 选择器迁移

| MPE 规则 | 迁移处理 |
| --- | --- |
| .markdown-preview.markdown-preview | 可简化为 .markdown-preview |
| .md-sidebar-toc | XLSX 插件目录同时提供该 class，可直接复用 |
| html、body | 必须人工改为 .markdown-preview 或目录容器，不能放入共享主题 |
| table、th、td、code、pre、blockquote | 放入 .markdown-preview 作用域 |
| 远程资源、data:、javascript: | 不迁移 |
| @import | 确认依赖在主题目录内后，合并到 Less partial；最终 CSS 不保留 @import |

XLSX 插件的预览根节点为 .markdown-preview，目录同时有 .toc-panel 和 .md-sidebar-toc。因此大多数正文规则可以复用，差异主要集中在根节点、目录和插件工具栏。

## 迁移步骤

在仓库根目录执行：

~~~zsh
npm run theme:audit -- "/你的/MPE/style.less"
~~~

审计结果写入：

- themes/markdown-theme/dist/compatibility-report.md
- themes/markdown-theme/dist/migration-draft.less

迁移草稿只用于人工审阅，不会被自动加载。人工处理完成后，把确认过的规则放入 theme.less 或对应 partial，再运行：

~~~zsh
npm run theme:build
npm run verify:theme-system
~~~

## 冲突边界

固定设置、共享 CSS 和 MPE 自身样式可能同时命中同一元素。建议把颜色、排版、表格和目录统一放入共享主题；MPE 的 style.less 只保留导入。XLSX 插件会在 Markdown 渲染阶段移除正文中的 style 标签，旧文档如依赖它应迁移到外置主题。

如果 XLSX 插件预览异常，先执行“显示外置 Markdown 主题状态”，确认 CSS 是否加载、路径是否正确、manifest 是否匹配，再判断是否是选择器不兼容。不要通过改写 Markdown 正文来排查主题加载问题。
