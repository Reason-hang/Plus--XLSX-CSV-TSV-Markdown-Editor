import { defineConfig } from '@vscode/test-cli';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Explicit local executable only: never resolve/download the latest IDE implicitly.
const executable = process.env.VSCODE_EXECUTABLE_PATH;
if (!executable || !existsSync(executable)) {
    throw new Error('未指定已有的测试 IDE。请先获得启动隔离测试窗口的授权，再设置 VSCODE_EXECUTABLE_PATH；不会自动下载或升级 IDE。');
}
const testUserDataDir = mkdtempSync(join(tmpdir(), 'xv-'));
process.on('exit', () => rmSync(testUserDataDir, { recursive: true, force: true }));

export default defineConfig({
	useInstallation: { fromPath: executable },
	files: 'out/test/**/*.test.js',
	// Keep Extension Host tests deterministic in headless CI/Docker environments.
	// These flags do not change the extension runtime in a user's IDE.
	launchArgs: [`--user-data-dir=${testUserDataDir}`, '--disable-gpu', '--disable-dev-shm-usage'],
	mocha: { ui: 'bdd' },
});
