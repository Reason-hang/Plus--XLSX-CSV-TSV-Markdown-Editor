export interface PreviewBlockRange {
    line: number;
    start: number;
    end: number;
    tag: string;
}

interface EditableRange {
    start: number;
    end: number;
    original: string;
    path: number[];
}

export interface PreviewSourceMapping {
    source: string;
    key: string;
    baseline: HTMLElement;
    previewBaselineHtml: string;
    ranges: EditableRange[];
    accepted: string[];
    composing: boolean;
}

function nodePath(root: Node, node: Node): number[] | null {
    const path: number[] = [];
    while (node !== root) {
        const parent: ParentNode | null = node.parentNode;
        if (!parent) return null;
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
        node = parent as Node;
    }
    return path;
}

function nodeAtPath(root: Node, path: number[]): Node | null {
    let node: Node = root;
    for (const index of path) {
        if (!node.childNodes[index]) return null;
        node = node.childNodes[index];
    }
    return node;
}

function findBlock(root: HTMLElement, block: PreviewBlockRange): HTMLElement | null {
    const matches = root.querySelectorAll<HTMLElement>(`${block.tag}[data-line="${block.line}"]`);
    return matches.length === 1 ? matches[0] : null;
}

/** Map only uniquely identifiable, literal text nodes within known source blocks. */
export function preparePreviewSourceMapping(
    preview: HTMLElement,
    canonical: HTMLElement,
    source: string,
    blocks: PreviewBlockRange[],
    previewBaselineHtml: string
): PreviewSourceMapping {
    const candidates: Array<EditableRange & { live: Node }> = [];
    const excluded = 'a.heading-anchor, button, input, textarea, select, pre, code, svg, math, .katex, .mermaid, .code-block, [contenteditable="false"]';

    for (const block of blocks) {
        const baselineBlock = findBlock(canonical, block);
        const liveBlock = findBlock(preview, block);
        if (!baselineBlock || !liveBlock) continue;
        const raw = source.slice(block.start, block.end);
        const walker = document.createTreeWalker(baselineBlock, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
            const value = textNode.nodeValue || '';
            const parent = textNode.parentElement;
            if (!value.trim() || /[\r\n\t]/.test(value) || !parent || parent.closest(excluded)) continue;
            const offset = raw.indexOf(value);
            if (offset < 0 || raw.lastIndexOf(value) !== offset) continue;
            const relative = nodePath(baselineBlock, textNode);
            const path = nodePath(canonical, textNode);
            const live = relative && nodeAtPath(liveBlock, relative);
            if (!path || !live || live.nodeType !== Node.TEXT_NODE || live.nodeValue !== value) continue;
            candidates.push({ start: block.start + offset, end: block.start + offset + value.length, original: value, path, live });
        }
    }

    // A visible fragment may also be a substring of a different mapped fragment.
    // Ambiguous overlaps must never choose a source range by accident.
    const ordered = candidates.map((item, index) => ({ ...item, index })).sort((a, b) => a.start - b.start || b.end - a.end);
    const ambiguous = new Set<number>();
    let furthest: typeof ordered[number] | null = null;
    for (const item of ordered) {
        if (furthest && item.start < furthest.end) {
            ambiguous.add(item.index);
            ambiguous.add(furthest.index);
        }
        if (!furthest || item.end > furthest.end) furthest = item;
    }
    const safe = candidates.filter((_item, index) => !ambiguous.has(index));
    const key = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ranges: EditableRange[] = [];
    for (const item of safe) {
        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-preview-source-key', key);
        wrapper.setAttribute('data-preview-source-index', String(ranges.length));
        wrapper.setAttribute('contenteditable', 'plaintext-only');
        item.live.parentNode?.insertBefore(wrapper, item.live);
        wrapper.appendChild(item.live);
        ranges.push({ start: item.start, end: item.end, original: item.original, path: item.path });
    }
    return { source, key, baseline: canonical, previewBaselineHtml, ranges, accepted: ranges.map(range => range.original), composing: false };
}

export function unwrapPreviewSourceRanges(root: HTMLElement, mapping: PreviewSourceMapping | null): void {
    if (!mapping) return;
    root.querySelectorAll<HTMLElement>(`[data-preview-source-key="${mapping.key}"]`).forEach(wrapper => {
        wrapper.replaceWith(...Array.from(wrapper.childNodes));
    });
    root.normalize();
}

export function previewSourceValues(preview: HTMLElement, mapping: PreviewSourceMapping): string[] | null {
    const wrappers = preview.querySelectorAll<HTMLElement>(`[data-preview-source-key="${mapping.key}"]`);
    if (wrappers.length !== mapping.ranges.length) return null;
    const values: Array<string | undefined> = new Array(mapping.ranges.length);
    for (const wrapper of Array.from(wrappers)) {
        const index = Number(wrapper.getAttribute('data-preview-source-index'));
        if (!Number.isInteger(index) || index < 0 || index >= values.length || values[index] !== undefined) return null;
        if (wrapper.childElementCount) {
            const copy = wrapper.cloneNode(true) as HTMLElement;
            copy.querySelectorAll('mark.search-highlight').forEach(node => node.replaceWith(...Array.from(node.childNodes)));
            if (Array.from(copy.childNodes).some(node => node.nodeType !== Node.TEXT_NODE)) return null;
        } else if (Array.from(wrapper.childNodes).some(node => node.nodeType !== Node.TEXT_NODE)) return null;
        if (/[\r\n\t]/.test(wrapper.textContent || '')) return null;
        values[index] = wrapper.textContent || '';
    }
    return values.every(value => value !== undefined) ? values as string[] : null;
}

/** Replace mapped ranges only after the entire new rendering matches the requested text edits. */
export function mappedPreviewDraft(
    preview: HTMLElement,
    mapping: PreviewSourceMapping,
    render: (source: string) => HTMLElement,
    comparableHtml: (root: HTMLElement) => string
): string | null {
    const values = previewSourceValues(preview, mapping);
    if (!values) return null;
    const changed = mapping.ranges.map((range, index) => ({ ...range, value: values[index] }))
        .filter(range => range.value !== range.original);
    if (!changed.length) return mapping.source;

    let candidate = mapping.source;
    for (const range of [...changed].sort((a, b) => b.start - a.start)) {
        candidate = candidate.slice(0, range.start) + range.value + candidate.slice(range.end);
    }
    const expected = mapping.baseline.cloneNode(true) as HTMLElement;
    for (const range of changed) {
        const node = nodeAtPath(expected, range.path);
        if (!node || node.nodeType !== Node.TEXT_NODE) return null;
        node.nodeValue = range.value;
    }
    return comparableHtml(expected) === comparableHtml(render(candidate)) ? candidate : null;
}
