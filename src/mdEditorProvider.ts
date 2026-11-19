import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { validateWebviewMessage } from './shared/webviewMessageSchema';
import { MdToolbarStorage } from './shared/mdToolbarStorage';
import { MarkdownThemeService } from './shared/markdownThemeService';
import { isPathWithin, isPathWithinRealpath } from './shared/pathSafety';
import { isAllowedExternalUri } from './shared/externalUri';
import { writeBufferFileAtomically, writeTextFileAtomically } from './shared/atomicFile';
import { randomBytes } from 'crypto';
import { hashBuffer, hashFile } from './shared/fileFingerprint';
import type { IncomingMessage } from 'http';
import { VERSION_HISTORY_RETENTION_MS, VERSION_HISTORY_MAX_ENTRIES, VERSION_HISTORY_MAX_TOTAL_BYTES, buildGroupedVersionHistoryItems, formatVersionHistoryTimestamp, getVersionHistoryFile, getVersionHistoryDir, isSafeSnapshotFile as isSafeHistorySnapshotFile } from './shared/versionHistory';

const appearanceDefaults: Record<string, string> = {
    markBackgroundColor: '#FF4E00', markTextColor: 'inherit', markFontWeight: 'inherit',
    markPadding: '0 2px', markBorderRadius: '2px', headingColor: '#569CD6',
    previewBackgroundColor: '', previewTextColor: '', previewFontSize: '', previewLineHeight: '',
    editorFontSize: '16px', editorLineHeight: '1.8'
};

function sanitizeAppearanceValue(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128 || /[;{}<>]/.test(trimmed) || /(?:url\s*\(|expression\s*\(|javascript\s*:|@import)/i.test(trimmed)) return fallback;
    return trimmed;
}

export class MDEditorProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
    private readonly toolbarStorage: MdToolbarStorage;
    private readonly panels = new Set<vscode.WebviewPanel>();
    private readonly historyTasks = new Map<string, Promise<void>>();
    private readonly markdownThemeService = new MarkdownThemeService();
    private readonly themeOutput = vscode.window.createOutputChannel('XLSX Viewer Markdown Theme');
    private readonly scrollDiagnosticsOutput = vscode.window.createOutputChannel('XLSX Viewer Markdown Scroll Diagnostics');
    private readonly themeChange: vscode.Disposable;

    private async withHistoryLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.historyTasks.get(key) ?? Promise.resolve();
        const task = previous.catch(() => undefined).then(operation);
        const settled = task.then(() => undefined, () => undefined);
        this.historyTasks.set(key, settled);
        try {
            return await task;
        } finally {
            if (this.historyTasks.get(key) === settled) {
                this.historyTasks.delete(key);
            }
        }
    }

    constructor(private readonly context: vscode.ExtensionContext) {
        this.toolbarStorage = new MdToolbarStorage(context.globalState, () => vscode.workspace.getConfiguration('xlsxViewer').get('md.toolbarLayout', null));
        this.themeChange = this.markdownThemeService.onDidChange(theme => {
            this.themeOutput.appendLine(`[${new Date().toISOString()}] ${theme.status}: ${theme.message}`);
            for (const panel of this.panels) {
                void panel.webview.postMessage({ command: 'setMarkdownTheme', theme });
            }
        });
    }

    dispose(): void {
        this.themeChange.dispose();
        this.markdownThemeService.dispose();
        this.themeOutput.dispose();
        this.scrollDiagnosticsOutput.dispose();
        this.panels.clear();
    }

    async reloadMarkdownTheme(): Promise<void> {
        const theme = await this.markdownThemeService.reload();
        if (theme.status === 'loaded' || theme.status === 'disabled') {
            void vscode.window.showInformationMessage(theme.message);
        } else {
            void vscode.window.showWarningMessage(theme.message);
        }
    }

    showMarkdownThemeStatus(): void {
        const theme = this.markdownThemeService.getPayload();
        this.themeOutput.show(true);
        const message = `Markdown 主题状态：${theme.status}。${theme.message}`;
        if (theme.status === 'loaded' || theme.status === 'disabled') {
            void vscode.window.showInformationMessage(message);
        } else {
            void vscode.window.showWarningMessage(message);
        }
    }

    async revealMarkdownThemeFolder(): Promise<void> {
        const cssFile = this.markdownThemeService.getConfiguredCssFile();
        if (!cssFile || !path.isAbsolute(cssFile)) {
            void vscode.window.showWarningMessage('请先配置绝对路径 xlsxViewer.md.theme.cssFile。');
            return;
        }
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(cssFile)));
    }

    private getAppearanceSettings(): Record<string, string> {
        const cfg = vscode.workspace.getConfiguration('xlsxViewer');
        return Object.fromEntries(Object.entries(appearanceDefaults).map(([key, fallback]) =>
            [key, sanitizeAppearanceValue(cfg.get(`md.${key}`, fallback), fallback)]
        ));
    }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        try {
            await this.markdownThemeService.loadFromConfiguration();
            const filePath = document.uri.fsPath;
            const documentDirUri = vscode.Uri.file(path.dirname(filePath));
            const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [];
            const workspaceFolderUri = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() || null;

            type VersionHistoryEntry = {
                id: string;
                timestamp: number;
                charCount: number;
                byteSize: number;
                hash: string;
                snapshotFile: string;
                content?: string;
            };

            let currentContent = '';
            let previewVersionId: string | null = null;
            let previewVersionTimestamp: number | null = null;
            let previewVersionContent: string | null = null;
            let restoredVersionId: string | null = null;
            let isSaving = false;
            let lastKnownFileHash = '';

            const assertFileUnchanged = async () => {
                if (document.uri.scheme === 'file' && lastKnownFileHash && await hashFile(filePath) !== lastKnownFileHash) {
                    throw new Error('文件已被外部修改，请先处理冲突后再保存。');
                }
            };

            const writeDocument = async (content: string) => {
                await assertFileUnchanged();
                const bytes = Buffer.from(content, 'utf8');
                if (document.uri.scheme === 'file') {
                    await writeBufferFileAtomically(filePath, bytes);
                } else {
                    await vscode.workspace.fs.writeFile(document.uri, bytes);
                }
                lastKnownFileHash = hashBuffer(bytes);
            };

            const getAutoSaveDelaySettings = () => {
                const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                const storedOverride = this.context.globalState.get<number>('autoSaveDelayOverride.md');
                const legacyOverride = cfg.get<number>('autoSaveDelay', 0);
                const override = Math.max(0, Math.min(30000, storedOverride ?? legacyOverride));
                const editorDelay = Math.max(0, vscode.workspace.getConfiguration('files').get<number>('autoSaveDelay', 1000));
                return {
                    autoSaveDelayOverride: override,
                    editorAutoSaveDelay: editorDelay,
                    autoSaveDelay: override > 0 ? override : editorDelay
                };
            };

            const getHistoryDir = () => getVersionHistoryDir(this.context.globalStorageUri.fsPath, filePath, 'md');
            const getHistoryIndexPath = () => path.join(getHistoryDir(), 'index.json');
            const getLegacyHistoryFilePath = () => getVersionHistoryFile(this.context.globalStorageUri.fsPath, filePath, 'md');
            const getSnapshotPath = (snapshotFile: string) => path.join(getHistoryDir(), snapshotFile);
            const isSafeSnapshotFile = (snapshotFile: unknown): snapshotFile is string =>
                isSafeHistorySnapshotFile(snapshotFile, ['md']);

            const ensureHistoryDir = async () => {
                await fs.promises.mkdir(getHistoryDir(), { recursive: true });
            };

            const saveHistory = async (entries: VersionHistoryEntry[]) => {
                await ensureHistoryDir();
                await writeTextFileAtomically(getHistoryIndexPath(), JSON.stringify(entries));
            };

            const migrateLegacyHistory = async (legacyEntries: VersionHistoryEntry[]): Promise<VersionHistoryEntry[]> => {
                const migrated: VersionHistoryEntry[] = [];
                const now = Date.now();
                const recentEntries = legacyEntries.filter(entry => (
                    !!entry &&
                    typeof entry.content === 'string' &&
                    now - entry.timestamp <= VERSION_HISTORY_RETENTION_MS
                ));
                const selected: Array<{ legacy: VersionHistoryEntry; index: number; contentBytes: Buffer }> = [];
                let totalBytes = 0;
                for (let index = recentEntries.length - 1; index >= 0; index--) {
                    const legacy = recentEntries[index];
                    const contentBytes = Buffer.from(legacy.content || '', 'utf8');
                    if (contentBytes.length > VERSION_HISTORY_MAX_TOTAL_BYTES ||
                        selected.length >= VERSION_HISTORY_MAX_ENTRIES ||
                        totalBytes + contentBytes.length > VERSION_HISTORY_MAX_TOTAL_BYTES) {
                        continue;
                    }
                    selected.push({ legacy, index, contentBytes });
                    totalBytes += contentBytes.length;
                }

                await ensureHistoryDir();
                for (const { legacy, index, contentBytes } of selected.reverse()) {
                    const timestamp = Number.isFinite(legacy.timestamp) ? legacy.timestamp : Date.now();
                    const id = `${timestamp}-${index}`;
                    const snapshotFile = `${id}.md`;
                    await writeBufferFileAtomically(getSnapshotPath(snapshotFile), contentBytes);
                    migrated.push({
                        id,
                        timestamp,
                        charCount: legacy.content?.length ?? 0,
                        byteSize: contentBytes.length,
                        hash: hashBuffer(contentBytes),
                        snapshotFile
                    });
                }
                await saveHistory(migrated);
                return migrated;
            };

            const loadHistory = async (): Promise<VersionHistoryEntry[]> => {
                try {
                    const raw = await fs.promises.readFile(getHistoryIndexPath(), 'utf8');
                    const parsed = JSON.parse(raw);
                    if (!Array.isArray(parsed)) {
                        throw new Error('Markdown 版本历史索引格式无效，未覆盖原始数据。');
                    }
                    const valid = parsed.every((entry): entry is VersionHistoryEntry => (
                        !!entry && typeof entry.id === 'string' &&
                        Number.isFinite(entry.timestamp) &&
                        typeof entry.snapshotFile === 'string' &&
                        isSafeSnapshotFile(entry.snapshotFile)
                    ));
                    if (!valid) {
                        throw new Error('Markdown 版本历史索引包含无法识别的记录，未覆盖原始数据。');
                    }
                    return parsed;
                } catch (indexError) {
                    if ((indexError as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw indexError;
                    }
                    try {
                        const raw = await fs.promises.readFile(getLegacyHistoryFilePath(), 'utf8');
                        const parsed = JSON.parse(raw);
                        if (!Array.isArray(parsed)) {
                            throw new Error('旧版 Markdown 版本历史格式无效，未覆盖原始数据。');
                        }
                        const valid = parsed.every((entry): entry is VersionHistoryEntry => (
                            !!entry && typeof entry.id === 'string' &&
                            Number.isFinite(entry.timestamp) &&
                            typeof entry.content === 'string'
                        ));
                        if (!valid) {
                            throw new Error('旧版 Markdown 版本历史包含无法识别的记录，未覆盖原始数据。');
                        }
                        return await migrateLegacyHistory(parsed);
                    } catch (legacyError) {
                        if ((legacyError as NodeJS.ErrnoException).code === 'ENOENT') {
                            return [];
                        }
                        throw legacyError;
                    }
                }
            };

            const removeSnapshot = async (entry: VersionHistoryEntry) => {
                if (!isSafeSnapshotFile(entry.snapshotFile)) {
                    return;
                }
                try {
                    await fs.promises.unlink(getSnapshotPath(entry.snapshotFile));
                } catch {
                    // The snapshot may already have been removed.
                }
            };

            const pruneHistory = async (entries?: VersionHistoryEntry[]) => {
                const now = Date.now();
                const source = entries ?? await loadHistory();
                const byRetention = source.filter(entry => now - entry.timestamp <= VERSION_HISTORY_RETENTION_MS);
                const keptReverse: VersionHistoryEntry[] = [];
                let totalBytes = 0;
                for (let index = byRetention.length - 1; index >= 0; index--) {
                    const entry = byRetention[index];
                    const byteSize = Number.isFinite(entry.byteSize)
                        ? entry.byteSize
                        : typeof entry.content === 'string' ? Buffer.byteLength(entry.content, 'utf8') : 0;
                    if (keptReverse.length >= VERSION_HISTORY_MAX_ENTRIES ||
                        (keptReverse.length > 0 && totalBytes + byteSize > VERSION_HISTORY_MAX_TOTAL_BYTES)) {
                        continue;
                    }
                    keptReverse.push({ ...entry, byteSize });
                    totalBytes += byteSize;
                }
                const kept = keptReverse.reverse();
                const keptIds = new Set(kept.map(entry => entry.id));
                const historyChanged = kept.length !== source.length || kept.some((entry, index) => (
                    entry.id !== source[index]?.id || entry.byteSize !== source[index]?.byteSize
                ));
                if (historyChanged) {
                    // Preserve snapshots until the replacement index is durable.
                    await saveHistory(kept);
                    for (const entry of source) {
                        if (!keptIds.has(entry.id)) {
                            await removeSnapshot(entry);
                        }
                    }
                }
                return kept;
            };

            const readHistoryContent = async (entry: VersionHistoryEntry): Promise<string> => {
                if (isSafeSnapshotFile(entry.snapshotFile)) {
                    return fs.promises.readFile(getSnapshotPath(entry.snapshotFile), 'utf8');
                }
                if (typeof entry.content === 'string') {
                    return entry.content;
                }
                throw new Error('Version snapshot is unavailable');
            };

            const persistVersionSnapshot = async (contentOverride?: string) => {
                const content = typeof contentOverride === 'string'
                    ? contentOverride
                    : await fs.promises.readFile(filePath, 'utf8');
                const contentBytes = Buffer.from(content, 'utf8');
                if (contentBytes.length > VERSION_HISTORY_MAX_TOTAL_BYTES) {
                    console.warn('Skipping Markdown version snapshot larger than the history size limit.');
                    return;
                }
                const contentHash = hashBuffer(contentBytes);
                const history = await pruneHistory();
                const last = history.length ? history[history.length - 1] : null;
                if (last?.hash === contentHash || (!last?.hash && last?.content === content)) {
                    return;
                }

                const now = Date.now();
                const id = `${now}-${randomBytes(4).toString('hex')}`;
                const entry: VersionHistoryEntry = {
                    id,
                    timestamp: now,
                    charCount: content.length,
                    byteSize: contentBytes.length,
                    hash: contentHash,
                    snapshotFile: `${id}.md`
                };
                await ensureHistoryDir();
                await writeBufferFileAtomically(getSnapshotPath(entry.snapshotFile), contentBytes);
                await saveHistory([...history, entry]);
                await pruneHistory([...history, entry]);
            };

            const buildInitMarkdownPayload = (content: string) => ({
                command: 'initMarkdown',
                content,
                fileName: vscode.workspace.asRelativePath(document.uri),
                documentUri: document.uri.toString(),
                documentDirUri: documentDirUri.toString(),
                workspaceFolderUri
            });

            // Keep the initial resource allowlist narrow. Image folders outside the
            // workspace are added only after the image path has passed the resolver's
            // extension and workspace-boundary checks.
            const initialRoots = [
                vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
                vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
                documentDirUri,
                ...workspaceFolders
            ];

            const ensureResourceRoots = (targetUris: vscode.Uri[]) => {
                try {
                    const currentRoots = [...(webviewPanel.webview.options.localResourceRoots || [])];
                    const toAdd: vscode.Uri[] = [];
                    for (const targetUri of targetUris) {
                        const targetDir = vscode.Uri.file(path.dirname(targetUri.fsPath));
                        if (!currentRoots.some(root => isPathWithin(root.fsPath, targetDir.fsPath)) &&
                            !toAdd.some(root => isPathWithin(root.fsPath, targetDir.fsPath))) {
                            toAdd.push(targetDir);
                        }
                    }
                    if (toAdd.length > 0) {
                        webviewPanel.webview.options = {
                            ...webviewPanel.webview.options,
                            localResourceRoots: [...currentRoots, ...toAdd]
                        };
                    }
                } catch (error) {
                    console.error('Failed to update Markdown image resource roots:', error);
                }
            };

            // Set up webview
            webviewPanel.webview.options = {
                enableScripts: true,
                localResourceRoots: initialRoots
            };
            webviewPanel.webview.html = this.getWebviewContent(webviewPanel);
            this.panels.add(webviewPanel);

            // Handle messages from webview
            webviewPanel.webview.onDidReceiveMessage(async message => {
                const validation = validateWebviewMessage(message, 'markdown');
                if (!validation.ok) {
                    void webviewPanel.webview.postMessage({ command: 'webviewError', errorCode: validation.errorCode, message: validation.message });
                    return;
                }
                switch (message.command) {
                    case 'reportScrollDiagnostics': {
                        const scrollTops = message.scrollTops as Record<string, number>;
                        const settings = message.settings as { syncScroll: boolean; stickyToolbar: boolean };
                        this.scrollDiagnosticsOutput.appendLine(
                            `[${new Date().toISOString()}] ${message.phase} epoch=${message.epoch} ` +
                            `editor=${scrollTops.editor} preview=${scrollTops.preview} ` +
                            `content=${scrollTops.content} document=${scrollTops.document} ` +
                            `syncScroll=${settings.syncScroll} stickyToolbar=${settings.stickyToolbar}`
                        );
                        break;
                    }
                    case 'saveMdToolbarLayout':
                        try {
                            const saved = await this.toolbarStorage.save(message.layout, message.revision);
                            for (const panel of this.panels) {
                                void panel.webview.postMessage({ command: 'toolbarLayoutUpdated', ...saved });
                            }
                            void webviewPanel.webview.postMessage({ command: 'toolbarLayoutSaved', requestId: message.requestId, ok: true });
                        } catch (error) {
                            void webviewPanel.webview.postMessage({ command: 'toolbarLayoutSaved', requestId: message.requestId, ok: false, message: String(error) });
                        }
                        break;
                    case 'webviewReady':
                        try {
                            // Read the markdown file
                            const content = await fs.promises.readFile(filePath, 'utf-8');
                            currentContent = content;
                            lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));

                            // Send content to webview
                            webviewPanel.webview.postMessage(buildInitMarkdownPayload(content));
                            try {
                                await this.withHistoryLock(filePath, () => persistVersionSnapshot(content));
                            } catch (historyError) {
                                webviewPanel.webview.postMessage({ command: 'versionHistoryError', message: `版本历史保存失败：${String(historyError)}` });
                            }

                            // Calculate if MD is enabled as default
                            const globalCfg = vscode.workspace.getConfiguration('workbench');
                            const associations: any = globalCfg.get('editorAssociations');
                            let isMdEnabled = false;
                            
                            if (associations) {
                                if (Array.isArray(associations)) {
                                    isMdEnabled = associations.some(a => a.viewType === 'xlsxViewer.md' && (a.filenamePattern === '*.md' || a.filenamePattern === '**/*.md'));
                                } else {
                                    isMdEnabled = associations["*.md"] === 'xlsxViewer.md' || associations["**/*.md"] === 'xlsxViewer.md';
                                }
                            }

                            // Send settings
                            const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                            const settings = {
                                stickyToolbar: cfg.get('md.stickyToolbar', true),
                                wordWrap: cfg.get('md.wordWrap', true),
                                syncScroll: cfg.get('md.syncScroll', true),
                                previewPosition: cfg.get('md.previewPosition', 'right'),
                                showOutline: cfg.get('md.showOutline', true),
                                showLineNumbers: cfg.get('md.showLineNumbers', true),
                                moveMdButtonsToEnd: cfg.get('md.moveMdButtonsToEnd', false),
                                showPopups: cfg.get('showPopups', true),
                                showScrollToTop: cfg.get('md.showScrollToTop', cfg.get('showScrollToTop', true)),
                                textSize: cfg.get('md.textSize', 100),
                                autoSave: cfg.get('md.autoSave', false),
                                ...getAutoSaveDelaySettings(),
                                isMdEnabled: isMdEnabled,
                                language: cfg.get('language', 'auto'),
                                vscodeLanguage: vscode.env.language,
                                theme: this.markdownThemeService.getPayload(),
                                appearance: this.getAppearanceSettings()
                            };
                            webviewPanel.webview.postMessage({ command: 'initSettings', settings });
                            void webviewPanel.webview.postMessage({ command: 'toolbarLayoutUpdated', ...this.toolbarStorage.read() });

                            // Send theme
                            webviewPanel.webview.postMessage({
                                type: 'setTheme',
                                kind: vscode.window.activeColorTheme.kind
                            });
                        } catch (err) {
                            vscode.window.showErrorMessage(`Error reading Markdown file: ${err}`);
                        }
                        break;

                    case 'resolveImageUris':
                        try {
                            const requestedSources = Array.isArray(message.sources) ? message.sources : [];
                            if (requestedSources.length === 0) {
                                break;
                            }

                            // Defensively chunk into batches of at most 200 (strictly below the 256 limit)
                            const BACKEND_CHUNK_SIZE = 200;
                            for (let i = 0; i < requestedSources.length; i += BACKEND_CHUNK_SIZE) {
                                const chunk = requestedSources.slice(i, i + BACKEND_CHUNK_SIZE);
                                const resolved: Record<string, string> = {};
                                const targetFileUris: vscode.Uri[] = [];

                                for (const source of chunk) {
                                    if (typeof source !== 'string') {
                                        continue;
                                    }

                                    const trimmed = source.trim();
                                    if (!trimmed) {
                                        continue;
                                    }

                                    const target = await this.resolveMarkdownImageTarget(trimmed, document.uri);
                                    if (target) {
                                        targetFileUris.push(target.targetUri);
                                    }
                                }

                                if (targetFileUris.length > 0) {
                                    ensureResourceRoots(targetFileUris);
                                }

                                for (const source of chunk) {
                                    if (typeof source !== 'string') {
                                        continue;
                                    }

                                    const trimmed = source.trim();
                                    if (!trimmed) {
                                        continue;
                                    }

                                    const resolvedUri = await this.resolveMarkdownImageUri(trimmed, document.uri, webviewPanel.webview);
                                    if (resolvedUri) {
                                        resolved[trimmed] = resolvedUri;
                                    }
                                }

                                webviewPanel.webview.postMessage({
                                    command: 'resolvedImageUris',
                                    resolved,
                                    requestedSources: chunk
                                });
                            }
                        } catch (err) {
                            console.error('Failed resolving markdown image URIs:', err);
                        }
                        break;

                    case 'updateSettings':
                        try {
                            const s = message.settings || {};
                            const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                            if (typeof s.autoSaveDelayOverride === 'number') {
                                const override = Math.max(0, Math.min(30000, Math.round(s.autoSaveDelayOverride)));
                                await this.context.globalState.update('autoSaveDelayOverride.md', override);
                            }
                            await cfg.update('md.stickyToolbar', !!s.stickyToolbar, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.autoSave', !!s.autoSave, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.wordWrap', !!s.wordWrap, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.syncScroll', !!s.syncScroll, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.previewPosition', s.previewPosition || 'right', vscode.ConfigurationTarget.Global);
                            await cfg.update('md.moveMdButtonsToEnd', !!s.moveMdButtonsToEnd, vscode.ConfigurationTarget.Global);
                            if (typeof s.showPopups === 'boolean') {
                                await cfg.update('showPopups', !!s.showPopups, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.showScrollToTop === 'boolean') {
                                await cfg.update('showScrollToTop', !!s.showScrollToTop, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.showOutline === 'boolean') {
                                await cfg.update('md.showOutline', !!s.showOutline, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.showLineNumbers === 'boolean') {
                                await cfg.update('md.showLineNumbers', !!s.showLineNumbers, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.textSize === 'number') {
                                await cfg.update('md.textSize', s.textSize, vscode.ConfigurationTarget.Global);
                            }
                            if (s.appearance && typeof s.appearance === 'object') {
                                for (const key of Object.keys(appearanceDefaults)) {
                                    if (typeof s.appearance[key] === 'string') {
                                        const value = sanitizeAppearanceValue(s.appearance[key]);
                                        if (cfg.get(`md.${key}`, appearanceDefaults[key]) !== value) {
                                            await cfg.update(`md.${key}`, value, vscode.ConfigurationTarget.Global);
                                        }
                                    }
                                }
                            }
                            webviewPanel.webview.postMessage({ command: 'settingsUpdated', settings: getAutoSaveDelaySettings() });
                        } catch (err) {
                            console.error('Failed to persist settings:', err);
                        }
                        break;

                    case 'setLanguage':
                        try {
                            const lang = message.language;
                            if (lang === 'auto' || lang === 'en' || lang === 'zh') {
                                const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                                await cfg.update('language', lang, vscode.ConfigurationTarget.Global);
                            }
                        } catch (err) {
                            console.error('Failed to update language setting:', err);
                        }
                        break;

                    case 'toggleView':
                        if (!message.isPreviewView) {
                            if (message.hasUnsavedChanges) {
                                const choice = await vscode.window.showWarningMessage('Markdown 有未保存的编辑。切换编辑器会丢弃这些更改。', '放弃更改并切换', '取消');
                                if (choice !== '放弃更改并切换') break;
                            }
                            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                            webviewPanel.dispose();
                        }
                        break;

                    case 'requestFreshData':
                        try {
                            const content = await fs.promises.readFile(filePath, 'utf-8');
                            currentContent = content;
                            lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));
                            webviewPanel.webview.postMessage(buildInitMarkdownPayload(content));
                            vscode.window.showInformationMessage('Markdown reloaded from disk.');
                        } catch (err) {
                            vscode.window.showErrorMessage(`Error reading Markdown file: ${err}`);
                        }
                        break;


                    case 'saveMarkdown':
                        if (previewVersionId) {
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: false, error: '历史版本预览是只读的，请使用恢复操作。' });
                            break;
                        }
                        if (isSaving) {
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: false, error: '另一次保存仍在进行，请稍后重试。' });
                            break;
                        }
                        try {
                            isSaving = true;
                            const text = typeof message.text === 'string' ? message.text : '';
                            await writeDocument(text);
                            currentContent = text;
                            let historyWarning: string | undefined;
                            try {
                                await this.withHistoryLock(filePath, () => persistVersionSnapshot(text));
                            } catch (historyError) {
                                historyWarning = `文件已保存，但版本历史快照失败：${String(historyError)}`;
                            }
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: true, silent: !!message.silent });
                            if (historyWarning) webviewPanel.webview.postMessage({ command: 'versionHistoryError', message: historyWarning });
                        } catch (err) {
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: false, error: String(err) });
                        } finally {
                            isSaving = false;
                        }
                        break;

                    case 'showVersionHistory':
                        try {
                            const history = await this.withHistoryLock(filePath, () => pruneHistory());
                            if (!history.length) {
                                webviewPanel.webview.postMessage({
                                    command: 'versionHistoryError',
                                    message: 'No saved versions available'
                                });
                                break;
                            }

                            const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
                            const oldestVersionId = sorted.length ? sorted[sorted.length - 1].id : null;
                            const picked = await vscode.window.showQuickPick(
                                buildGroupedVersionHistoryItems(sorted, (entry) => ({
                                    label: entry.id === oldestVersionId && entry.id === restoredVersionId
                                        ? 'Original File (Restored)'
                                        : entry.id === oldestVersionId
                                            ? 'Original File'
                                        : entry.id === restoredVersionId
                                            ? 'Restored'
                                            : formatVersionHistoryTimestamp(entry.timestamp),
                                    description: entry.id === oldestVersionId || entry.id === restoredVersionId
                                        ? formatVersionHistoryTimestamp(entry.timestamp)
                                        : `${entry.charCount} chars`,
                                    detail: `Saved ${Math.max(1, Math.round((Date.now() - entry.timestamp) / 60000))} min ago`,
                                    entry
                                })),
                                {
                                    placeHolder: `Version history (${sorted.length} versions)`
                                }
                            );

                            if (!picked?.entry) {
                                break;
                            }

                            previewVersionId = picked.entry.id;
                            previewVersionTimestamp = picked.entry.timestamp;
                            previewVersionContent = await readHistoryContent(picked.entry);
                            currentContent = previewVersionContent;

                            webviewPanel.webview.postMessage(buildInitMarkdownPayload(currentContent));
                            webviewPanel.webview.postMessage({
                                command: 'versionPreviewMd',
                                versionId: picked.entry.id,
                                timestamp: picked.entry.timestamp
                            });
                        } catch (err) {
                            webviewPanel.webview.postMessage({
                                command: 'versionHistoryError',
                                message: `Version history failed: ${String(err)}`
                            });
                        }
                        break;

                            case 'cancelVersionPreview':
                                try {
                                    if (!previewVersionId) {
                                        break;
                                    }

                                    const content = await fs.promises.readFile(filePath, 'utf8');
                                    currentContent = content;
                                    lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));
                                    previewVersionId = null;
                                    previewVersionTimestamp = null;
                                    previewVersionContent = null;
                                    restoredVersionId = null;

                                    webviewPanel.webview.postMessage(buildInitMarkdownPayload(currentContent));
                                    webviewPanel.webview.postMessage({ command: 'versionPreviewCancelledMd' });
                                } catch (err) {
                                    webviewPanel.webview.postMessage({
                                        command: 'versionHistoryError',
                                        message: `Version preview cancel failed: ${String(err)}`
                                    });
                                }
                                break;

                            case 'restoreVersion':
                                if (isSaving) {
                                    webviewPanel.webview.postMessage({ command: 'versionHistoryError', message: '另一次保存仍在进行，请稍后重试。' });
                                    break;
                                }
                                try {
                                    isSaving = true;
                                    const versionId = typeof message.versionId === 'string' ? message.versionId : previewVersionId || '';
                                    if (!versionId) {
                                        break;
                                    }

                                    const history = await this.withHistoryLock(filePath, () => pruneHistory());
                                    const entry = history.find(item => item.id === versionId);
                                    if (!entry) {
                                        webviewPanel.webview.postMessage({
                                            command: 'versionHistoryError',
                                            message: 'Selected version is no longer available'
                                        });
                                        break;
                                    }

                                    const restoredContent = await readHistoryContent(entry);
                                    await writeDocument(restoredContent);
                                    currentContent = restoredContent;
                                    previewVersionId = null;
                                    previewVersionTimestamp = null;
                                    previewVersionContent = null;
                                    restoredVersionId = entry.id;
                                    try {
                                        await this.withHistoryLock(filePath, () => persistVersionSnapshot(currentContent));
                                    } catch (historyError) {
                                        webviewPanel.webview.postMessage({ command: 'versionHistoryError', message: `文件已恢复，但版本历史快照失败：${String(historyError)}` });
                                    }

                                    webviewPanel.webview.postMessage(buildInitMarkdownPayload(currentContent));
                                    webviewPanel.webview.postMessage({
                                        command: 'versionRestoredMd',
                                        versionId: entry.id,
                                        timestamp: entry.timestamp
                                    });
                                } catch (err) {
                                    webviewPanel.webview.postMessage({
                                        command: 'versionHistoryError',
                                        message: `Version history failed: ${String(err)}`
                                    });
                                } finally {
                                    isSaving = false;
                                }
                                break;

                    case 'openExternal':
                        try {
                            const url = typeof message.url === 'string' ? message.url : '';
                            if (isAllowedExternalUri(url)) {
                                await vscode.env.openExternal(vscode.Uri.parse(url));
                            }
                        } catch {
                            // ignore
                        }
                        break;

                    case 'savePdfData':
                        try {
                            const base64Data = typeof message.data === 'string' ? message.data : '';
                            if (!base64Data) break;

                            const defaultUri = vscode.Uri.file(filePath.replace(/\.md$/i, '.pdf'));
                            const saveUri = await vscode.window.showSaveDialog({
                                defaultUri,
                                filters: { 'PDF Files': ['pdf'] },
                                title: 'Export Markdown Preview to PDF'
                            });

                            if (!saveUri) break;

                            const buffer = Buffer.from(base64Data, 'base64');
                            await vscode.workspace.fs.writeFile(saveUri, buffer);
                            vscode.window.showInformationMessage(`PDF exported successfully: ${path.basename(saveUri.fsPath)}`);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Failed to save PDF: ${err?.message || err}`);
                        }
                        break;


                    case 'openRelativeFile':
                        try {
                            const href = typeof message.href === 'string' ? message.href : '';
                            const docUri = typeof message.documentUri === 'string' ? message.documentUri : '';
                            
                            if (!href || !docUri) {
                                break;
                            }
                            
                            // Parse the document URI to get the file path
                            const currentDocUri = vscode.Uri.parse(docUri);
                            if (currentDocUri.scheme !== 'file' || currentDocUri.fsPath !== document.uri.fsPath) {
                                break;
                            }
                            const currentDir = path.dirname(currentDocUri.fsPath);
                            
                            // Extract line anchor if any
                            let lineNum: number | undefined;
                            const hashIndex = href.indexOf('#');
                            const anchor = hashIndex !== -1 ? href.substring(hashIndex + 1) : '';
                            let hrefWithoutAnchor = hashIndex !== -1 ? href.substring(0, hashIndex) : href;

                            if (
                                !hrefWithoutAnchor ||
                                /^[a-z][a-z0-9+.-]*:/i.test(hrefWithoutAnchor) ||
                                hrefWithoutAnchor.startsWith('//') ||
                                path.isAbsolute(hrefWithoutAnchor)
                            ) {
                                break;
                            }

                            let decodedHref = hrefWithoutAnchor;
                            try {
                                decodedHref = decodeURIComponent(hrefWithoutAnchor);
                            } catch {
                                try {
                                    decodedHref = decodeURI(hrefWithoutAnchor);
                                } catch {
                                    break;
                                }
                            }
                            
                            const lineMatch = anchor.match(/^[Ll](\d+)$/);
                            if (lineMatch) {
                                lineNum = parseInt(lineMatch[1], 10);
                            }
                            
                            // Resolve the relative path
                            const resolvedPath = path.resolve(currentDir, decodedHref);
                            const workspaceRoot = vscode.workspace.getWorkspaceFolder(currentDocUri)?.uri.fsPath || currentDir;
                            if (!await isPathWithinRealpath(workspaceRoot, resolvedPath)) {
                                break;
                            }
                            const targetUri = vscode.Uri.file(resolvedPath);
                            
                            if (lineNum !== undefined && lineNum > 0) {
                                try {
                                    const doc = await vscode.workspace.openTextDocument(targetUri);
                                    const pos = new vscode.Position(lineNum - 1, 0);
                                    const selection = new vscode.Range(pos, pos);
                                    await vscode.window.showTextDocument(doc, { selection });
                                } catch {
                                    // Fallback to standard open if we cannot open as a text document
                                    await vscode.commands.executeCommand('vscode.open', targetUri);
                                }
                            } else {
                                // Open the file
                                await vscode.commands.executeCommand('vscode.open', targetUri);
                            }
                        } catch (err) {
                            vscode.window.showErrorMessage(`Failed to open file: ${err}`);
                        }
                        break;

                    case 'getSystemDetails': {
                        const ext = vscode.extensions.getExtension('muhammad-ahmad.xlsx-viewer');
                        const editorName = vscode.env.appName || 'VS Code';
                        webviewPanel.webview.postMessage({
                            command: 'systemDetails',
                            vscodeVersion: vscode.version,
                            extensionVersion: ext?.packageJSON?.version ?? 'unknown',
                            osInfo: `${process.platform} ${process.arch}`,
                            editorName: editorName
                        });
                        break;
                    }

                    case 'submitFeedback': {
                        try {
                            const https = await import('https');
                            const formData = message.data as Record<string, string>;
                            const body = Object.entries(formData)
                                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
                                .join('&');
                            const result = await new Promise<boolean>((resolve) => {
                                const req = https.request({
                                    hostname: 'docs.google.com',
                                    path: '/forms/d/e/1FAIpQLSe5AqE_f1-WqUlQmvuPn1as3Mkn4oLjA0EDhNssetzt63ONzA/formResponse',
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
                                }, (res: IncomingMessage) => resolve((res.statusCode ?? 0) < 400));
                                req.on('error', () => resolve(false));
                                req.write(body);
                                req.end();
                            });
                            webviewPanel.webview.postMessage({ command: 'feedbackResult', ok: result });
                        } catch {
                            webviewPanel.webview.postMessage({ command: 'feedbackResult', ok: false });
                        }
                        break;
                    }

                    case 'disableMdEditor':
                        try {
                            const result = await vscode.window.showWarningMessage(
                                "Are you sure you want to disable Markdown Viewer for all Markdown files? You will be prompted to select a new default editor.",
                                "Yes, Disable",
                                "Cancel"
                            );

                            if (result === "Yes, Disable") {
                                // 1. First remove our association so it's not the default anymore
                                await vscode.commands.executeCommand('xlsx-viewer.toggleMdAssociation', false);
                                
                                // 2. Trigger the "Reopen With..." picker which allows selecting a new default
                                // We use this command as it is more widely available than changeDefaultViewType
                                await vscode.commands.executeCommand('workbench.action.reopenWithEditor');
                            }
                        } catch (err) {
                            vscode.window.showErrorMessage(`Error disabling MD editor: ${err}`);
                        }
                        break;
                    
                    case 'enableMdEditor':
                        try {
                            await vscode.commands.executeCommand('xlsx-viewer.toggleMdAssociation', true);
                            
                             // Send updated settings
                             const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                             const settings = {
                                 stickyToolbar: cfg.get('md.stickyToolbar', true),
                                 wordWrap: cfg.get('md.wordWrap', true),
                                 syncScroll: cfg.get('md.syncScroll', true),
                                 previewPosition: cfg.get('md.previewPosition', 'right'),
                                 showOutline: cfg.get('md.showOutline', true),
                                 showLineNumbers: cfg.get('md.showLineNumbers', true),
                                 moveMdButtonsToEnd: cfg.get('md.moveMdButtonsToEnd', false),
                                 isMdEnabled: true,
                                 autoSave: cfg.get('md.autoSave', false),
                                 ...getAutoSaveDelaySettings(),
                                 language: cfg.get('language', 'auto'),
                                 vscodeLanguage: vscode.env.language,
                                 theme: this.markdownThemeService.getPayload(),
                                 appearance: this.getAppearanceSettings()
                             };
                             webviewPanel.webview.postMessage({ command: 'initSettings', settings });

                        } catch (err) {
                            vscode.window.showErrorMessage(`Error enabling MD editor: ${err}`);
                        }
                        break;
                    
                    case 'toggleMdAssociation':
                        await vscode.commands.executeCommand('xlsx-viewer.toggleMdAssociation', !!message.enable);
                        break;
                }
            });

            // Forward settings changes
            const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(async e => {
                if (e.affectsConfiguration('xlsxViewer.md.theme')) {
                    await this.markdownThemeService.loadFromConfiguration();
                }
                if (e.affectsConfiguration('xlsxViewer.md') || e.affectsConfiguration('xlsxViewer') || e.affectsConfiguration('workbench.editorAssociations') || e.affectsConfiguration('files.autoSave') || e.affectsConfiguration('files.autoSaveDelay')) {
                    const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                    const globalCfg = vscode.workspace.getConfiguration('workbench');
                    const associations: any = globalCfg.get('editorAssociations');
                    let isMdEnabled = false;
                    
                    if (associations) {
                        if (Array.isArray(associations)) {
                            isMdEnabled = associations.some(a => a.viewType === 'xlsxViewer.md' && (a.filenamePattern === '*.md' || a.filenamePattern === '**/*.md'));
                        } else {
                            isMdEnabled = associations["*.md"] === 'xlsxViewer.md' || associations["**/*.md"] === 'xlsxViewer.md';
                        }
                    }

                    const settings = {
                        stickyToolbar: cfg.get('md.stickyToolbar', true),
                        wordWrap: cfg.get('md.wordWrap', true),
                        syncScroll: cfg.get('md.syncScroll', true),
                        previewPosition: cfg.get('md.previewPosition', 'right'),
                        showOutline: cfg.get('md.showOutline', true),
                        showLineNumbers: cfg.get('md.showLineNumbers', true),
                        moveMdButtonsToEnd: cfg.get('md.moveMdButtonsToEnd', false),
                        textSize: cfg.get('md.textSize', 100),
                        autoSave: cfg.get('md.autoSave', false),
                        ...getAutoSaveDelaySettings(),
                        isMdEnabled: isMdEnabled,
                        language: cfg.get('language', 'auto'),
                        vscodeLanguage: vscode.env.language,
                        theme: this.markdownThemeService.getPayload(),
                        appearance: this.getAppearanceSettings()
                    };
                    try {
                        webviewPanel.webview.postMessage({ command: 'settingsUpdated', settings });
                    } catch { }
                }
            });

            // Theme change listener
            const themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
                try {
                    webviewPanel.webview.postMessage({
                        type: 'setTheme',
                        kind: vscode.window.activeColorTheme.kind
                    });
                } catch { }
            });

            let watcherDebounceTimer: NodeJS.Timeout | null = null;
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.file(path.dirname(filePath)), path.basename(filePath))
            );
            const watcherDisposable = watcher.onDidChange(() => {
                if (isSaving) {
                    return;
                }
                if (watcherDebounceTimer) {
                    clearTimeout(watcherDebounceTimer);
                }
                watcherDebounceTimer = setTimeout(async () => {
                    watcherDebounceTimer = null;
                    if (isSaving) {
                        return;
                    }
                    try {
                        if (await hashFile(filePath) !== lastKnownFileHash) {
                            webviewPanel.webview.postMessage({ command: 'externalFileChanged' });
                        }
                    } catch {
                        // ignore reload errors
                    }
                }, 250);
            });

            webviewPanel.onDidDispose(() => {
                this.panels.delete(webviewPanel);
                configChangeDisposable.dispose();
                themeChangeDisposable.dispose();
                if (watcherDebounceTimer) {
                    clearTimeout(watcherDebounceTimer);
                    watcherDebounceTimer = null;
                }
                watcherDisposable.dispose();
                watcher.dispose();
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Error reading Markdown file: ${error}`);
        }
    }

    private getWebviewContent(webviewPanel: vscode.WebviewPanel): string {
        const webview = webviewPanel.webview;
        const imgUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'view.png'));
        const svgUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'logo.svg'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'md', 'mdWebview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'mdWebview.css'));
        const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'shared', 'theme.css'));
        const highlightUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'highlight.css'));
        const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'katex', 'katex.min.css'));
        const feedbackStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'shared', 'feedback.css'));
        const cspSource = webview.cspSource;
        const nonce = randomBytes(16).toString('hex');
        const remoteImages = vscode.workspace.getConfiguration('xlsxViewer').get<boolean>('md.allowRemoteImages', false) ? ' https:' : '';

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:${remoteImages}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Markdown Viewer</title>
            <link href="${themeUri}" rel="stylesheet" />
            <link href="${styleUri}" rel="stylesheet" />
            <link href="${highlightUri}" rel="stylesheet" />
            <link href="${katexUri}" rel="stylesheet" />
            <link href="${feedbackStyleUri}" rel="stylesheet" />
            <script nonce="${nonce}">
                window.viewImgUri = "${imgUri}";
                window.logoSvgUri = "${svgUri}";
            </script>
        </head>
        <body>
            <div id="readingProgressBar" class="reading-progress-bar"></div>
            <div class="header-background"></div>
            <div class="toolbar-wrapper"><div class="toolbar" id="toolbar"></div></div>

            <div id="formattingToolbar" class="formatting-toolbar hidden">
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="bold" title="Bold (Ctrl+B)"></button>
                    <button class="fmt-btn" data-format="italic" title="Italic (Ctrl+I)"></button>
                    <button class="fmt-btn" data-format="strikethrough" title="Strikethrough (Ctrl+Shift+X)"></button>
                    <button class="fmt-btn" data-format="inlineCode" title="Inline Code (Ctrl+E)"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="heading1" title="Heading 1 (Ctrl+1)"></button>
                    <button class="fmt-btn" data-format="heading2" title="Heading 2 (Ctrl+2)"></button>
                    <button class="fmt-btn" data-format="heading3" title="Heading 3 (Ctrl+3)"></button>
                    <button class="fmt-btn" data-format="decreaseHeading" title="Decrease Heading Level"></button>
                    <button class="fmt-btn" data-format="increaseHeading" title="Increase Heading Level"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="decreaseTextSize" title="Decrease Text Size (Ctrl+-)"></button>
                    <button class="fmt-btn fmt-text-size-val" data-format="resetTextSize" title="Reset Text Size (Ctrl+0)">100%</button>
                    <button class="fmt-btn" data-format="increaseTextSize" title="Increase Text Size (Ctrl++)"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="bulletList" title="Bullet List (Ctrl+L)"></button>
                    <button class="fmt-btn" data-format="orderedList" title="Ordered List (Ctrl+Shift+L)"></button>
                    <button class="fmt-btn" data-format="checkbox" title="Checkbox List"></button>
                    <button class="fmt-btn" data-format="blockquote" title="Blockquote"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="link" title="Insert Link (Ctrl+K)"></button>
                    <button class="fmt-btn" data-format="image" title="Insert Image"></button>
                    <button class="fmt-btn" data-format="table" title="Insert Table"></button>
                    <button class="fmt-btn" data-format="tableAddRowBelow" title="Add Row Below (WYSIWYG table)"></button>
                    <button class="fmt-btn" data-format="tableRemoveRow" title="Remove Current Row (WYSIWYG table)"></button>
                    <button class="fmt-btn" data-format="tableAddColumnRight" title="Add Column Right (WYSIWYG table)"></button>
                    <button class="fmt-btn" data-format="tableRemoveColumn" title="Remove Current Column (WYSIWYG table)"></button>
                    <button class="fmt-btn" data-format="codeBlock" title="Code Block (Ctrl+Shift+E)"></button>
                    <button class="fmt-btn" data-format="hr" title="Horizontal Rule"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="undo" title="Undo (Ctrl+Z)"></button>
                    <button class="fmt-btn" data-format="redo" title="Redo (Ctrl+Shift+Z)"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="duplicateLine" title="Duplicate Line (Ctrl+Shift+D)"></button>
                    <button class="fmt-btn" data-format="deleteLine" title="Delete Line (Ctrl+Shift+K)"></button>
                    <button class="fmt-btn" data-format="moveUp" title="Move Line Up (Alt+&#x2191;)"></button>
                    <button class="fmt-btn" data-format="moveDown" title="Move Line Down (Alt+&#x2193;)"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="uppercase" title="UPPERCASE (Ctrl+Shift+U)"></button>
                    <button class="fmt-btn" data-format="lowercase" title="lowercase (Ctrl+U)"></button>
                    <button class="fmt-btn" data-format="titlecase" title="Title Case"></button>
                    <button class="fmt-btn" data-format="sortLines" title="Sort Lines A-Z"></button>
                    <button class="fmt-btn" data-format="trimWhitespace" title="Trim Trailing Whitespace"></button>
                    <button class="fmt-btn" data-format="jumpToLine" title="Go to Line (Ctrl+G)"></button>
                </div>
            </div>

            <div id="searchOverlay" class="search-overlay">
                <div class="search-bar">
                    <input type="text" id="searchInput" class="search-input" placeholder="Search in preview..." autocomplete="off" />
                    <span id="searchCount" class="search-count"></span>
                    <button id="searchPrev" class="search-nav-btn" title="Previous (Shift+Enter)">&#9650;</button>
                    <button id="searchNext" class="search-nav-btn" title="Next (Enter)">&#9660;</button>
                    <button id="searchClose" class="search-close-btn" title="Close (Esc)">&times;</button>
                </div>
            </div>

            <div id="content">
                <div id="loadingIndicator" class="loading-indicator">Loading Markdown...</div>
                <div class="markdown-container" id="markdownContainer">
                    <aside id="tocPanel" class="toc-panel hidden" aria-label="Outline">
                        <div class="toc-header">
                            <span class="toc-title">Outline</span>
                            <button id="tocCloseButton" class="toc-close" title="Hide outline">x</button>
                        </div>
                        <div id="tocBody" class="toc-body"></div>
                    </aside>
                    <div class="editor-wrapper">
                        <textarea id="markdownEditor" class="markdown-editor" spellcheck="false"></textarea>
                    </div>
                    <div id="markdownPreview" class="markdown-preview"></div>
                </div>
            </div>

            <div class="status-info" id="statusInfo"></div>
            <button id="scrollToTopBtn" class="scroll-to-top-btn" title="Scroll to top" aria-label="Scroll to top">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
            </button>

            <div id="lightboxOverlay" class="lightbox-overlay">
                <button id="lightboxClose" class="lightbox-close">&times;</button>
                <img id="lightboxImage" class="lightbox-image" />
            </div>

            <noscript>
                <div style="padding: 8px; margin-top: 10px; background: #fff3cd; border: 1px solid #ffeeba;">
                    JavaScript is disabled in this webview, so the Markdown preview cannot load.
                </div>
            </noscript>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private async resolveMarkdownImageTarget(rawSource: string, documentUri: vscode.Uri): Promise<{ targetUri: vscode.Uri; suffix: string } | null> {
        if (!rawSource || /^(?:https?:|data:|mailto:|#|javascript:)/i.test(rawSource)) {
            return null;
        }

        // Keep query/hash on the final Webview URL after converting the file path.
        const match = rawSource.match(/^([^?#]*)([?#].*)?$/);
        const sourcePath = (match?.[1] || '').trim();
        const suffix = match?.[2] || '';
        if (!sourcePath) {
            return null;
        }

        let decoded = sourcePath;
        try {
            decoded = decodeURIComponent(sourcePath);
        } catch {
            try {
                decoded = decodeURI(sourcePath);
            } catch {
                return null;
            }
        }

        try {
            let absolute: string;
            if (/^file:\/\//i.test(sourcePath)) {
                // Parse the original URI once; decoding before Uri.parse corrupts
                // encoded #, ? and literal percent sequences in file names.
                const fileUri = vscode.Uri.parse(sourcePath);
                if (fileUri.scheme !== 'file') {
                    return null;
                }
                absolute = fileUri.fsPath;
            } else if (/^[a-zA-Z]:[/\\]/.test(decoded)) {
                absolute = path.normalize(decoded);
            } else {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri)?.uri;
                const normalized = decoded.replace(/\\/g, '/');
                if (/^\//.test(normalized) && workspaceFolder) {
                    absolute = path.join(workspaceFolder.fsPath, normalized.replace(/^\/+/, ''));
                } else if (path.isAbsolute(normalized)) {
                    absolute = path.normalize(normalized);
                } else {
                    absolute = path.resolve(path.dirname(documentUri.fsPath), normalized);
                }
            }

            const workspaceRoot = vscode.workspace.getWorkspaceFolder(documentUri)?.uri.fsPath;
            const documentDir = path.dirname(documentUri.fsPath);
            const withinWorkspace = workspaceRoot ? await isPathWithinRealpath(workspaceRoot, absolute) : false;
            const withinDocument = await isPathWithinRealpath(documentDir, absolute);
            const configuredExternalRoots = vscode.workspace
                .getConfiguration('xlsxViewer')
                .get<string[]>('md.externalResourceRoots', [])
                .filter(root => typeof root === 'string' && path.isAbsolute(root));
            const withinTrustedExternalRoot = await Promise.all(
                configuredExternalRoots.map(root => isPathWithinRealpath(root, absolute))
            ).then(results => results.some(Boolean));
            const imageExtension = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(absolute);

            // Relative/workspace images stay within the normal trust boundary. An
            // absolute image outside it is allowed only for a known image type;
            // arbitrary files such as HTML or scripts are never exposed.
            if (!withinWorkspace && !withinDocument && (!imageExtension || !withinTrustedExternalRoot)) {
                return null;
            }

            return { targetUri: vscode.Uri.file(absolute), suffix };
        } catch {
            return null;
        }
    }

    private async resolveMarkdownImageUri(rawSource: string, documentUri: vscode.Uri, webview: vscode.Webview): Promise<string | null> {
        const target = await this.resolveMarkdownImageTarget(rawSource, documentUri);
        if (!target) {
            return null;
        }
        try {
            return webview.asWebviewUri(target.targetUri).toString() + target.suffix;
        } catch {
            return null;
        }
    }
}
