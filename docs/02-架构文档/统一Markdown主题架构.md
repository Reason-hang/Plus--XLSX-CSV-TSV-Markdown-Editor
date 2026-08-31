# 统一 Markdown 主题架构

> 状态：已实现
> 更新时间：2026-08-31
> 文档类型：架构长文档

## 目录

- [架构目标](#架构目标)
- [构建链路](#构建链路)
- [运行时加载](#运行时加载)
- [兼容与安全边界](#兼容与安全边界)
- [扩展入口](#扩展入口)
- [升级约束](#升级约束)

## 架构目标

统一主题系统解决两个问题：

1. Markdown 正文只保留语义标签，例如 mark 标签，不在每份文档里重复写 style 标签。
2. XLSX 插件和 Markdown Preview Enhanced（MPE）不分别编译同一份 Less，避免编译器、依赖路径和刷新机制差异造成主题漂移。

最终关系是：

~~~text
theme.less + partials/*.less
          |
          | 单次 Less 编译
          v
dist/markdown-theme.css + theme-manifest.json
          |                         |
          v                         v
XLSX 插件 Markdown Webview       MPE Global style.less 适配层
~~~

## 构建链路

主题源码位于 themes/markdown-theme/：

| 路径 | 职责 |
| --- | --- |
| theme.less | 唯一人工维护入口，负责组织 partial |
| partials/tokens.less | 颜色、字体等变量 |
| partials/typography.less | 预览正文、标题、段落和链接 |
| partials/content.less | 引用、分割线、表格、代码和 mark |
| partials/toc.less | XLSX 与 MPE 目录选择器 |
| scripts/build-theme.mjs | 编译 Less、校验 CSS、写入 manifest |
| scripts/watch-theme.mjs | 监听入口及 @import 依赖并重新构建 |
| scripts/audit-compatibility.mjs | 审计旧 MPE 样式并生成迁移报告 |
| dist/markdown-theme.css | 两个预览器共同消费的最终 CSS |
| dist/theme-manifest.json | 记录源码、依赖和 CSS SHA-256 |

构建器会拒绝空 CSS、残留 @import、远程/data/javascript 资源和 html、body 全局选择器。CSS 写入采用临时文件再替换，避免预览读到半份文件。

## 运行时加载

XLSX 插件由扩展宿主读取配置，校验外置 CSS 后把内容作为独立的 style id xlsx-viewer-external-markdown-theme 注入 Markdown Webview。外置主题在内置样式之后加载，因此同一选择器通常由外置主题覆盖。

当前配置入口：

| 配置 | 默认值 | 作用 |
| --- | --- | --- |
| xlsxViewer.md.theme.enabled | false | 是否启用外置主题 |
| xlsxViewer.md.theme.cssFile | 空 | 已编译 CSS 的绝对路径 |
| xlsxViewer.md.theme.manifestFile | 空 | 可选 manifest 路径；为空时取 CSS 同目录 manifest |
| xlsxViewer.md.theme.watch | true | 监听 CSS 和 manifest 并自动刷新 |

启用监听后，CSS 或 manifest 创建、修改、删除都会触发重新加载。重新加载失败时，如果存在同一路径上一次成功的主题，会继续使用旧主题并报告 fallback 状态；首次加载失败则报告 error，不注入坏 CSS。

主题 CSS 目前限制为本地绝对路径、最大 2 MiB、无 @import、无远程资源、无 html/body 全局选择器。这个边界是为了保护 Webview 和本机数据，不是 Less 能力限制。

## 兼容与安全边界

正文规则统一限定在 .markdown-preview。目录同时提供 .toc-panel 和 .md-sidebar-toc，分别兼容 XLSX 插件和 MPE 常见选择器。

两个插件运行在不同 Webview，CSS 不会直接跨插件串扰。真正需要统一的是主题源和编译结果，而不是让两个插件直接打开同一份 Less。

固定设置和外置 CSS 的优先级如下：

1. 扩展内置样式。
2. xlsxViewer.md.mark* 和 preview* 固定设置。
3. 外置 markdown-theme.css。
4. Markdown 正文内的安全 HTML；`<style>` 标签会在渲染净化阶段移除，主题规则应放在外置 CSS。

外置主题是用户配置文件，加载前会进行路径、大小、资源和全局选择器校验。Markdown 渲染结果还会移除脚本、`<style>`、事件属性和不安全链接；Mermaid 使用 `securityLevel: strict`。manifest 的 SHA-256 不匹配只提示修复建议，不阻断 CSS 本身加载。

## 扩展入口

后续新增主题能力优先按以下顺序处理：

1. 颜色、间距和字体等主题变化放入 partials/tokens.less 或已有 partial。
2. 新的内容选择器放入 partials/content.less，并限定在 .markdown-preview。
3. 目录或预览器差异放入 partials/toc.less 或 MPE 适配层。
4. 需要用户开关、运行时状态或安全校验时，再扩展 MarkdownThemeService 和 package.json 配置。
5. 每次扩展都补充 verify:theme-system 或对应的文档验收项。

不要把新的主题规则直接写进生成的 CSS，也不要把可变化主题内容硬编码进 Webview 逻辑。

## 升级约束

上游升级时必须重新核对：

- Markdown Webview 的 .markdown-preview、目录和表格 DOM class。
- 外置 style 注入顺序以及配置变更事件。
- XLSX、CSV、TSV 的打开、编辑、保存和转换链路。
- MPE 适配层、主题构建器和迁移审计器。

上游小版本升级通常只需要重新构建和回归；如果 Markdown Webview DOM 重构，需要先更新兼容选择器，再重新做三 IDE 人工验收。
