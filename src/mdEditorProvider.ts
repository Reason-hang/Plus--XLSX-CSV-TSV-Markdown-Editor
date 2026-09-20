import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { IncomingMessage } from 'http';
import { VERSION_HISTORY_MAX_ENTRIES, VERSION_HISTORY_MAX_TOTAL_BYTES, VERSION_HISTORY_RETENTION_MS, VERSION_HISTORY_SNAPSHOT_DEBOUNCE_MS, buildGroupedVersionHistoryItems, formatVersionHistoryTimestamp, getVersionHistoryDir, getVersionHistoryFile } from './shared/versionHistory';
import { MarkdownThemeService } from './shared/markdownThemeService';
import { isAllowedExternalUri } from './shared/externalUri';
import { isPathWithinRealpath } from './shared/pathSafety';
import { writeBufferFileAtomically, writeTextFileAtomically } from './shared/atomicFile';
import { hashBuffer, hashFile } from './shared/fileFingerprint';
import { validateWebviewMessage, WEBVIEW_LIMITS } from './shared/webviewMessageSchema';

/**
 * Appearance values are user-configurable CSS property values, not arbitrary
 * stylesheet fragments. Keep the settings surface deliberately small and
 * reject delimiters/functions that could escape a single declaration.
 */
function sanitizeAppearanceValue(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128 || /[;{}<>]/.test(trimmed) || /(?:url\s*\(|expression\s*\(|javascript\s*:|@import)/i.test(trimmed)) {
        return fallback;
    }
    return trimmed;
}

export class MDEditorProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
    private readonly markdownThemeService = new MarkdownThemeService();
    private readonly webviewPanels = new Set<vscode.WebviewPanel>();
    private readonly themeOutput = vscode.window.createOutputChannel('XLSX Viewer Markdown Theme');
    private readonly markdownThemeChangeDisposable: vscode.Disposable;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.markdownThemeChangeDisposable = this.markdownThemeService.onDidChange(theme => {
            this.themeOutput.appendLine(`[${new Date().toISOString()}] ${theme.status}: ${theme.message}`);
            for (const panel of this.webviewPanels) {
                void panel.webview.postMessage({ command: 'setMarkdownTheme', theme });
            }
        });
        void this.markdownThemeService.loadFromConfiguration();
    }

    dispose(): void {
        this.markdownThemeChangeDisposable.dispose();
        this.markdownThemeService.dispose();
        this.themeOutput.dispose();
        this.webviewPanels.clear();
    }

    async reloadMarkdownTheme(): Promise<void> {
        const theme = await this.markdownThemeService.reload();
        if (theme.status === 'loaded' || theme.status === 'disabled') {
            vscode.window.showInformationMessage(theme.message);
        } else {
            vscode.window.showWarningMessage(theme.message);
        }
    }

    showMarkdownThemeStatus(): void {
        const theme = this.markdownThemeService.getPayload();
        this.themeOutput.show(true);
        const message = `Markdown 主题状态：${theme.status}。${theme.message}`;
        if (theme.status === 'loaded' || theme.status === 'disabled') {
            vscode.window.showInformationMessage(message);
        } else {
            vscode.window.showWarningMessage(message);
        }
    }

    async revealMarkdownThemeFolder(): Promise<void> {
        const cssFile = this.markdownThemeService.getConfiguredCssFile();
        if (!cssFile || !path.isAbsolute(cssFile)) {
            vscode.window.showWarningMessage('请先配置绝对路径 xlsxViewer.md.theme.cssFile。');
            return;
        }
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(cssFile)));
    }

    private getMarkdownSettings(isMdEnabled: boolean) {
        const cfg = vscode.workspace.getConfiguration('xlsxViewer');
        return {
            stickyToolbar: cfg.get('md.stickyToolbar', true),
            wordWrap: cfg.get('md.wordWrap', true),
            syncScroll: cfg.get('md.syncScroll', true),
            previewPosition: cfg.get('md.previewPosition', 'right'),
            showOutline: cfg.get('md.showOutline', true),
            showLineNumbers: cfg.get('md.showLineNumbers', true),
            moveMdButtonsToEnd: cfg.get('md.moveMdButtonsToEnd', false),
            showPopups: cfg.get('showPopups', true),
            isMdEnabled,
            theme: this.markdownThemeService.getPayload(),
            appearance: {
                markBackgroundColor: sanitizeAppearanceValue(cfg.get('md.markBackgroundColor', '#FF4E00'), '#FF4E00'),
                markTextColor: sanitizeAppearanceValue(cfg.get('md.markTextColor', 'inherit'), 'inherit'),
                markFontWeight: sanitizeAppearanceValue(cfg.get('md.markFontWeight', 'inherit'), 'inherit'),
                markPadding: sanitizeAppearanceValue(cfg.get('md.markPadding', '0 2px'), '0 2px'),
                markBorderRadius: sanitizeAppearanceValue(cfg.get('md.markBorderRadius', '2px'), '2px'),
                headingColor: sanitizeAppearanceValue(cfg.get('md.headingColor', '#569CD6'), '#569CD6'),
                previewBackgroundColor: sanitizeAppearanceValue(cfg.get('md.previewBackgroundColor', '')),
                previewTextColor: sanitizeAppearanceValue(cfg.get('md.previewTextColor', '')),
                previewFontSize: sanitizeAppearanceValue(cfg.get('md.previewFontSize', '')),
                previewLineHeight: sanitizeAppearanceValue(cfg.get('md.previewLineHeight', '')),
                editorFontSize: sanitizeAppearanceValue(cfg.get('md.editorFontSize', '16px'), '16px'),
                editorLineHeight: sanitizeAppearanceValue(cfg.get('md.editorLineHeight', '1.8'), '1.8')
            }
        };
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

            let versionSnapshotDebounceTimer: NodeJS.Timeout | null = null;
            let currentContent = '';
            let previewVersionId: string | null = null;
            let previewVersionTimestamp: number | null = null;
            let previewVersionContent: string | null = null;
            let restoredVersionId: string | null = null;
            let isSaving = false;
            let lastKnownFileHash = '';

            const getHistoryDir = () => getVersionHistoryDir(this.context.globalStorageUri.fsPath, filePath, 'md');
            const getHistoryIndexPath = () => path.join(getHistoryDir(), 'index.json');
            const getLegacyHistoryFilePath = () => getVersionHistoryFile(this.context.globalStorageUri.fsPath, filePath, 'md');
            const getSnapshotPath = (snapshotFile: string) => path.join(getHistoryDir(), snapshotFile);
            const isSafeSnapshotFile = (snapshotFile: unknown): snapshotFile is string => (
                typeof snapshotFile === 'string' &&
                snapshotFile === path.basename(snapshotFile) &&
                /^[A-Za-z0-9._-]+\.md$/i.test(snapshotFile)
            );

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
                        return [];
                    }
                    return parsed.filter((entry): entry is VersionHistoryEntry => (
                        !!entry && typeof entry.id === 'string' &&
                        Number.isFinite(entry.timestamp) &&
                        typeof entry.snapshotFile === 'string' &&
                        isSafeSnapshotFile(entry.snapshotFile)
                    ));
                } catch (indexError) {
                    try {
                        const raw = await fs.promises.readFile(getLegacyHistoryFilePath(), 'utf8');
                        const parsed = JSON.parse(raw);
                        if (!Array.isArray(parsed)) {
                            return [];
                        }
                        const legacyEntries = parsed.filter((entry): entry is VersionHistoryEntry => (
                            !!entry && typeof entry.id === 'string' &&
                            Number.isFinite(entry.timestamp) &&
                            typeof entry.content === 'string'
                        ));
                        return await migrateLegacyHistory(legacyEntries);
                    } catch {
                        if ((indexError as NodeJS.ErrnoException).code !== 'ENOENT') {
                            console.error('Failed to load Markdown version history:', indexError);
                        }
                        return [];
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
                for (const entry of source) {
                    if (!keptIds.has(entry.id)) {
                        await removeSnapshot(entry);
                    }
                }
                const historyChanged = kept.length !== source.length || kept.some((entry, index) => (
                    entry.id !== source[index]?.id || entry.byteSize !== source[index]?.byteSize
                ));
                if (historyChanged) {
                    await saveHistory(kept);
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
                await pruneHistory([...history, entry]);
            };

            const saveVersionSnapshot = (contentOverride?: string) => {
                if (versionSnapshotDebounceTimer) {
                    clearTimeout(versionSnapshotDebounceTimer);
                }

                versionSnapshotDebounceTimer = setTimeout(() => {
                    versionSnapshotDebounceTimer = null;
                    void persistVersionSnapshot(contentOverride).catch(error => {
                        console.error('Failed to persist Markdown version history:', error);
                    });
                }, VERSION_HISTORY_SNAPSHOT_DEBOUNCE_MS);
            };

            const assertMarkdownPayloadSize = (content: string): void => {
                if (Buffer.byteLength(content, 'utf8') > WEBVIEW_LIMITS.maxMarkdownContentBytes) {
                    throw new Error(`Markdown 正文超过 ${WEBVIEW_LIMITS.maxMarkdownContentBytes} 字节限制，已拒绝发送到 Webview。`);
                }
            };

            const buildInitMarkdownPayload = (content: string) => {
                assertMarkdownPayloadSize(content);
                return {
                    command: 'initMarkdown',
                    content,
                    fileName: vscode.workspace.asRelativePath(document.uri),
                    documentUri: document.uri.toString(),
                    documentDirUri: documentDirUri.toString(),
                    workspaceFolderUri
                };
            };

            const assertFileUnchanged = async () => {
                if (!lastKnownFileHash) {
                    return;
                }
                const currentHash = await hashFile(filePath);
                if (currentHash !== lastKnownFileHash) {
                    throw new Error('文件已被外部修改，请先重新加载后再保存。');
                }
            };

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
                        if (!currentRoots.some(root => root.fsPath === targetDir.fsPath) &&
                            !toAdd.some(root => root.fsPath === targetDir.fsPath)) {
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
            this.webviewPanels.add(webviewPanel);

            // Handle messages from webview
            webviewPanel.webview.onDidReceiveMessage(async message => {
                const validation = validateWebviewMessage(message, 'markdown');
                if (!validation.ok) {
                    console.warn(`[Markdown Webview] ${validation.errorCode}: ${validation.message}`);
                    void webviewPanel.webview.postMessage({
                        command: 'webviewError',
                        errorCode: validation.errorCode,
                        message: validation.message
                    });
                    return;
                }
                switch (message.command) {
                    case 'webviewReady':
                        try {
                            // Read the markdown file
                            const content = await fs.promises.readFile(filePath, 'utf-8');
                            assertMarkdownPayloadSize(content);
                            currentContent = content;
                            lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));
                            await pruneHistory();
                            await persistVersionSnapshot(content);

                            // Send content to webview
                            webviewPanel.webview.postMessage(buildInitMarkdownPayload(content));

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
                            webviewPanel.webview.postMessage({
                                command: 'initSettings',
                                settings: this.getMarkdownSettings(isMdEnabled)
                            });

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
                            const resolved: Record<string, string> = {};
                            const targetFileUris: vscode.Uri[] = [];

                            for (const source of requestedSources) {
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

                            ensureResourceRoots(targetFileUris);

                            for (const source of requestedSources) {
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
                                resolved
                            });
                        } catch (err) {
                            console.error('Failed resolving markdown image URIs:', err);
                        }
                        break;

                    case 'updateSettings':
                        try {
                            const s = message.settings || {};
                            const cfg = vscode.workspace.getConfiguration('xlsxViewer');
                            await cfg.update('md.stickyToolbar', !!s.stickyToolbar, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.wordWrap', !!s.wordWrap, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.syncScroll', !!s.syncScroll, vscode.ConfigurationTarget.Global);
                            await cfg.update('md.previewPosition', s.previewPosition || 'right', vscode.ConfigurationTarget.Global);
                            await cfg.update('md.moveMdButtonsToEnd', !!s.moveMdButtonsToEnd, vscode.ConfigurationTarget.Global);
                            if (typeof s.showPopups === 'boolean') {
                                await cfg.update('showPopups', !!s.showPopups, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.showOutline === 'boolean') {
                                await cfg.update('md.showOutline', !!s.showOutline, vscode.ConfigurationTarget.Global);
                            }
                            if (typeof s.showLineNumbers === 'boolean') {
                                await cfg.update('md.showLineNumbers', !!s.showLineNumbers, vscode.ConfigurationTarget.Global);
                            }

                            const appearance = s.appearance && typeof s.appearance === 'object' ? s.appearance : {};
                            const appearanceConfigKeys: Array<[keyof typeof appearance, string]> = [
                                ['markBackgroundColor', 'md.markBackgroundColor'],
                                ['markTextColor', 'md.markTextColor'],
                                ['markFontWeight', 'md.markFontWeight'],
                                ['markPadding', 'md.markPadding'],
                                ['markBorderRadius', 'md.markBorderRadius'],
                                ['headingColor', 'md.headingColor'],
                                ['previewBackgroundColor', 'md.previewBackgroundColor'],
                                ['previewTextColor', 'md.previewTextColor'],
                                ['previewFontSize', 'md.previewFontSize'],
                                ['previewLineHeight', 'md.previewLineHeight'],
                                ['editorFontSize', 'md.editorFontSize'],
                                ['editorLineHeight', 'md.editorLineHeight']
                            ];
                            for (const [property, configKey] of appearanceConfigKeys) {
                                if (typeof appearance[property] === 'string') {
                                    const value = sanitizeAppearanceValue(appearance[property]);
                                    await cfg.update(configKey, value, vscode.ConfigurationTarget.Global);
                                }
                            }
                        } catch (err) {
                            console.error('Failed to persist settings:', err);
                        }
                        break;

                    case 'toggleView':
                        if (!message.isPreviewView) {
                            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                            webviewPanel.dispose();
                        }
                        break;

                    case 'requestFreshData':
                        try {
                            const content = await fs.promises.readFile(filePath, 'utf-8');
                            assertMarkdownPayloadSize(content);
                            currentContent = content;
                            lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));
                            webviewPanel.webview.postMessage(buildInitMarkdownPayload(content));
                            vscode.window.showInformationMessage('Markdown reloaded from disk.');
                        } catch (err) {
                            vscode.window.showErrorMessage(`Error reading Markdown file: ${err}`);
                        }
                        break;


                    case 'saveMarkdown':
                        try {
                            isSaving = true;
                            const text = typeof message.text === 'string' ? message.text : '';
                            await assertFileUnchanged();
                            const contentBytes = Buffer.from(text, 'utf8');
                            if (document.uri.scheme === 'file') {
                                await writeBufferFileAtomically(filePath, contentBytes);
                            } else {
                                await vscode.workspace.fs.writeFile(document.uri, contentBytes);
                            }
                            lastKnownFileHash = hashBuffer(contentBytes);
                            currentContent = text;
                            saveVersionSnapshot(text);
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: true });
                        } catch (err) {
                            webviewPanel.webview.postMessage({ command: 'saveResult', ok: false, error: String(err) });
                        } finally {
                            isSaving = false;
                        }
                        break;

                    case 'showVersionHistory':
                        try {
                            const history = await pruneHistory();
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

                            const selectedContent = await readHistoryContent(picked.entry);
                            assertMarkdownPayloadSize(selectedContent);
                            previewVersionId = picked.entry.id;
                            previewVersionTimestamp = picked.entry.timestamp;
                            previewVersionContent = selectedContent;
                            currentContent = selectedContent;

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
                                    assertMarkdownPayloadSize(content);
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
                                try {
                                    isSaving = true;
                                    const versionId = typeof message.versionId === 'string' ? message.versionId : previewVersionId || '';
                                    if (!versionId) {
                                        break;
                                    }

                                    const history = await pruneHistory();
                                    const entry = history.find(item => item.id === versionId);
                                    if (!entry) {
                                        webviewPanel.webview.postMessage({
                                            command: 'versionHistoryError',
                                            message: 'Selected version is no longer available'
                                        });
                                        break;
                                    }

                                    const content = await readHistoryContent(entry);
                                    assertMarkdownPayloadSize(content);
                                    const contentBytes = Buffer.from(content, 'utf8');
                                    await assertFileUnchanged();
                                    if (document.uri.scheme === 'file') {
                                        await writeBufferFileAtomically(filePath, contentBytes);
                                    } else {
                                        await vscode.workspace.fs.writeFile(document.uri, contentBytes);
                                    }
                                    lastKnownFileHash = hashBuffer(contentBytes);
                                    currentContent = content;
                                    previewVersionId = null;
                                    previewVersionTimestamp = null;
                                    previewVersionContent = null;
                                    restoredVersionId = entry.id;
                                    await persistVersionSnapshot(currentContent);

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
                            if (saveUri.scheme === 'file') {
                                await writeBufferFileAtomically(saveUri.fsPath, buffer);
                            } else {
                                await vscode.workspace.fs.writeFile(saveUri, buffer);
                            }
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
                             webviewPanel.webview.postMessage({
                                 command: 'initSettings',
                                 settings: this.getMarkdownSettings(true)
                             });

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
                if (e.affectsConfiguration('xlsxViewer.md') || e.affectsConfiguration('xlsxViewer') || e.affectsConfiguration('workbench.editorAssociations')) {
                    if (e.affectsConfiguration('xlsxViewer.md.theme')) {
                        await this.markdownThemeService.loadFromConfiguration();
                    }
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

                    try {
                        webviewPanel.webview.postMessage({
                            command: 'settingsUpdated',
                            settings: this.getMarkdownSettings(isMdEnabled)
                        });
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

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.file(path.dirname(filePath)), path.basename(filePath))
            );
            const watcherDisposable = watcher.onDidChange(async () => {
                if (isSaving) {
                    return;
                }
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    assertMarkdownPayloadSize(content);
                    currentContent = content;
                    lastKnownFileHash = hashBuffer(Buffer.from(content, 'utf8'));
                    webviewPanel.webview.postMessage(buildInitMarkdownPayload(content));
                } catch {
                    // ignore reload errors
                }
            });

            webviewPanel.onDidDispose(() => {
                this.webviewPanels.delete(webviewPanel);
                configChangeDisposable.dispose();
                themeChangeDisposable.dispose();
                watcherDisposable.dispose();
                watcher.dispose();
                if (versionSnapshotDebounceTimer) {
                    clearTimeout(versionSnapshotDebounceTimer);
                    versionSnapshotDebounceTimer = null;
                }
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
        const katexStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'md', 'katex', 'katex.min.css'));
        const feedbackStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'shared', 'feedback.css'));
        const cspSource = webview.cspSource;
        const nonce = randomBytes(16).toString('base64');

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src ${cspSource} 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Markdown Viewer</title>
            <link href="${themeUri}" rel="stylesheet" />
            <link href="${styleUri}" rel="stylesheet" />
            <link href="${highlightUri}" rel="stylesheet" />
            <link href="${katexStyleUri}" rel="stylesheet" />
            <link href="${feedbackStyleUri}" rel="stylesheet" />
            <script nonce="${nonce}">
                window.viewImgUri = "${imgUri}";
                window.logoSvgUri = "${svgUri}";
            </script>
        </head>
        <body>
            <div id="readingProgressBar" class="reading-progress-bar"></div>
            <div class="header-background"></div>
            <div id="markdownToolbarHost">
                <div class="toolbar-wrapper"><div class="toolbar" id="toolbar"></div></div>

                <div id="formattingToolbar" class="formatting-toolbar hidden">
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="bold" title="加粗（Ctrl+B）"></button>
                    <button class="fmt-btn" data-format="italic" title="斜体（Ctrl+I）"></button>
                    <button class="fmt-btn" data-format="strikethrough" title="删除线（Ctrl+Shift+X）"></button>
                    <button class="fmt-btn" data-format="inlineCode" title="行内代码（Ctrl+E）"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="heading1" title="一级标题（Ctrl+1）"></button>
                    <button class="fmt-btn" data-format="heading2" title="二级标题（Ctrl+2）"></button>
                    <button class="fmt-btn" data-format="heading3" title="三级标题（Ctrl+3）"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="bulletList" title="无序列表（Ctrl+L）"></button>
                    <button class="fmt-btn" data-format="orderedList" title="有序列表（Ctrl+Shift+L）"></button>
                    <button class="fmt-btn" data-format="checkbox" title="任务列表"></button>
                    <button class="fmt-btn" data-format="blockquote" title="引用块"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="link" title="插入链接（Ctrl+K）"></button>
                    <button class="fmt-btn" data-format="image" title="插入图片"></button>
                    <button class="fmt-btn" data-format="table" title="插入表格"></button>
                    <button class="fmt-btn" data-format="tableAddRowBelow" title="在下方添加行（所见即所得表格）"></button>
                    <button class="fmt-btn" data-format="tableRemoveRow" title="删除当前行（所见即所得表格）"></button>
                    <button class="fmt-btn" data-format="tableAddColumnRight" title="在右侧添加列（所见即所得表格）"></button>
                    <button class="fmt-btn" data-format="tableRemoveColumn" title="删除当前列（所见即所得表格）"></button>
                    <button class="fmt-btn" data-format="codeBlock" title="代码块（Ctrl+Shift+E）"></button>
                    <button class="fmt-btn" data-format="hr" title="水平分隔线"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="undo" title="撤销（Ctrl+Z）"></button>
                    <button class="fmt-btn" data-format="redo" title="重做（Ctrl+Shift+Z）"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="duplicateLine" title="复制当前行（Ctrl+Shift+D）"></button>
                    <button class="fmt-btn" data-format="deleteLine" title="删除当前行（Ctrl+Shift+K）"></button>
                    <button class="fmt-btn" data-format="moveUp" title="上移当前行（Alt+&#x2191;）"></button>
                    <button class="fmt-btn" data-format="moveDown" title="下移当前行（Alt+&#x2193;）"></button>
                </div>
                <div class="fmt-sep"></div>
                <div class="fmt-group">
                    <button class="fmt-btn" data-format="uppercase" title="转换为大写（Ctrl+Shift+U）"></button>
                    <button class="fmt-btn" data-format="lowercase" title="转换为小写（Ctrl+U）"></button>
                    <button class="fmt-btn" data-format="titlecase" title="转换为标题格式"></button>
                    <button class="fmt-btn" data-format="sortLines" title="按 A-Z 排序行"></button>
                    <button class="fmt-btn" data-format="trimWhitespace" title="删除行尾空白"></button>
                    <button class="fmt-btn" data-format="jumpToLine" title="跳转到指定行（Ctrl+G）"></button>
                </div>
                </div>
            </div>

            <div id="searchOverlay" class="search-overlay">
                <div class="search-bar">
                    <input type="text" id="searchInput" class="search-input" placeholder="Search in preview..." autocomplete="off" />
                    <span id="searchCount" class="search-count"></span>
                    <button id="searchPrev" class="search-nav-btn" title="上一个（Shift+Enter）">&#9650;</button>
                    <button id="searchNext" class="search-nav-btn" title="下一个（Enter）">&#9660;</button>
                    <button id="searchClose" class="search-close-btn" title="关闭（Esc）">&times;</button>
                </div>
            </div>

            <div id="content">
                <div id="loadingIndicator" class="loading-indicator">Loading Markdown...</div>
                <div class="markdown-container" id="markdownContainer">
                    <aside id="tocPanel" class="toc-panel md-sidebar-toc hidden" aria-label="Outline">
                        <div class="toc-header">
                            <span class="toc-title">Outline</span>
                            <button id="tocCloseButton" class="toc-close" title="隐藏大纲">x</button>
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

            <div id="lightboxOverlay" class="lightbox-overlay">
                <button id="lightboxClose" class="lightbox-close">&times;</button>
                <img id="lightboxImage" class="lightbox-image" />
            </div>

            <noscript>
                <div style="padding: 8px; margin-top: 10px; background: #fff3cd; border: 1px solid #ffeeba;">
                    JavaScript is disabled in this webview, so the Markdown preview cannot load.
                </div>
            </noscript>
            <script src="${scriptUri}"></script>
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
            if (/^file:\/\//i.test(decoded)) {
                const fileUri = vscode.Uri.parse(decoded);
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
