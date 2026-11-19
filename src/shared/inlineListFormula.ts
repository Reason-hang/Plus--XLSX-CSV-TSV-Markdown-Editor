/** Excel's inline data-validation list has a 255-character formula limit. */
export function buildInlineListFormula(options: string[]): string {
    const values = options.map(value => value.replace(/[\r\n,]/g, ' ').trim());
    const formula = `"${values.map(value => value.replace(/"/g, '""')).join(',')}"`;
    if (formula.length > 255) {
        throw new Error('下拉选项总长度超过 Excel 内联列表的 255 字符限制；请减少或缩短选项。');
    }
    return formula;
}
