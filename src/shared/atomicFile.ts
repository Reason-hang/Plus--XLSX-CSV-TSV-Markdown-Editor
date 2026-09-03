import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function temporaryPathFor(filePath: string): string {
    const parsed = path.parse(filePath);
    return path.join(parsed.dir, `.${parsed.base}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
}

async function removeTemporaryFile(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
    } catch {
        // The temporary file may not have been created or may already be gone.
    }
}

/** Write a complete replacement beside the target, then atomically replace it. */
export async function writeFileAtomically(filePath: string, data: string | Buffer): Promise<void> {
    const temporaryPath = temporaryPathFor(filePath);
    try {
        await fs.promises.writeFile(temporaryPath, data);
        await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
        await removeTemporaryFile(temporaryPath);
        throw error;
    }
}

/** ExcelJS can only write a path, so it uses the same temporary-file replacement. */
export async function writeWorkbookAtomically(
    filePath: string,
    write: (temporaryPath: string) => Promise<void>
): Promise<void> {
    const temporaryPath = temporaryPathFor(filePath);
    try {
        await write(temporaryPath);
        await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
        await removeTemporaryFile(temporaryPath);
        throw error;
    }
}

export async function getFileFingerprint(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
}
