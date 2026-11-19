export type HeadingTarget = { id: string; text: string };

function normalizeLabel(text: string): string {
    return text.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

function withoutTrailingQualifier(text: string): string {
    return text.replace(/\s*[（(][^（）()]*[）)]\s*$/u, '');
}

/** Resolve only an exact ID or a unique normalized heading; never guess among duplicates. */
export function resolveHeadingId(fragment: string, linkLabel: string, headings: HeadingTarget[]): string | null {
    let decoded = fragment;
    try {
        decoded = decodeURIComponent(fragment);
    } catch {
        return null;
    }
    const exact = headings.find(heading => heading.id === decoded);
    if (exact) return exact.id;

    for (const value of [decoded, linkLabel]) {
        const target = normalizeLabel(value);
        if (!target) continue;
        const matches = headings.filter(heading =>
            normalizeLabel(heading.text) === target ||
            normalizeLabel(withoutTrailingQualifier(heading.text)) === target
        );
        if (matches.length === 1) return matches[0].id;
        if (matches.length > 1) return null;
    }
    return null;
}
