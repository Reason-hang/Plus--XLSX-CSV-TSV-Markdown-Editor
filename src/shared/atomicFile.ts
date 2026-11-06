import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export async function writeFileAtomically(
    filePath: string,
    writer: (temporaryPath: string) => Promise<void>
): Promise<void> {
    const requestedPath = path.resolve(filePath);
    let targetPath = requestedPath;
    try {
        if ((await fs.promises.lstat(requestedPath)).isSymbolicLink()) {
            targetPath = await fs.promises.realpath(requestedPath);
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        // A dangling symlink must not be replaced with a regular file.
        const link = await fs.promises.lstat(requestedPath).catch(() => null);
        if (link?.isSymbolicLink()) {
            throw new Error('无法保存：文件符号链接的目标不存在。');
        }
    }
    const temporaryPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`
    );

    let originalMode: number | undefined;
    try {
        const stat = await fs.promises.stat(targetPath);
        if (stat.nlink > 1) {
            throw new Error('无法原子保存具有多个硬链接的文件，请先另存为独立文件。');
        }
        originalMode = stat.mode & 0o777;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }

    try {
        await writer(temporaryPath);
        if (originalMode !== undefined) {
            await fs.promises.chmod(temporaryPath, originalMode);
        }
        await fs.promises.rename(temporaryPath, targetPath);
    } catch (error) {
        try {
            await fs.promises.unlink(temporaryPath);
        } catch {
            // The temporary file may not have been created.
        }
        throw error;
    }
}

export function writeTextFileAtomically(filePath: string, content: string): Promise<void> {
    return writeFileAtomically(filePath, temporaryPath => fs.promises.writeFile(temporaryPath, content, 'utf8'));
}

export function writeBufferFileAtomically(filePath: string, content: Buffer): Promise<void> {
    return writeFileAtomically(filePath, temporaryPath => fs.promises.writeFile(temporaryPath, content));
}
