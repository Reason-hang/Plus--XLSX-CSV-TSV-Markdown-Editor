import * as fs from 'fs';
import JSZip from 'jszip';

function unsupportedFeature(part: string): Error {
    return new Error(`此工作簿包含插件无法保真保存的 Excel 功能（${part}）。已拒绝覆盖，请使用 Excel 或兼容软件编辑。`);
}

/** ExcelJS cannot round-trip these OOXML features when it rewrites a workbook. */
export async function assertXlsxRoundTripSupported(filePath: string): Promise<string[]> {
    const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath));
    const parts = Object.values(zip.files).filter(entry => !entry.dir);
    const unsupported = parts.find(part =>
        /^(?:customXml\/|xl\/(?:charts|pivotTables|pivotCache|slicers|slicerCaches|externalLinks|activeX|ctrlProps|richData|threadedComments|embeddings)\/|xl\/vbaProject\.bin$)/i.test(part.name));
    if (unsupported) {
        throw unsupportedFeature(unsupported.name);
    }

    for (const part of parts) {
        if (/^xl\/worksheets\/[^/]+\.xml$/i.test(part.name) && /<(?:[\w.-]+:)?extLst[\s/>]/.test(await part.async('string'))) {
            throw unsupportedFeature(`${part.name} 的 extLst`);
        }
    }
    return parts.map(part => part.name);
}

export async function assertXlsxPartsPreserved(originalParts: string[], rewrittenPath: string): Promise<void> {
    const rewritten = await JSZip.loadAsync(await fs.promises.readFile(rewrittenPath));
    // The shared text table can be absent when the last shared string is replaced.
    const missing = originalParts.find(part => part !== 'xl/sharedStrings.xml' && !rewritten.file(part));
    if (missing) {
        throw unsupportedFeature(`保存时会丢失 ${missing}`);
    }
}
