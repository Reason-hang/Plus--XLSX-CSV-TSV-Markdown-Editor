/** The rendered DOM cannot preserve fenced source or literal tab layout on round-trip. */
export function hasUnsafePreviewEditSource(source: string): boolean {
    return /`{3,}|~{3,}/.test(source) || source.includes('\t');
}

/** Only permit an edited DOM round-trip when the untouched DOM reproduces the source. */
export function getPreviewEditTrailingNewlines(source: string, untouchedRoundTrip: string): string | null {
    if (source === untouchedRoundTrip) {
        return '';
    }
    const trailingNewlines = source.match(/\n+$/)?.[0] || '';
    return trailingNewlines && source.slice(0, -trailingNewlines.length) === untouchedRoundTrip
        ? trailingNewlines
        : null;
}
