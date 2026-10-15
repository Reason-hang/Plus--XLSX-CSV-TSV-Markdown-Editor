import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
    if (!vscodeExecutablePath || !fs.existsSync(vscodeExecutablePath)) {
        throw new Error('必须显式指定已有测试 IDE 的 VSCODE_EXECUTABLE_PATH；不会自动下载 IDE，启动前须获用户授权。');
    }
    const userDataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'xlsx-viewer-extension-test-'));
    try {
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath: path.resolve(__dirname, '../..'),
            extensionTestsPath: path.resolve(__dirname, 'suite', 'index'),
            launchArgs: [`--user-data-dir=${userDataDir}`, `--extensions-dir=${path.join(userDataDir, 'extensions')}`]
        });
    } finally {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
    }
}

void main().catch(error => {
    console.error(error);
    process.exit(1);
});
