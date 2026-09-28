const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Restrict Webview-triggered browser launches to links the user can reasonably
 * expect to leave the editor. File, command and javascript URIs must never be
 * forwarded to vscode.env.openExternal from untrusted document content.
 */
export function isAllowedExternalUri(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) {
        return false;
    }

    try {
        const parsed = new URL(value.trim());
        return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase());
    } catch {
        return false;
    }
}
