import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const themeRoot = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(themeRoot, 'dist');
const defaultInput = path.join(themeRoot, 'examples', 'mpe-style.less');
const input = path.resolve(process.argv[2] || defaultInput);
const reportFile = path.join(distDirectory, 'compatibility-report.md');
const draftFile = path.join(distDirectory, 'migration-draft.less');

function displayPath(file) {
  const relative = path.relative(themeRoot, file);
  return relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    ? relative
    : path.basename(file);
}

function findMatches(source, pattern) {
  return [...source.matchAll(pattern)].map(match => match[0].trim());
}

function buildReport(source, sourcePath) {
  const globalSelectors = findMatches(source, /(^|,)\s*(?:html|body)\b/gim);
  const mpeTocSelectors = findMatches(source, /\.md-sidebar-toc\b/g);
  const previewSelectors = findMatches(source, /\.markdown-preview\b/g);
  const externalImports = findMatches(source, /\@import\s+(?:\([^)]*\)\s*)?["'][^"']+["']/g);
  const manualItems = [];
  if (globalSelectors.length) {
    manualItems.push('发现 html/body 全局选择器：迁移时必须改为 .markdown-preview 或目录选择器，避免影响 XLSX 插件工具栏和编辑区。');
  }
  if (externalImports.length) {
    manualItems.push('发现 @import：请确认依赖文件位于主题目录内，再合并进 theme.less。');
  }

  return [
    '# Markdown 主题兼容审计报告',
    '',
    '- 输入文件：' + displayPath(sourcePath),
    '- 审计时间：' + new Date().toISOString(),
    '- 迁移草稿：' + displayPath(draftFile),
    '',
    '## 目录',
    '',
    '- 可直接复用',
    '- 自动兼容',
    '- 需要人工处理',
    '- 扫描结果',
    '',
    '## 可直接复用',
    '',
    '- .markdown-preview：' + (previewSelectors.length ? '已发现，可直接保留。' : '未发现；内容规则应增加此作用域。'),
    '- 标准标签（标题、列表、表格、引用、代码、链接、mark）：可在 .markdown-preview 内直接复用。',
    '',
    '## 自动兼容',
    '',
    '- .md-sidebar-toc：' + (mpeTocSelectors.length ? 'XLSX 补丁版已为目录同时添加该 class，可与 .toc-panel 并列使用。' : '未发现该选择器。'),
    '',
    '## 需要人工处理',
    '',
    manualItems.length ? manualItems.map(item => '- ' + item).join('\n') : '- 未发现必须人工处理的规则。',
    '',
    '## 扫描结果',
    '',
    '| 项目 | 数量 |',
    '| --- | ---: |',
    '| html/body 全局选择器 | ' + globalSelectors.length + ' |',
    '| .md-sidebar-toc | ' + mpeTocSelectors.length + ' |',
    '| .markdown-preview | ' + previewSelectors.length + ' |',
    '| @import | ' + externalImports.length + ' |',
    ''
  ].join('\n');
}

function buildMigrationDraft(source, sourcePath) {
  const withoutGlobalRoot = source.replace(/(^|\n)\s*html\s*,\s*\n?\s*body\s*\{[\s\S]*?\n\s*\}/gim, block => {
    return '\n/* [需人工迁移：禁止全局 html/body]' + block + '\n*/';
  });
  const withoutExternalImports = withoutGlobalRoot.replace(/^\s*\@import[^;]+;\s*$/gim, statement => {
    return '/* [需人工收纳 @import 依赖] ' + statement.trim() + ' */';
  });
  const normalizedPreviewSelectors = withoutExternalImports.replace(/\.markdown-preview\.markdown-preview\b/g, '.markdown-preview');
  return [
    '/*',
    ' * MPE 主题迁移草稿，仅供人工审阅，不会被任何构建命令自动加载。',
    ' * 输入：' + displayPath(sourcePath),
    ' * 已自动处理：.markdown-preview.markdown-preview → .markdown-preview。',
    ' * 已注释：顶部 html/body 和 @import；请按 compatibility-report.md 逐项迁移。',
    ' */',
    '',
    normalizedPreviewSelectors.trim(),
    ''
  ].join('\n');
}

async function writeAtomically(target, content) {
  const temporary = target + '.' + process.pid + '.tmp';
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, target);
}

try {
  const source = await readFile(input, 'utf8');
  await mkdir(distDirectory, { recursive: true });
  const report = buildReport(source, input);
  const draft = buildMigrationDraft(source, input);
  await writeAtomically(reportFile, report);
  await writeAtomically(draftFile, draft);
  console.log('兼容审计完成：' + reportFile);
  console.log('迁移草稿已生成：' + draftFile);
} catch (error) {
  console.error('兼容审计失败：' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
