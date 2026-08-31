import * as Excel from 'exceljs';

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Convert an ExcelJS cell to the display representation used by the
 * spreadsheet Webview. Rich-text markup is generated only from validated
 * ExcelJS values; ordinary values remain plain text and are escaped later by
 * the Webview renderer.
 */
export function getCellValueForDisplay(cell: Excel.Cell): string {
    if (!cell || cell.value === null || cell.value === undefined) {
        return '';
    }

    // Some ExcelJS hyperlink cells expose the URL via cell.hyperlink even when
    // cell.type is not Hyperlink. Keep showing the displayed text/value.
    const anyCell = cell as any;
    if (typeof anyCell.hyperlink === 'string' && anyCell.hyperlink) {
        const value = cell.value as any;
        if (typeof value === 'string') {
            return value;
        }
        if (value && typeof value === 'object' && typeof value.text === 'string') {
            return value.text;
        }
    }

    if (cell.type === Excel.ValueType.Hyperlink) {
        const hyperlinkValue = cell.value as Excel.CellHyperlinkValue;
        return hyperlinkValue.text || '';
    }

    if (cell.type === Excel.ValueType.Formula) {
        return cell.result === null || cell.result === undefined ? '' : String(cell.result);
    }

    if (cell.type === Excel.ValueType.RichText) {
        const richTextValue = cell.value as Excel.CellRichTextValue;
        if (!Array.isArray(richTextValue.richText)) {
            return '';
        }

        return richTextValue.richText.map((run: any) => {
            let text = escapeHtml(typeof run?.text === 'string' ? run.text : String(run?.text ?? ''));
            const font = run?.font;
            if (!font) {
                return text;
            }

            if (font.bold) {
                text = `<b>${text}</b>`;
            }
            if (font.italic) {
                text = `<i>${text}</i>`;
            }

            const argb = typeof font.color?.argb === 'string' ? font.color.argb : '';
            if (/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(argb)) {
                const hex = `#${argb.length === 8 ? argb.substring(2) : argb}`;
                text = `<span style="color: ${hex};">${text}</span>`;
            }

            return text;
        }).join('');
    }

    if (cell.type === Excel.ValueType.Date || cell.value instanceof Date) {
        return (cell.value as Date).toLocaleDateString(undefined, { timeZone: 'UTC' });
    }

    if (typeof cell.value === 'boolean') {
        return cell.value ? 'TRUE' : 'FALSE';
    }

    return String(cell.value);
}
