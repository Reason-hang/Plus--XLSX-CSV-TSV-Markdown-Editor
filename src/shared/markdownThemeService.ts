import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const MAX_THEME_CSS_BYTES = 2 * 1024 * 1024;

export type MarkdownThemeStatus = 'disabled' | 'loaded' | 'fallback' | 'error';

export interface MarkdownThemePayload {
    css: string;
    status: MarkdownThemeStatus;
    sourcePath: string;
    sha256: string;
    message: string;
}

type SuccessfulTheme = Omit<MarkdownThemePayload, 'status' | 'message'>;

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function createHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function validateThemeCss(css: string): void {
    if (!css.trim()) {
        throw new Error('主题 CSS 文件为空。');
    }
    if (/\@import\b/i.test(css)) {
        throw new Error('主题 CSS 不允许包含 @import；请先由主题构建器编译为单一 CSS 文件。');
    }
    if (/url\s*\(\s*["']?\s*(?:https?:|\/\/|data:|javascript:)/i.test(css)) {
        throw new Error('主题 CSS 不允许加载远程、data 或 javascript 资源。');
    }
    if (/url\s*\(\s*var\s*\(/i.test(css)) {
        throw new Error('主题 CSS 的 url() 不允许使用 var() 间接引用资源。');
    }
    if (/(^|,)\s*(?:html|body)\b/im.test(css)) {
        throw new Error('主题 CSS 不能使用 html 或 body 全局选择器；请限定在 .markdown-preview、.toc-panel 或 .md-sidebar-toc。');
    }
}

export class MarkdownThemeService implements vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<MarkdownThemePayload>();
    private readonly watchers: vscode.Disposable[] = [];
    private reloadTimer: NodeJS.Timeout | undefined;
    private lastSuccessfulTheme: SuccessfulTheme | undefined;
    private payload: MarkdownThemePayload = {
        css: '',
        status: 'disabled',
        sourcePath: '',
        sha256: '',
        message: '未启用外置 Markdown 主题。'
    };

    readonly onDidChange = this.onDidChangeEmitter.event;

    getPayload(): MarkdownThemePayload {
        return { ...this.payload };
    }

    getConfiguredCssFile(): string {
        const configured = vscode.workspace.getConfiguration('xlsxViewer').get<string>('md.theme.cssFile', '');
        return configured.trim();
    }

    async loadFromConfiguration(keepLastOnError = false): Promise<MarkdownThemePayload> {
        const cfg = vscode.workspace.getConfiguration('xlsxViewer');
        const enabled = cfg.get<boolean>('md.theme.enabled', false);
        const cssFile = this.getConfiguredCssFile();
        const configuredManifest = cfg.get<string>('md.theme.manifestFile', '').trim();
        const watchEnabled = cfg.get<boolean>('md.theme.watch', true);
        const manifestFile = configuredManifest || (cssFile ? path.join(path.dirname(cssFile), 'theme-manifest.json') : '');

        this.resetWatchers(enabled && watchEnabled ? [cssFile, manifestFile] : []);

        if (!enabled) {
            return this.setPayload({
                css: '',
                status: 'disabled',
                sourcePath: '',
                sha256: '',
                message: '未启用外置 Markdown 主题。'
            });
        }

        if (!cssFile) {
            return this.setPayload({
                css: '',
                status: 'error',
                sourcePath: '',
                sha256: '',
                message: '已启用外置 Markdown 主题，但尚未配置 xlsxViewer.md.theme.cssFile。'
            });
        }

        if (!path.isAbsolute(cssFile)) {
            return this.setPayload({
                css: '',
                status: 'error',
                sourcePath: cssFile,
                sha256: '',
                message: '主题 CSS 路径必须是绝对路径。'
            });
        }

        try {
            const stat = await fs.promises.stat(cssFile);
            if (!stat.isFile()) {
                throw new Error('配置的路径不是文件。');
            }
            if (stat.size > MAX_THEME_CSS_BYTES) {
                throw new Error(`主题 CSS 超过 ${MAX_THEME_CSS_BYTES / 1024 / 1024} MiB 限制。`);
            }

            const css = await fs.promises.readFile(cssFile, 'utf8');
            validateThemeCss(css);
            const sha256 = createHash(css);
            const manifestMessage = await this.getManifestMessage(manifestFile, sha256);
            const theme: MarkdownThemePayload = {
                css,
                status: 'loaded',
                sourcePath: cssFile,
                sha256,
                message: manifestMessage || '外置 Markdown 主题已加载。'
            };
            this.lastSuccessfulTheme = {
                css: theme.css,
                sourcePath: theme.sourcePath,
                sha256: theme.sha256
            };
            return this.setPayload(theme);
        } catch (error) {
            const message = `外置 Markdown 主题加载失败：${toMessage(error)}`;
            if (keepLastOnError && this.lastSuccessfulTheme?.sourcePath === cssFile) {
                return this.setPayload({
                    ...this.lastSuccessfulTheme,
                    status: 'fallback',
                    message: `${message}；已继续使用上一次成功加载的主题。`
                });
            }
            return this.setPayload({
                css: '',
                status: 'error',
                sourcePath: cssFile,
                sha256: '',
                message
            });
        }
    }

    async reload(): Promise<MarkdownThemePayload> {
        return this.loadFromConfiguration(true);
    }

    dispose(): void {
        this.clearWatchers();
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = undefined;
        }
        this.onDidChangeEmitter.dispose();
    }

    private async getManifestMessage(manifestFile: string, cssHash: string): Promise<string> {
        if (!manifestFile || !path.isAbsolute(manifestFile)) {
            return '';
        }
        try {
            const content = await fs.promises.readFile(manifestFile, 'utf8');
            const manifest = JSON.parse(content) as { sha256?: unknown };
            if (typeof manifest.sha256 === 'string' && manifest.sha256 !== cssHash) {
                return '主题 CSS 已加载，但 theme-manifest.json 的 SHA-256 与实际文件不一致；建议重新运行主题构建命令。';
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                return `主题 CSS 已加载，但未能读取 manifest：${toMessage(error)}`;
            }
        }
        return '';
    }

    private resetWatchers(files: string[]): void {
        this.clearWatchers();
        for (const file of new Set(files.filter(file => file && path.isAbsolute(file)))) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file))
            );
            const scheduleReload = () => this.scheduleReload();
            this.watchers.push(
                watcher,
                watcher.onDidChange(scheduleReload),
                watcher.onDidCreate(scheduleReload),
                watcher.onDidDelete(scheduleReload)
            );
        }
    }

    private clearWatchers(): void {
        for (const watcher of this.watchers.splice(0)) {
            watcher.dispose();
        }
    }

    private scheduleReload(): void {
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
        }
        this.reloadTimer = setTimeout(() => {
            this.reloadTimer = undefined;
            void this.reload();
        }, 150);
    }

    private setPayload(nextPayload: MarkdownThemePayload): MarkdownThemePayload {
        const previous = JSON.stringify(this.payload);
        this.payload = nextPayload;
        if (JSON.stringify(nextPayload) !== previous) {
            this.onDidChangeEmitter.fire(this.getPayload());
        }
        return this.getPayload();
    }
}
