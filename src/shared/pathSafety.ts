import * as path from 'path';
import * as fs from 'fs';

/**
 * Check lexical containment of a candidate path under an allowed root.
 * Callers still need to account for symlinks when a stronger filesystem trust
 * boundary is required; this helper prevents ordinary ../ traversal.
 */
export function isPathWithin(root: string, candidate: string): boolean {
    if (!root || !candidate) {
        return false;
    }

    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

/**
 * Check containment after resolving symlinks. For a not-yet-existing target,
 * resolve its nearest existing parent so a missing file cannot escape through a
 * symlinked directory later created by another process.
 */
export async function isPathWithinRealpath(root: string, candidate: string): Promise<boolean> {
    if (!root || !candidate) {
        return false;
    }

    const resolveExistingPath = async (target: string): Promise<string> => {
        const normalized = path.resolve(target);
        try {
            return await fs.promises.realpath(normalized);
        } catch {
            const parent = path.dirname(normalized);
            if (parent === normalized) {
                return normalized;
            }
            const realParent = await resolveExistingPath(parent);
            return path.join(realParent, path.basename(normalized));
        }
    };

    try {
        const [realRoot, realCandidate] = await Promise.all([
            resolveExistingPath(root),
            resolveExistingPath(candidate)
        ]);
        return isPathWithin(realRoot, realCandidate);
    } catch {
        return false;
    }
}
