import * as fs from 'fs';
import { createHash } from 'crypto';

export function hashBuffer(buffer: Uint8Array): string {
    return createHash('sha256').update(buffer).digest('hex');
}

export async function hashFile(filePath: string): Promise<string> {
    return hashBuffer(await fs.promises.readFile(filePath));
}
