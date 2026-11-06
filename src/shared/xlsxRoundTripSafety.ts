import * as fs from 'fs';
import JSZip from 'jszip';

/** ExcelJS cannot round-trip these OOXML features when it rewrites a workbook. */
export async function assertXlsxRoundTripSupported(filePath: string): Promise<void> {
    const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath));
    const unsupported = Object.keys(zip.files).find(name =>
        /^(?:xl\/(?:charts|pivotTables|pivotCache|slicers|slicerCaches|externalLinks|activeX|ctrlProps)\/|xl\/vbaProject\.bin$)/i.test(name));
    if (unsupported) {
        throw new Error(`此工作簿包含插件无法保真保存的 Excel 功能（${unsupported}）。已拒绝覆盖，请使用 Excel 或兼容软件编辑。`);
    }
}
