import * as assert from 'assert';
import * as vscode from 'vscode';
import { getWebviewContent as getSpreadsheetWebviewContent } from '../spreadsheet/spreadsheetHtmlRenderer';
import { MDEditorProvider } from '../mdEditorProvider';

function createWebview(): vscode.Webview {
    return {
        cspSource: 'vscode-webview://unit-test',
        asWebviewUri: (uri: vscode.Uri) => uri,
    } as unknown as vscode.Webview;
}

function getCsp(html: string): string {
    const match = html.match(/Content-Security-Policy" content="([^"]+)"/);
    assert.ok(match, 'webview HTML must include a CSP');
    return match[1];
}

describe('webview security policy', () => {
    it('uses a nonce and no unsafe script sources for spreadsheet webviews', () => {
        const html = getSpreadsheetWebviewContent({ webview: createWebview() } as vscode.WebviewPanel, {
            extensionUri: vscode.Uri.file('/extension')
        } as vscode.ExtensionContext);
        const csp = getCsp(html);

        assert.ok(csp.includes("'nonce-"));
        assert.ok(!csp.includes("script-src 'unsafe-inline'"));
        assert.ok(!csp.includes("'unsafe-eval'"));
        assert.match(html, /<script nonce="[^"]+" src="file:\/\//);
    });

    it('uses a nonce and no unsafe script sources for Markdown webviews', () => {
        const provider = new MDEditorProvider({
            extensionUri: vscode.Uri.file('/extension')
        } as vscode.ExtensionContext);
        try {
            const html = (provider as any).getWebviewContent({ webview: createWebview() });
            const csp = getCsp(html);

            assert.ok(csp.includes("'nonce-"));
            assert.ok(!csp.includes("script-src 'unsafe-inline'"));
            assert.ok(!csp.includes("'unsafe-eval'"));
            assert.match(html, /<script nonce="[^"]+" src="file:\/\//);
        } finally {
            provider.dispose();
        }
    });
});
