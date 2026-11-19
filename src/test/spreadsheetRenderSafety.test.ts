import * as assert from 'assert';
import { createXlsxRowHtml, renderCellContent } from '../webviews/spreadsheet/components/spreadsheetRenderComponent';
import * as Excel from 'exceljs';
import { getCellValueForDisplay } from '../spreadsheet/cellValue';

suite('表格渲染安全', () => {
    test('普通文本中的标签按文本显示', () => {
        const html = renderCellContent({ value: '<img src=x onerror=alert(1)>', cellType: 'text' }, false, false, false);
        assert.match(html, /&lt;img/);
        assert.doesNotMatch(html, /<img\b/i);
    });

    test('单元格属性中的引号不能创建事件属性', () => {
        const html = createXlsxRowHtml({
            rowData: { rowNumber: 1, cells: [{ rowNumber: 1, colNumber: 1, value: 'safe', originalColor: 'red" onmouseover="alert(1)' }] },
            rowIndex: 0, rowHeight: 24, columnCount: 1, columnWidths: [80], isPlainView: false, isEditMode: false, allowInteractiveControls: false
        });
        assert.doesNotMatch(html, /data-original-color="red"\s+onmouseover=/);
    });

    test('富文本既保留允许的格式，也转义内容；零和值 false 不丢失', () => {
        const sheet = new Excel.Workbook().addWorksheet('test');
        sheet.getCell('A1').value = { richText: [{ text: '<img>', font: { bold: true } }] };
        const richValue = getCellValueForDisplay(sheet.getCell('A1'));
        const html = renderCellContent({ value: richValue, cellType: 'text', isRichText: true }, false, false, false);
        assert.match(html, /<b>&lt;img&gt;<\/b>/);
        sheet.getCell('A2').value = 0;
        sheet.getCell('A3').value = false;
        assert.strictEqual(getCellValueForDisplay(sheet.getCell('A2')), '0');
        assert.strictEqual(getCellValueForDisplay(sheet.getCell('A3')), 'FALSE');
    });
});
