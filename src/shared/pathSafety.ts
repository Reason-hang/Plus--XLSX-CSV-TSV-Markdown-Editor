import * as path from 'path';

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
