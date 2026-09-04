import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'docs/00-文档总索引.md',
  'docs/01-产品文档/项目定位与范围.md',
  'docs/02-架构文档/统一Markdown主题架构.md',
  'docs/03-设计研究/MPE主题兼容与迁移.md',
  'docs/04-开发文档/当前项目状态与构建.md',
  'docs/05-测试与验收/测试与验收清单.md',
  'docs/05-测试与验收/代码审计报告-2026-08-31.md',
  'docs/06-运维与部署/安装与回退说明.md',
  'docs/07-版本与发布/版本记录表.md',
  'docs/07-版本与发布/版本记录表模板.md',
  'docs/AI自主决策记录文档.md'
];
const ignoredDirectories = new Set(['.git', 'node_modules', 'out']);
const markdownFiles = [];
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      markdownFiles.push(file);
    }
  }
}

function isExternalTarget(target) {
  return /^(?:https?:|mailto:|data:|javascript:)/i.test(target) || target.startsWith('#');
}

for (const relativeFile of requiredFiles) {
  if (!existsSync(path.join(repositoryRoot, relativeFile))) {
    failures.push('缺少必需文档：' + relativeFile);
  }
}

walk(repositoryRoot);

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  const relativeFile = path.relative(repositoryRoot, file);
  if (source.includes('/Users/lizhihang/Documents/Codex')) {
    failures.push('文档包含本机绝对路径：' + relativeFile);
  }
  if (source.includes('1.9.98-local.1')) {
    failures.push('文档残留旧补丁版本：' + relativeFile);
  }

  const linkPattern = /!?\[[^\]]*\]\(([^)\n]+)\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const rawTarget = match[1].trim();
    if (!rawTarget || isExternalTarget(rawTarget)) {
      continue;
    }
    const targetWithoutTitle = rawTarget.replace(/\s+["'][^"']*["']\s*$/, '');
    const targetPath = targetWithoutTitle.split('#', 1)[0].trim();
    if (!targetPath) {
      continue;
    }
    if (path.isAbsolute(targetPath)) {
      failures.push('文档内部链接不能使用绝对路径：' + relativeFile + ' -> ' + targetPath);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), targetPath);
    if (!existsSync(resolved)) {
      failures.push('文档链接不存在：' + relativeFile + ' -> ' + targetPath);
    }
  }
}

const indexSource = readFileSync(path.join(repositoryRoot, 'docs/00-文档总索引.md'), 'utf8');
for (const relativeFile of requiredFiles.slice(1)) {
  const normalized = relativeFile.replaceAll(path.sep, '/');
  if (!indexSource.includes(normalized) && !indexSource.includes(path.basename(normalized))) {
    failures.push('总索引未登记文档：' + relativeFile);
  }
}

const versionRecordSource = readFileSync(
  path.join(repositoryRoot, 'docs/07-版本与发布/版本记录表.md'),
  'utf8'
);
for (const field of ['本次最重要变化', '受影响功能', '数据与文件影响', '提交 SHA']) {
  if (!versionRecordSource.includes(field)) {
    failures.push('版本记录表缺少必填字段：' + field);
  }
}

if (failures.length) {
  console.error('文档规范验证：FAIL');
  for (const failure of failures) {
    console.error('- ' + failure);
  }
  process.exitCode = 1;
} else {
  console.log('文档规范验证：PASS（扫描 ' + markdownFiles.length + ' 个 Markdown 文件）');
}
