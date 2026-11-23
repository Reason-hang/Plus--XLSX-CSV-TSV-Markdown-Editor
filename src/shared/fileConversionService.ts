import * as fs from 'fs';
import * as path from 'path';
import * as Excel from 'exceljs';
import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { loadExcelWorkbook } from '../spreadsheet/spreadsheetUtilities';
import { resolveExcelCellValue } from '../spreadsheet/cellValue';
import { writeFileAtomically } from './atomicFile';

function getCsvDelimiter(): string {
    try {
        const config = vscode.workspace.getConfiguration('xlsxViewer');
        return config.get<string>('csv.separator', ',');
    } catch {
        // Fallback for environments where vscode configuration isn't available
    }
    return ',';
}


export type TabularFileType = string;

export interface TabularSheetData {
    name: string;
    rows: string[][];
}

export interface TabularWorkbookData {
    sheets: TabularSheetData[];
}

export interface DelimitedFileLimits {
    maxBytes: number;
    assertDimensions(rows: number, columns: number): void;
}

export class DelimitedFileLimitError extends Error {}

export interface TabularFileConverter {
    type: TabularFileType;
    label: string;
    extension: string;
    read(filePath: string, delimitedLimits?: DelimitedFileLimits): Promise<TabularWorkbookData>;
    write(filePath: string, workbook: TabularWorkbookData, delimitedLimits?: DelimitedFileLimits): Promise<void>;
}

const convertersByType = new Map<TabularFileType, TabularFileConverter>();
const convertersByExtension = new Map<string, TabularFileType>();
let builtInConvertersRegistered = false;

const BUILT_IN_TYPES = ['csv', 'tsv', 'xlsx'];

function normalizeExtension(extension: string): string {
    const trimmed = extension.trim().toLowerCase();
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function normalizeRows(rows: unknown): string[][] {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows.map(row => {
        if (!Array.isArray(row)) {
            return [];
        }

        return row.map(cell => {
            if (cell === null || cell === undefined) {
                return '';
            }
            return String(cell);
        });
    });
}

function normalizeWorkbook(workbook: TabularWorkbookData): TabularWorkbookData {
    const sheets = Array.isArray(workbook?.sheets) ? workbook.sheets : [];

    if (!sheets.length) {
        return {
            sheets: [{ name: 'Sheet1', rows: [] }]
        };
    }

    return {
        sheets: sheets.map((sheet, index) => ({
            name: sheet?.name?.trim() || `Sheet${index + 1}`,
            rows: normalizeRows(sheet?.rows)
        }))
    };
}

function parseDelimitedText(content: string, delimiter: string, quotedCells?: boolean[][], limits?: DelimitedFileLimits): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let rowQuotes: boolean[] = [];
    let field = '';
    let inQuotes = false;
    let fieldQuoted = false;
    let maxColumns = 0;

    const pushField = () => {
        if (limits) {
            maxColumns = Math.max(maxColumns, row.length + 1);
            limits.assertDimensions(rows.length + 1, maxColumns);
        }
        row.push(field);
        if (quotedCells) {
            rowQuotes.push(fieldQuoted);
        }
        field = '';
        fieldQuoted = false;
    };

    const pushRow = () => {
        pushField();
        rows.push(row);
        quotedCells?.push(rowQuotes);
        row = [];
        rowQuotes = [];
    };

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];

        if (ch === '"' && (inQuotes || field.length === 0)) {
            if (inQuotes && i + 1 < content.length && content[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                if (!inQuotes) {
                    fieldQuoted = true;
                }
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && ch === delimiter) {
            pushField();
            continue;
        }

        if (!inQuotes && (ch === '\n' || ch === '\r')) {
            if (ch === '\r' && content[i + 1] === '\n') {
                i++;
            }
            pushRow();
            continue;
        }

        field += ch;
    }

    if (field.length > 0 || row.length > 0 || fieldQuoted) {
        pushRow();
    }

    return rows;
}

function assertDelimitedByteCount(byteCount: number, maxBytes: number): void {
    if (byteCount > maxBytes) {
        throw new DelimitedFileLimitError(`CSV/TSV 超过表格视图的 ${maxBytes / (1024 * 1024)} MiB 文件上限。`);
    }
}

export async function readDelimitedFileBytes(filePath: string, maxBytes: number): Promise<Buffer> {
    const file = await fs.promises.open(filePath, 'r');
    try {
        assertDelimitedByteCount((await file.stat()).size, maxBytes);
        const chunks: Buffer[] = [];
        let total = 0;
        while (total <= maxBytes) {
            const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - total + 1));
            const { bytesRead } = await file.read(chunk, 0, chunk.length, total);
            if (!bytesRead) {
                break;
            }
            total += bytesRead;
            assertDelimitedByteCount(total, maxBytes);
            chunks.push(chunk.subarray(0, bytesRead));
        }
        return Buffer.concat(chunks, total);
    } finally {
        await file.close();
    }
}

function serializeDelimitedRows(rows: string[][], delimiter: string, newline = '\n', finalNewline = true, quotedCells?: boolean[][]): string {
    if (!rows.length) {
        return '';
    }

    const escapedRows = rows.map((row, rowIndex) => {
        const safeRow = Array.isArray(row) ? row : [];
        return safeRow.map((cell, cellIndex) => {
            const value = cell === null || cell === undefined ? '' : String(cell);
            const shouldQuote = quotedCells?.[rowIndex]?.[cellIndex] || value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
            if (!shouldQuote) {
                return value;
            }
            return `"${value.replace(/"/g, '""')}"`;
        }).join(delimiter);
    });

    return escapedRows.join(newline) + (finalNewline ? newline : '');
}

function decodeDelimitedFile(bytes: Buffer): { content: string; bom: boolean; newline: string; finalNewline: boolean } {
    let decoded: string;
    try {
        decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
        throw new Error('CSV/TSV 文件不是有效的 UTF-8；已拒绝编辑保存，请先在外部工具中确认编码。');
    }
    const bom = decoded.startsWith('\uFEFF');
    const content = bom ? decoded.slice(1) : decoded;
    const newline = content.includes('\r\n') ? '\r\n' : content.includes('\r') ? '\r' : '\n';
    return { content, bom, newline, finalNewline: /(?:\r\n|\r|\n)$/.test(content) };
}

function rowsEqual(left: string[][], right: string[][]): boolean {
    return left.length === right.length && left.every((row, index) =>
        row.length === right[index].length && row.every((cell, cellIndex) => cell === right[index][cellIndex]));
}

function getExcelCellValueAsString(cell: Excel.Cell): string {
    const value = resolveExcelCellValue(cell.value);

    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'object') {
        const objectValue = value as {
            text?: unknown;
            richText?: Array<{ text?: unknown }>;
        };

        if (typeof objectValue.text === 'string') {
            return objectValue.text;
        }

        if (Array.isArray(objectValue.richText)) {
            return objectValue.richText
                .map(part => typeof part?.text === 'string' ? part.text : '')
                .join('');
        }
    }

    return String(value);
}

function sanitizeWorksheetName(name: string, index: number, usedNames: Set<string>): string {
    let base = (name || `Sheet${index + 1}`).replace(/[\\/*?:\[\]]/g, ' ').trim();
    if (!base) {
        base = `Sheet${index + 1}`;
    }
    if (base.length > 31) {
        base = base.slice(0, 31);
    }

    let candidate = base;
    let suffix = 1;

    while (usedNames.has(candidate.toLowerCase())) {
        const suffixText = ` (${suffix})`;
        const maxBaseLength = Math.max(1, 31 - suffixText.length);
        candidate = `${base.slice(0, maxBaseLength)}${suffixText}`;
        suffix++;
    }

    usedNames.add(candidate.toLowerCase());
    return candidate;
}

function createDelimitedConverter(type: string, label: string, defaultDelimiter: string): TabularFileConverter {
    return {
        type,
        label,
        extension: type,
        async read(filePath: string, limits?: DelimitedFileLimits): Promise<TabularWorkbookData> {
            const bytes = limits ? await readDelimitedFileBytes(filePath, limits.maxBytes) : await fs.promises.readFile(filePath);
            const { content } = decodeDelimitedFile(bytes);
            let delimiter = defaultDelimiter;
            if (type === 'csv') {
                delimiter = getCsvDelimiter();
            }
            return {
                sheets: [{
                    name: 'Sheet1',
                    rows: parseDelimitedText(content, delimiter, undefined, limits)
                }]
            };
        },
        async write(filePath: string, workbook: TabularWorkbookData, limits?: DelimitedFileLimits): Promise<void> {
            const normalized = normalizeWorkbook(workbook);
            const rows = normalized.sheets[0]?.rows ?? [];
            let delimiter = defaultDelimiter;
            if (type === 'csv') {
                delimiter = getCsvDelimiter();
            }
            let format = { bom: false, newline: '\n', finalNewline: true };
            let quotedCells: boolean[][] | undefined;
            try {
                const originalBytes = limits ? await readDelimitedFileBytes(filePath, limits.maxBytes) : await fs.promises.readFile(filePath);
                const original = decodeDelimitedFile(originalBytes);
                quotedCells = [];
                const originalRows = parseDelimitedText(original.content, delimiter, quotedCells, limits);
                if (rowsEqual(originalRows, rows)) {
                    return; // Style-only or no-op save must not rewrite user bytes.
                }
                if (serializeDelimitedRows(originalRows, delimiter, original.newline, original.finalNewline, quotedCells) !== original.content) {
                    throw new Error('CSV/TSV 原文包含无法保真重写的引号或换行格式，已拒绝覆盖；请先另存为规范 UTF-8 文件。');
                }
                format = original;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
            const content = (format.bom ? '\uFEFF' : '') +
                serializeDelimitedRows(rows, delimiter, format.newline, format.finalNewline, quotedCells);
            if (limits) {
                assertDelimitedByteCount(Buffer.byteLength(content, 'utf8'), limits.maxBytes);
            }
            await writeFileAtomically(filePath, temporaryPath => fs.promises.writeFile(temporaryPath, content, 'utf8'));
        }
    };
}

function createXlsxConverter(): TabularFileConverter {
    return {
        type: 'xlsx',
        label: 'XLSX',
        extension: 'xlsx',
        async read(filePath: string): Promise<TabularWorkbookData> {
            const workbook = new Excel.Workbook();
            await loadExcelWorkbook(filePath, workbook);

            const sheets = workbook.worksheets.map((worksheet, index) => {
                let maxRow = 0;
                let maxCol = 0;
                let populatedCellCount = 0;

                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    maxRow = Math.max(maxRow, rowNumber);
                    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        maxCol = Math.max(maxCol, colNumber);
                        if (cell.value !== null && cell.value !== undefined) {
                            populatedCellCount++;
                        }
                    });
                });

                const rangeSize = maxRow * maxCol;
                const isTooLarge = maxRow > 100_000 || maxCol > 10_000 || rangeSize > 5_000_000;
                const isTooSparse = rangeSize > 500_000 && populatedCellCount * 20 < rangeSize;
                if (isTooLarge || isTooSparse) {
                    throw new Error(
                        `工作表“${worksheet.name}”的有效范围过大或过于稀疏（${maxRow} 行 × ${maxCol} 列），已停止读取以避免占满内存。`
                    );
                }

                const rows: string[][] = [];
                for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
                    const row: string[] = [];
                    for (let colNumber = 1; colNumber <= maxCol; colNumber++) {
                        const cell = worksheet.getRow(rowNumber).getCell(colNumber);
                        row.push(getExcelCellValueAsString(cell));
                    }
                    rows.push(row);
                }

                return {
                    name: worksheet.name || `Sheet${index + 1}`,
                    rows
                };
            });

            return {
                sheets: sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]
            };
        },
        async write(filePath: string, workbookData: TabularWorkbookData): Promise<void> {
            const normalized = normalizeWorkbook(workbookData);
            const workbook = new Excel.Workbook();
            const usedNames = new Set<string>();

            for (let index = 0; index < normalized.sheets.length; index++) {
                const sheet = normalized.sheets[index];
                const sheetName = sanitizeWorksheetName(sheet.name, index, usedNames);
                const worksheet = workbook.addWorksheet(sheetName);
                const rows = normalizeRows(sheet.rows);
                if (rows.length > 0) {
                    worksheet.addRows(rows);
                }
            }

            await writeFileAtomically(filePath, temporaryPath => workbook.xlsx.writeFile(temporaryPath));
        }
    };
}

function ensureBuiltInConvertersRegistered(): void {
    if (builtInConvertersRegistered) {
        return;
    }

    registerTabularFileConverter(createDelimitedConverter('csv', 'CSV', ','));
    registerTabularFileConverter(createDelimitedConverter('tsv', 'TSV', '\t'));
    registerTabularFileConverter(createXlsxConverter());
    builtInConvertersRegistered = true;
}

function getConverterForType(type: TabularFileType): TabularFileConverter {
    ensureBuiltInConvertersRegistered();
    const converter = convertersByType.get(type);
    if (!converter) {
        throw new Error(`No converter registered for "${type}"`);
    }
    return converter;
}

export function registerTabularFileConverter(converter: TabularFileConverter): void {
    const normalizedConverter: TabularFileConverter = {
        ...converter,
        extension: normalizeExtension(converter.extension).slice(1)
    };

    convertersByType.set(normalizedConverter.type, normalizedConverter);
    convertersByExtension.set(normalizeExtension(normalizedConverter.extension), normalizedConverter.type);
}

export function detectTabularFileType(filePath: string): TabularFileType | undefined {
    ensureBuiltInConvertersRegistered();
    return convertersByExtension.get(path.extname(filePath).toLowerCase());
}

export function getTabularFileTypeInfo(type: TabularFileType): { type: TabularFileType; label: string; extension: string } {
    const converter = getConverterForType(type);
    return {
        type: converter.type,
        label: converter.label,
        extension: converter.extension
    };
}

export function getSupportedTabularFileTypes(): TabularFileType[] {
    ensureBuiltInConvertersRegistered();

    const prioritized = BUILT_IN_TYPES.filter(type => convertersByType.has(type));
    const additional = Array.from(convertersByType.keys()).filter(type => !BUILT_IN_TYPES.includes(type));

    return [...prioritized, ...additional];
}

export function getTargetTabularFileTypes(sourceType: TabularFileType): TabularFileType[] {
    return getSupportedTabularFileTypes().filter(type => type !== sourceType);
}

export async function readTabularFile(filePath: string, sourceType?: TabularFileType, delimitedLimits?: DelimitedFileLimits): Promise<{ type: TabularFileType; workbook: TabularWorkbookData }> {
    const type = sourceType ?? detectTabularFileType(filePath);
    if (!type) {
        throw new Error(`Unsupported file extension for "${filePath}"`);
    }

    const converter = getConverterForType(type);
    return {
        type,
        workbook: await converter.read(filePath, delimitedLimits)
    };
}

export async function writeTabularFile(filePath: string, workbook: TabularWorkbookData, targetType?: TabularFileType, delimitedLimits?: DelimitedFileLimits): Promise<TabularFileType> {
    const type = targetType ?? detectTabularFileType(filePath);
    if (!type) {
        throw new Error(`Unsupported file extension for "${filePath}"`);
    }

    const converter = getConverterForType(type);
    await converter.write(filePath, workbook, delimitedLimits);
    return type;
}

export async function convertTabularFile(options: {
    sourcePath: string;
    targetPath: string;
    sourceType?: TabularFileType;
    targetType?: TabularFileType;
}): Promise<{
    sourceType: TabularFileType;
    targetType: TabularFileType;
    sourceSheetCount: number;
    droppedSheets: boolean;
}> {
    const { sourcePath, targetPath, sourceType, targetType } = options;

    const source = await readTabularFile(sourcePath, sourceType);
    const resolvedTargetType = targetType ?? detectTabularFileType(targetPath);

    if (!resolvedTargetType) {
        throw new Error(`Unsupported target file extension for "${targetPath}"`);
    }

    const normalizedWorkbook = normalizeWorkbook(source.workbook);
    const sourceSheetCount = normalizedWorkbook.sheets.length;
    const supportsMultipleSheets = resolvedTargetType === 'xlsx';
    const droppedSheets = !supportsMultipleSheets && sourceSheetCount > 1;

    const workbookForTarget = droppedSheets
        ? { sheets: [normalizedWorkbook.sheets[0]] }
        : normalizedWorkbook;

    await writeTabularFile(targetPath, workbookForTarget, resolvedTargetType);

    return {
        sourceType: source.type,
        targetType: resolvedTargetType,
        sourceSheetCount,
        droppedSheets
    };
}
