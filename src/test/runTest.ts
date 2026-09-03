import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from 'vscode-test';

async function main(): Promise<void> {
    const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
    const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-extension-test-'));
    try {
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath: path.resolve(__dirname, '../..'),
            extensionTestsPath: path.resolve(__dirname, 'suite', 'index'),
            launchArgs: [`--user-data-dir=${userDataDir}`, '--disable-extensions']
        });
    } finally {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
    }
}

void main().catch(error => {
    console.error(error);
    process.exit(1);
});
