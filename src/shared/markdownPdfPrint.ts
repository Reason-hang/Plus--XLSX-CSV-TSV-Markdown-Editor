import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import MarkdownIt from 'markdown-it';

const maxSourceBytes = 4 * 1024 * 1024;
const maxHtmlBytes = 20 * 1024 * 1024;
const maxImageBytes = 4 * 1024 * 1024;
const maxEmbeddedBytes = 8 * 1024 * 1024;
const maxImageSources = 128;
const maxPdfBytes = 64 * 1024 * 1024;
const runFile = promisify(execFile);

const rasterTypes: Record<string, string> = {
    '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif',
    '.webp': 'webp', '.avif': 'avif', '.bmp': 'bmp'
};

function hasRasterSignature(bytes: Buffer, type: string): boolean {
    switch (type) {
        case 'png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        case 'jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        case 'gif': return /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6));
        case 'webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        case 'avif': return bytes.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(bytes.toString('ascii', 8, 12));
        case 'bmp': return bytes.toString('ascii', 0, 2) === 'BM';
        default: return false;
    }
}

async function toRasterDataUri(filePath: string, byteLimit: number): Promise<{ uri: string; bytes: number } | null> {
    const mimeSubtype = rasterTypes[path.extname(filePath).toLowerCase()];
    if (!mimeSubtype) {
        return null;
    }
    const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size === 0 || stat.size > byteLimit) {
            return null;
        }
        const bytes = Buffer.alloc(stat.size);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== bytes.length || !hasRasterSignature(bytes, mimeSubtype)) {
            return null;
        }
        return { uri: 'data:image/' + mimeSubtype + ';base64,' + bytes.toString('base64'), bytes: bytesRead };
    } finally {
        await file.close();
    }
}

export async function buildMarkdownPrintHtml(
    source: string,
    title: string,
    resolveRasterPath?: (src: string) => Promise<string | undefined>
): Promise<{ html: string; notices: string[] }> {
    if (Buffer.byteLength(source) > maxSourceBytes) {
        throw new Error('Markdown 超过 4 MiB，无法一次性导出。');
    }

    const md = new MarkdownIt({ html: true, linkify: false });
    const escape = md.utils.escapeHtml;
    // Recognize authored HTML for reporting, but render every raw HTML token as text.
    md.renderer.rules.html_inline = (tokens, index) => escape(tokens[index].content);
    md.renderer.rules.html_block = (tokens, index) => '<pre>' + escape(tokens[index].content) + '</pre>\n';
    const tokens = md.parse(source.replace(/^\uFEFF/, ''), {});
    const walk = [...tokens];
    const images = new Map<string, string | null>();
    let embeddedBytes = 0;
    let hasLiteralHtml = false;
    let hasMermaid = false;
    for (const token of walk) {
        for (const child of token.children ?? []) {
            walk.push(child);
        }
        if (token.type === 'html_block' || token.type === 'html_inline') {
            hasLiteralHtml = true;
        }
        if (token.type === 'fence' && /^mermaid(?:\s|$)/i.test(token.info.trim())) {
            hasMermaid = true;
        }
        if (token.type !== 'image') {
            continue;
        }
        const src = token.attrGet('src') || '';
        if (images.has(src)) {
            continue;
        }
        images.set(src, null);
        if (!resolveRasterPath || images.size > maxImageSources || embeddedBytes >= maxEmbeddedBytes) {
            continue;
        }
        try {
            const rasterPath = await resolveRasterPath(src);
            const asset = rasterPath && await toRasterDataUri(rasterPath, Math.min(maxImageBytes, maxEmbeddedBytes - embeddedBytes));
            if (asset) {
                images.set(src, asset.uri);
                embeddedBytes += asset.bytes;
            }
        } catch {
            // An unreadable or unavailable image is represented by an explicit placeholder.
        }
    }
    let unavailableImages = 0;
    md.renderer.rules.image = (parts, index, options, env, renderer) => {
        const token = parts[index];
        const src = token.attrGet('src') || '';
        const alt = renderer.renderInlineAsText(token.children ?? [], options, env);
        const included = images.get(src);
        if (!included) {
            unavailableImages++;
            return '<span class="unavailable-image">[图片未嵌入：' + escape(alt || src || '未命名图片') + ']</span>';
        }
        return '<img src="' + included + '" alt="' + escape(alt) + '">';
    };

    const body = md.renderer.render(tokens, md.options, {});
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(title)}</title>
<style>
@page { size: A4; margin: 16mm; }
body { color: #17212b; background: white; font: 11pt/1.6 system-ui, "PingFang SC", "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif; overflow-wrap: anywhere; }
h1, h2, h3 { line-height: 1.25; break-after: avoid-page; }
pre, code { font-family: ui-monospace, "PingFang SC", "Noto Sans Mono CJK SC", "Apple Color Emoji", monospace; }
pre { background: #f2f5f7; border: 1px solid #cbd5df; padding: 0.5em; white-space: pre-wrap; overflow-wrap: anywhere; }
img { max-width: 100%; max-height: 235mm; object-fit: contain; }
table { border-collapse: collapse; width: 100%; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 1px solid #cbd5df; padding: 0.35em 0.55em; vertical-align: top; }
.unavailable-image { color: #536272; }
</style></head><body>${body}</body></html>`;
    if (Buffer.byteLength(html) > maxHtmlBytes) {
        throw new Error('可打印 HTML 超过 20 MiB，请分段导出。');
    }

    const notices: string[] = [];
    if (hasLiteralHtml) {
        notices.push('手写 HTML 已按源文本呈现');
    }
    if (hasMermaid) {
        notices.push('Mermaid 图已按源码呈现');
    }
    if (/^\s*\$\$|\$[^\s$\n](?:[^$\n]*[^\s$\n])?\$/m.test(source)) {
        notices.push('LaTeX 公式已按源码呈现');
    }
    if (unavailableImages) {
        notices.push('有 ' + unavailableImages + ' 张图片未嵌入，已保留占位说明');
    }
    return { html, notices };
}

export async function saveMarkdownPrint(filePath: string, bytes: Buffer): Promise<void> {
    // Rename over the requested output entry without following existing links to another file.
    const workdir = await fs.mkdtemp(path.join(path.dirname(filePath), '.xlsx-viewer-print-'));
    try {
        const temp = path.join(workdir, 'export');
        await fs.writeFile(temp, bytes, { mode: 0o600 });
        await fs.rename(temp, filePath);
    } finally {
        await fs.rm(workdir, { recursive: true, force: true });
    }
}

export async function generateMarkdownPdf(html: string): Promise<Buffer> {
    if (process.platform !== 'darwin') {
        throw new Error('直接生成 PDF 支持 macOS 上的 Ego Lite。');
    }
    const ego = path.join(homedir(), '.local', 'bin', 'ego-browser');
    try {
        await fs.access(ego, constants.X_OK);
    } catch {
        throw new Error('未找到标准安装位置中的 Ego 命令行工具。');
    }

    const workdir = await fs.mkdtemp(path.join(tmpdir(), 'xlsx-viewer-pdf-'));
    try {
        const input = path.join(workdir, 'print.html');
        const output = path.join(workdir, 'print.pdf');
        const marker = randomUUID();
        const job = {
            input: pathToFileURL(input).href,
            output,
            marker,
            name: 'XLSX Viewer PDF ' + marker,
            maxBytes: maxPdfBytes
        };
        await fs.writeFile(input, html.replace('<head>', '<head><meta name="xlsx-viewer-print" content="' + marker + '">'), {
            encoding: 'utf8', mode: 0o600
        });
        try {
            await runFile(ego, ['nodejs', '-e', egoPrintScript(job)], {
                shell: false, timeout: 30000, maxBuffer: 512 * 1024
            });
        } catch {
            throw new Error('Ego 未能生成 PDF。请确认 Ego 正在运行，并保持打印任务空间由插件控制。');
        }
        const stat = await fs.lstat(output).catch(() => null);
        if (!stat?.isFile() || stat.size < 1024 || stat.size > maxPdfBytes) {
            throw new Error('Ego 未生成有效大小的 PDF。');
        }
        const bytes = await fs.readFile(output);
        if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
            !/%%EOF\s*$/.test(bytes.subarray(-64).toString('ascii'))) {
            throw new Error('Ego 输出的 PDF 不完整。');
        }
        return bytes;
    } finally {
        await fs.rm(workdir, { recursive: true, force: true });
    }
}

function egoPrintScript(job: { input: string; output: string; marker: string; name: string; maxBytes: number }): string {
    return String.raw`
const job = ${JSON.stringify(job)};
const fs = await import('node:fs/promises');
const task = await taskSpace(job.name);
const initialOwnership = task.ownership;
const agentOwnsTask = async () => {
    const entry = (await listTaskSpaces()).find(space => space.id === task.spaceId && space.name === job.name);
    return Boolean(entry && entry.createdBy === 'agent' && initialOwnership === 'agent' && entry.ownership === 'agent');
};
if (!(await agentOwnsTask())) {
    throw new Error('Ego print task is out of the exporter’s control');
}
const page = task.page('p1');
const start = await page.url();
const isNewTab = start === 'about:blank' || start === 'chrome://newtab/' ||
    /^chrome-extension:\/\/[a-p]{32}\/newtab\/index\.html$/.test(start);
if (page.openedBy !== 'agent' || !isNewTab) {
    throw new Error('The print task did not start with a blank page');
}
await page.goto(job.input, { timeout: 10000 });
if (await page.url() !== job.input) {
    throw new Error('Ego did not open the expected print document');
}
await page.waitForFunction(marker =>
    document.readyState === 'complete' && document.fonts.status === 'loaded' &&
    document.querySelector('meta[name="xlsx-viewer-print"]')?.content === marker,
    job.marker, { timeout: 5000 });
if (!(await agentOwnsTask()) || await page.url() !== job.input) {
    throw new Error('Ego print task changed before printing');
}
const result = await page.cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
const data = result.data;
if (typeof data !== 'string' || data.length > Math.ceil(job.maxBytes / 3) * 4) {
    throw new Error('Ego returned no PDF or exceeded the size limit');
}
const bytes = Buffer.from(data, 'base64');
if (bytes.length < 1024 || bytes.length > job.maxBytes ||
    bytes.subarray(0, 5).toString('ascii') !== '%PDF-' ||
    !/%%EOF\s*$/.test(bytes.subarray(-64).toString('ascii'))) {
    throw new Error('Ego returned an invalid PDF');
}
if (!(await agentOwnsTask()) || await page.url() !== job.input) {
    throw new Error('Ego print task changed before export');
}
await fs.writeFile(job.output, bytes, { flag: 'wx', mode: 0o600 });
await task.finish({ keep: [] });
`;
}
