/** The rendered DOM cannot preserve fenced source or literal tab layout on round-trip. */
export function hasUnsafePreviewEditSource(source: string): boolean {
    return /`{3,}|~{3,}/.test(source) || source.includes('\t');
}
