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

/** A textarea normalizes line endings; retain original bytes outside the actual edit. */
export function reconcileEditorLineEndings(previousSource: string, editorValue: string): string {
    const previous = previousSource.replace(/\r\n|\r/g, '\n');
    const value = editorValue.replace(/\r\n|\r/g, '\n');
    if (previous === value) return previousSource;

    let prefix = 0;
    while (prefix < previous.length && prefix < value.length && previous[prefix] === value[prefix]) prefix++;
    let previousEnd = previous.length;
    let valueEnd = value.length;
    while (previousEnd > prefix && valueEnd > prefix && previous[previousEnd - 1] === value[valueEnd - 1]) {
        previousEnd--;
        valueEnd--;
    }

    const rawOffset = (normalizedOffset: number): number => {
        let raw = 0;
        for (let normalized = 0; normalized < normalizedOffset && raw < previousSource.length; normalized++, raw++) {
            if (previousSource[raw] === '\r' && previousSource[raw + 1] === '\n') raw++;
        }
        return raw;
    };
    const start = rawOffset(prefix);
    const end = rawOffset(previousEnd);
    const before = previousSource.slice(0, start);
    const after = previousSource.slice(end);
    const preceding = before.match(/(?:\r\n|\r|\n)(?![\s\S]*(?:\r\n|\r|\n))/)?.[0];
    const following = after.match(/\r\n|\r|\n/)?.[0];
    const insertedNewline = preceding || following || '\n';
    return before + value.slice(prefix, valueEnd).replace(/\n/g, insertedNewline) + after;
}
