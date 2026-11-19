import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import less from 'less';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const themeRoot = path.resolve(scriptDirectory, '..');
const entryFile = path.join(themeRoot, 'theme.less');
const distDirectory = path.join(themeRoot, 'dist');
const cssFile = path.join(distDirectory, 'markdown-theme.css');
const manifestFile = path.join(distDirectory, 'theme-manifest.json');

function isWithinThemeRoot(file) {
  const relative = path.relative(themeRoot, path.resolve(file));
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function validateCompiledCss(css) {
  if (!css.trim()) {
    throw new Error('编译结果为空。');
  }
  if (/\@import\b/i.test(css)) {
    throw new Error('编译结果仍含 @import；主题必须产出单一 CSS 文件。');
  }
  if (/url\s*\(\s*["']?\s*(?:https?:|\/\/|data:|javascript:)/i.test(css)) {
    throw new Error('主题不允许加载远程、data 或 javascript 资源。');
  }
  if (/(^|,)\s*(?:html|body)\b/im.test(css)) {
    throw new Error('主题不允许使用 html 或 body 全局选择器；请限定在预览区域。');
  }
}

async function writeAtomically(target, content) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, target);
}

function formatLessError(error) {
  if (error && typeof error === 'object') {
    const filename = typeof error.filename === 'string' ? error.filename : '';
    const line = typeof error.line === 'number' ? `:${error.line}` : '';
    const message = typeof error.message === 'string' ? error.message : String(error);
    return `${filename}${line} ${message}`.trim();
  }
  return String(error);
}

export async function buildTheme() {
  await mkdir(distDirectory, { recursive: true });
  const source = await readFile(entryFile, 'utf8');
  let rendered;
  try {
    rendered = await less.render(source, {
      filename: entryFile,
      paths: [themeRoot, path.join(themeRoot, 'partials')]
    });
  } catch (error) {
    throw new Error(`Less 编译失败：${formatLessError(error)}`);
  }

  const dependencies = [...new Set([entryFile, ...rendered.imports].map(file => path.resolve(file)))];
  for (const dependency of dependencies) {
    if (!isWithinThemeRoot(dependency)) {
      throw new Error(`拒绝加载主题目录外的依赖：${dependency}`);
    }
  }
  validateCompiledCss(rendered.css);

  const sha256 = createHash('sha256').update(rendered.css, 'utf8').digest('hex');
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: path.relative(themeRoot, entryFile),
    cssFile: path.relative(themeRoot, cssFile),
    sha256,
    dependencies: dependencies.map(file => path.relative(themeRoot, file)).sort()
  };

  await writeAtomically(cssFile, rendered.css);
  await writeAtomically(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`主题构建成功：${cssFile}`);
  console.log(`SHA-256：${sha256}`);
  return { dependencies, sha256, cssFile, manifestFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildTheme().catch(error => {
    console.error(`主题构建失败：${formatLessError(error)}`);
    process.exitCode = 1;
  });
}
