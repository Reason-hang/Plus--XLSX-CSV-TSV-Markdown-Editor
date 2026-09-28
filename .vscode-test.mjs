import { defineConfig } from '@vscode/test-cli';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testUserDataDir = mkdtempSync(join(tmpdir(), 'xv-'));
process.on('exit', () => rmSync(testUserDataDir, { recursive: true, force: true }));

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Keep Extension Host tests deterministic in headless CI/Docker environments.
	// These flags do not change the extension runtime in a user's IDE.
	launchArgs: [`--user-data-dir=${testUserDataDir}`, '--disable-gpu', '--disable-dev-shm-usage'],
	mocha: { ui: 'bdd' },
});
