/*
 * Local markdown-it integration for KaTeX.
 *
 * The delimiter parser is based on the MIT-licensed markdown-it-katex
 * integration by Waylon Flinn. It is kept local so the extension can use the
 * maintained direct KaTeX dependency with an explicit trust=false boundary.
 */
// @ts-ignore
import katex from 'katex';

/* eslint-disable @typescript-eslint/no-explicit-any */

function isValidDelimiter(state: any, position: number) {
    const previous = position > 0 ? state.src.charCodeAt(position - 1) : -1;
    const next = position + 1 <= state.posMax ? state.src.charCodeAt(position + 1) : -1;
    let canOpen = true;
    let canClose = true;

    if (previous === 0x20 || previous === 0x09 || (next >= 0x30 && next <= 0x39)) {
        canClose = false;
    }
    if (next === 0x20 || next === 0x09) {
        canOpen = false;
    }

    return { canOpen, canClose };
}
function parseInlineMath(state: any, silent: boolean) {
    if (state.src[state.pos] !== '$') {
        return false;
    }

    const opening = isValidDelimiter(state, state.pos);
    if (!opening.canOpen) {
        if (!silent) {
            state.pending += '$';
        }
        state.pos += 1;
        return true;
    }

    const start = state.pos + 1;
    let match = start;
    while ((match = state.src.indexOf('$', match)) !== -1) {
        let position = match - 1;
        while (state.src[position] === '\\') {
            position -= 1;
        }
        if ((match - position) % 2 === 1) {
            break;
        }
        match += 1;
    }

    if (match === -1) {
        if (!silent) {
            state.pending += '$';
        }
        state.pos = start;
        return true;
    }

    if (match - start === 0) {
        if (!silent) {
            state.pending += '$$';
        }
        state.pos = start + 1;
        return true;
    }

    const closing = isValidDelimiter(state, match);
    if (!closing.canClose) {
        if (!silent) {
            state.pending += '$';
        }
        state.pos = start;
        return true;
    }

    if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.markup = '$';
        token.content = state.src.slice(start, match);
    }
    state.pos = match + 1;
    return true;
}

function parseBlockMath(state: any, startLine: number, endLine: number, silent: boolean) {
    let firstLine: string;
    let lastLine = '';
    let nextLine: number;
    let lastPosition: number | undefined;
    let found = false;
    const position = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];

    if (position + 2 > max || state.src.slice(position, position + 2) !== '$$') {
        return false;
    }
    if (silent) {
        return true;
    }

    firstLine = state.src.slice(position + 2, max);
    if (firstLine.trim().endsWith('$$')) {
        firstLine = firstLine.trim().slice(0, -2);
        found = true;
    }

    for (nextLine = startLine; !found; ) {
        nextLine += 1;
        if (nextLine >= endLine) {
            break;
        }

        const linePosition = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineMax = state.eMarks[nextLine];
        if (linePosition < lineMax && state.tShift[nextLine] < state.blkIndent) {
            break;
        }
        if (state.src.slice(linePosition, lineMax).trim().endsWith('$$')) {
            lastPosition = state.src.slice(linePosition, lineMax).lastIndexOf('$$');
            lastLine = state.src.slice(linePosition, linePosition + lastPosition);
            found = true;
        }
    }

    state.line = nextLine + 1;
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '') +
        state.getLines(startLine + 1, nextLine, state.tShift[startLine], true) +
        (lastLine && lastLine.trim() ? lastLine : '');
    token.map = [startLine, state.line];
    token.markup = '$$';
    return true;
}

function renderMath(latex: string, displayMode: boolean, escapeHtml: (value: string) => string): string {
    try {
        return katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            trust: false
        });
    } catch {
        return escapeHtml(latex);
    }
}

export default function markdownItKatex(md: any): void {
    md.inline.ruler.after('escape', 'math_inline', parseInlineMath);
    md.block.ruler.after('blockquote', 'math_block', parseBlockMath, {
        alt: ['paragraph', 'reference', 'blockquote', 'list']
    });
    md.renderer.rules.math_inline = (tokens: any[], index: number) => renderMath(tokens[index].content, false, md.utils.escapeHtml);
    md.renderer.rules.math_block = (tokens: any[], index: number) => `<p>${renderMath(tokens[index].content, true, md.utils.escapeHtml)}</p>\n`;
}
