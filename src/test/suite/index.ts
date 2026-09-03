import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'bdd', color: true });
    const testsRoot = path.resolve(__dirname, '..');

    for (const file of fs.readdirSync(testsRoot)) {
        if (file.endsWith('.test.js') || file.endsWith('.extension.js')) {
            mocha.addFile(path.join(testsRoot, file));
        }
    }

    return new Promise((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} Extension Host tests failed.`));
                return;
            }
            resolve();
        });
    });
}
