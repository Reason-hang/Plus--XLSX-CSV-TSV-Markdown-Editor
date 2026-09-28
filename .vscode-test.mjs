import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Keep Extension Host tests deterministic in headless CI/Docker environments.
	// These flags do not change the extension runtime in a user's IDE.
	launchArgs: ['--disable-gpu', '--disable-dev-shm-usage'],
	mocha: { ui: 'bdd' },
});
