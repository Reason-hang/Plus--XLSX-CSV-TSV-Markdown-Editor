export type WebviewSurface = 'markdown' | 'spreadsheet';

export interface WebviewMessageValidationResult {
    ok: boolean;
    errorCode?: string;
    message?: string;
}

export const WEBVIEW_LIMITS = {
    maxMessageBytes: 12 * 1024 * 1024,
    maxSettingsBytes: 256 * 1024,
    maxMarkdownContentBytes: 8 * 1024 * 1024,
    maxImageSources: 256,
    maxSourceLength: 4096,
    maxPdfBase64Chars: 16 * 1024 * 1024,
    maxPdfBytes: 12 * 1024 * 1024,
    maxFeedbackFields: 32,
    maxFeedbackFieldLength: 4096,
    maxFeedbackBodyBytes: 32 * 1024,
    maxEdits: 5000,
    maxRichEdits: 5000,
    maxStyleEdits: 5000,
    maxOperations: 500,
    maxRichTextRuns: 200,
    maxCellTextBytes: 256 * 1024,
    maxCoordinate: 1_048_576,
    maxColumnCoordinate: 16_384,
    maxMergeArea: 1_000_000,
    maxDropdownOptions: 80,
    maxDropdownOptionLength: 256,
    maxRequestIdLength: 128,
    maxVersionIdLength: 256,
    maxUrlLength: 8192,
    maxOperationBytes: 256 * 1024
} as const;

const MARKDOWN_COMMANDS = new Set([
    'cancelVersionPreview',
    'disableMdEditor',
    'enableMdEditor',
    'getSystemDetails',
    'openExternal',
    'openRelativeFile',
    'requestFreshData',
    'resolveImageUris',
    'restoreVersion',
    'saveMarkdown',
    'savePdfData',
    'showVersionHistory',
    'submitFeedback',
    'toggleMdAssociation',
    'toggleView',
    'updateSettings',
    'webviewReady'
]);

const SPREADSHEET_COMMANDS = new Set([
    'cancelVersionPreview',
    'convertFile',
    'disableDefaultEditor',
    'enableAsDefault',
    'enableDefaultEditor',
    'getRows',
    'getSystemDetails',
    'openExternal',
    'requestFreshData',
    'requestStyleMode',
    'restoreVersion',
    'saveXlsxEdits',
    'setPreferredViewMode',
    'showVersionHistory',
    'styleModeDecision',
    'submitFeedback',
    'toggleView',
    'updateSettings',
    'webviewReady'
]);

const OPERATION_TYPES = new Set([
    'insertRowAbove',
    'insertRowBelow',
    'deleteRow',
    'insertColumnLeft',
    'insertColumnRight',
    'deleteColumn',
    'insertCellShiftRight',
    'insertCellShiftDown',
    'deleteCellShiftLeft',
    'deleteCellShiftUp',
    'mergeRange',
    'unmergeRange',
    'insertControl'
]);

type MessageRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MessageRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function reject(errorCode: string, message: string): WebviewMessageValidationResult {
    return { ok: false, errorCode, message };
}

function pass(): WebviewMessageValidationResult {
    return { ok: true };
}

function byteLength(value: string): number {
    return Buffer.byteLength(value, 'utf8');
}

function validateString(
    value: unknown,
    field: string,
    maxBytes: number,
    required = true
): WebviewMessageValidationResult {
    if (value === undefined && !required) {
        return pass();
    }
    if (typeof value !== 'string') {
        return reject('WEBVIEW_FIELD_INVALID', `${field} 必须是字符串。`);
    }
    if (byteLength(value) > maxBytes) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `${field} 超过 ${maxBytes} 字节限制。`);
    }
    return pass();
}

function validateFiniteInteger(value: unknown, field: string, min: number, max: number): WebviewMessageValidationResult {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        return reject('WEBVIEW_COORDINATE_INVALID', `${field} 必须是 ${min} 到 ${max} 之间的有限整数。`);
    }
    return pass();
}

function validateCoordinate(record: MessageRecord, required = true): WebviewMessageValidationResult {
    const hasRow = Object.prototype.hasOwnProperty.call(record, 'row');
    const hasCol = Object.prototype.hasOwnProperty.call(record, 'col');
    if (!hasRow && !hasCol && !required) {
        return pass();
    }
    if (!hasRow || !hasCol) {
        return reject('WEBVIEW_FIELD_INVALID', 'row 和 col 必须同时提供。');
    }
    const row = validateFiniteInteger(record.row, 'row', 1, WEBVIEW_LIMITS.maxCoordinate);
    if (!row.ok) {return row;}
    return validateFiniteInteger(record.col, 'col', 1, WEBVIEW_LIMITS.maxColumnCoordinate);
}

function validateMerge(record: MessageRecord): WebviewMessageValidationResult {
    const fields: Array<[string, number]> = [
        ['startRow', WEBVIEW_LIMITS.maxCoordinate],
        ['startCol', WEBVIEW_LIMITS.maxColumnCoordinate],
        ['endRow', WEBVIEW_LIMITS.maxCoordinate],
        ['endCol', WEBVIEW_LIMITS.maxColumnCoordinate]
    ];
    for (const [field, max] of fields) {
        const result = validateFiniteInteger(record[field], field, 1, max);
        if (!result.ok) {return result;}
    }

    const startRow = record.startRow as number;
    const startCol = record.startCol as number;
    const endRow = record.endRow as number;
    const endCol = record.endCol as number;
    if (endRow < startRow || endCol < startCol) {
        return reject('WEBVIEW_COORDINATE_INVALID', '合并范围的结束坐标不能小于开始坐标。');
    }
    if ((endRow - startRow + 1) * (endCol - startCol + 1) > WEBVIEW_LIMITS.maxMergeArea) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `合并范围不能超过 ${WEBVIEW_LIMITS.maxMergeArea} 个单元格。`);
    }
    return pass();
}

function validateOperation(operation: unknown): WebviewMessageValidationResult {
    if (!isRecord(operation)) {
        return reject('WEBVIEW_FIELD_INVALID', 'operations 中的每一项必须是对象。');
    }
    const type = operation.type;
    if (typeof type !== 'string' || !OPERATION_TYPES.has(type)) {
        return reject('WEBVIEW_FIELD_INVALID', 'operations 包含不支持的操作类型。');
    }
    try {
        if (byteLength(JSON.stringify(operation)) > WEBVIEW_LIMITS.maxOperationBytes) {
            return reject('WEBVIEW_LIMIT_EXCEEDED', '单个表格操作超过大小限制。');
        }
    } catch {
        return reject('WEBVIEW_FIELD_INVALID', '表格操作无法序列化。');
    }

    if (type === 'mergeRange' || type === 'unmergeRange') {
        return validateMerge(operation);
    }

    if (type.startsWith('insertRow') || type === 'deleteRow') {
        return validateFiniteInteger(operation.index, 'index', 1, WEBVIEW_LIMITS.maxCoordinate);
    }
    if (type.startsWith('insertColumn') || type === 'deleteColumn') {
        return validateFiniteInteger(operation.index, 'index', 1, WEBVIEW_LIMITS.maxColumnCoordinate);
    }

    const coordinate = validateCoordinate(operation);
    if (!coordinate.ok) {return coordinate;}

    if (type === 'insertControl') {
        if (typeof operation.controlType !== 'string' || !['checkbox', 'dropdown', 'rating', 'date'].includes(operation.controlType)) {
            return reject('WEBVIEW_FIELD_INVALID', 'controlType 不是受支持的控件类型。');
        }
        const defaultValue = validateString(operation.defaultValue, 'defaultValue', WEBVIEW_LIMITS.maxCellTextBytes, false);
        if (!defaultValue.ok) {return defaultValue;}
        if (operation.dropdownOptions !== undefined) {
            if (!Array.isArray(operation.dropdownOptions) || operation.dropdownOptions.length > WEBVIEW_LIMITS.maxDropdownOptions) {
                return reject('WEBVIEW_LIMIT_EXCEEDED', `dropdownOptions 不能超过 ${WEBVIEW_LIMITS.maxDropdownOptions} 项。`);
            }
            for (const option of operation.dropdownOptions) {
                const result = validateString(option, 'dropdownOptions', WEBVIEW_LIMITS.maxDropdownOptionLength);
                if (!result.ok) {return result;}
            }
        }
    }
    return pass();
}

function validateEditArray(
    value: unknown,
    field: string,
    maxItems: number,
    validateItem: (item: unknown) => WebviewMessageValidationResult
): WebviewMessageValidationResult {
    if (!Array.isArray(value)) {
        return reject('WEBVIEW_FIELD_INVALID', `${field} 必须是数组。`);
    }
    if (value.length > maxItems) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `${field} 不能超过 ${maxItems} 项。`);
    }
    for (const item of value) {
        const result = validateItem(item);
        if (!result.ok) {return result;}
    }
    return pass();
}

function validateCellEdit(item: unknown): WebviewMessageValidationResult {
    if (!isRecord(item)) {return reject('WEBVIEW_FIELD_INVALID', '单元格编辑项必须是对象。');}
    const coordinate = validateCoordinate(item);
    if (!coordinate.ok) {return coordinate;}
    return validateString(item.value, 'value', WEBVIEW_LIMITS.maxCellTextBytes);
}

function validateRichEdit(item: unknown): WebviewMessageValidationResult {
    if (!isRecord(item)) {return reject('WEBVIEW_FIELD_INVALID', '富文本编辑项必须是对象。');}
    const coordinate = validateCoordinate(item);
    if (!coordinate.ok) {return coordinate;}
    if (!Array.isArray(item.runs) || item.runs.length > WEBVIEW_LIMITS.maxRichTextRuns) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `runs 不能超过 ${WEBVIEW_LIMITS.maxRichTextRuns} 项。`);
    }
    for (const run of item.runs) {
        if (!isRecord(run)) {return reject('WEBVIEW_FIELD_INVALID', '富文本 run 必须是对象。');}
        const text = validateString(run.text, 'run.text', WEBVIEW_LIMITS.maxCellTextBytes);
        if (!text.ok) {return text;}
        for (const field of ['bold', 'italic']) {
            if (run[field] !== undefined && typeof run[field] !== 'boolean') {
                return reject('WEBVIEW_FIELD_INVALID', `${field} 必须是布尔值。`);
            }
        }
        const color = validateString(run.color, 'run.color', 128, false);
        if (!color.ok) {return color;}
    }
    return pass();
}

function validateStyleEdit(item: unknown): WebviewMessageValidationResult {
    if (!isRecord(item)) {return reject('WEBVIEW_FIELD_INVALID', '样式编辑项必须是对象。');}
    const coordinate = validateCoordinate(item);
    if (!coordinate.ok) {return coordinate;}
    if (item.clearFormatting !== undefined && typeof item.clearFormatting !== 'boolean') {
        return reject('WEBVIEW_FIELD_INVALID', 'clearFormatting 必须是布尔值。');
    }
    try {
        if (byteLength(JSON.stringify(item)) > WEBVIEW_LIMITS.maxOperationBytes) {
            return reject('WEBVIEW_LIMIT_EXCEEDED', '单个样式编辑超过大小限制。');
        }
    } catch {
        return reject('WEBVIEW_FIELD_INVALID', '样式编辑无法序列化。');
    }
    return pass();
}

function validateSaveEdits(message: MessageRecord): WebviewMessageValidationResult {
    const sheetIndex = validateFiniteInteger(message.sheetIndex, 'sheetIndex', 0, 255);
    if (!sheetIndex.ok) {return sheetIndex;}
    const edits = validateEditArray(message.edits, 'edits', WEBVIEW_LIMITS.maxEdits, validateCellEdit);
    if (!edits.ok) {return edits;}
    const richEdits = validateEditArray(message.richEdits, 'richEdits', WEBVIEW_LIMITS.maxRichEdits, validateRichEdit);
    if (!richEdits.ok) {return richEdits;}
    const styleEdits = validateEditArray(message.styleEdits, 'styleEdits', WEBVIEW_LIMITS.maxStyleEdits, validateStyleEdit);
    if (!styleEdits.ok) {return styleEdits;}
    return validateEditArray(message.operations, 'operations', WEBVIEW_LIMITS.maxOperations, validateOperation);
}

function validateFeedbackData(value: unknown): WebviewMessageValidationResult {
    if (!isRecord(value)) {return reject('WEBVIEW_FIELD_INVALID', '反馈 data 必须是对象。');}
    const entries = Object.entries(value);
    if (entries.length > WEBVIEW_LIMITS.maxFeedbackFields) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `反馈字段不能超过 ${WEBVIEW_LIMITS.maxFeedbackFields} 项。`);
    }
    for (const [key, fieldValue] of entries) {
        if (byteLength(key) > 256 || typeof fieldValue !== 'string' || byteLength(fieldValue) > WEBVIEW_LIMITS.maxFeedbackFieldLength) {
            return reject('WEBVIEW_LIMIT_EXCEEDED', '反馈字段类型或长度超出限制。');
        }
    }
    try {
        const body = entries.map(([key, fieldValue]) => `${encodeURIComponent(key)}=${encodeURIComponent(fieldValue as string)}`).join('&');
        if (byteLength(body) > WEBVIEW_LIMITS.maxFeedbackBodyBytes) {
            return reject('WEBVIEW_LIMIT_EXCEEDED', `反馈请求体不能超过 ${WEBVIEW_LIMITS.maxFeedbackBodyBytes} 字节。`);
        }
    } catch {
        return reject('WEBVIEW_FIELD_INVALID', '反馈数据无法编码。');
    }
    return pass();
}

function validateBase64(value: unknown): WebviewMessageValidationResult {
    if (typeof value !== 'string' || !value || value.length > WEBVIEW_LIMITS.maxPdfBase64Chars || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
        return reject('WEBVIEW_FIELD_INVALID', 'PDF 数据不是合法的 Base64 字符串。');
    }
    const decodedBytes = Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
    if (decodedBytes > WEBVIEW_LIMITS.maxPdfBytes) {
        return reject('WEBVIEW_LIMIT_EXCEEDED', `PDF 解码后不能超过 ${WEBVIEW_LIMITS.maxPdfBytes} 字节。`);
    }
    return pass();
}

export function validateWebviewMessage(message: unknown, surface: WebviewSurface): WebviewMessageValidationResult {
    if (!isRecord(message)) {return reject('WEBVIEW_FIELD_INVALID', 'Webview 消息必须是对象。');}

    let serialized: string;
    try {
        serialized = JSON.stringify(message);
    } catch {
        return reject('WEBVIEW_FIELD_INVALID', 'Webview 消息无法序列化。');
    }
    if (byteLength(serialized) > WEBVIEW_LIMITS.maxMessageBytes) {
        return reject('WEBVIEW_MESSAGE_TOO_LARGE', `Webview 消息不能超过 ${WEBVIEW_LIMITS.maxMessageBytes} 字节。`);
    }

    const command = message.command;
    const commands = surface === 'markdown' ? MARKDOWN_COMMANDS : SPREADSHEET_COMMANDS;
    if (typeof command !== 'string' || !commands.has(command)) {
        return reject('WEBVIEW_COMMAND_INVALID', 'Webview command 不受支持。');
    }

    switch (command) {
        case 'resolveImageUris': {
            if (!Array.isArray(message.sources) || message.sources.length > WEBVIEW_LIMITS.maxImageSources) {
                return reject('WEBVIEW_LIMIT_EXCEEDED', `图片 sources 不能超过 ${WEBVIEW_LIMITS.maxImageSources} 项。`);
            }
            for (const source of message.sources) {
                const result = validateString(source, 'source', WEBVIEW_LIMITS.maxSourceLength);
                if (!result.ok) {return result;}
            }
            return pass();
        }
        case 'saveMarkdown':
            return validateString(message.text, 'Markdown 正文', WEBVIEW_LIMITS.maxMarkdownContentBytes);
        case 'savePdfData':
            return validateBase64(message.data);
        case 'submitFeedback':
            return validateFeedbackData(message.data);
        case 'openExternal':
            return validateString(message.url, 'url', WEBVIEW_LIMITS.maxUrlLength);
        case 'openRelativeFile': {
            const href = validateString(message.href, 'href', WEBVIEW_LIMITS.maxSourceLength);
            if (!href.ok) {return href;}
            return validateString(message.documentUri, 'documentUri', WEBVIEW_LIMITS.maxSourceLength);
        }
        case 'restoreVersion':
            return validateString(message.versionId, 'versionId', WEBVIEW_LIMITS.maxVersionIdLength);
        case 'toggleView':
            return typeof message.isPreviewView === 'boolean' || typeof message.isTableView === 'boolean'
                ? pass()
                : reject('WEBVIEW_FIELD_INVALID', 'toggleView 的视图字段必须是布尔值。');
        case 'toggleMdAssociation':
            return typeof message.enable === 'boolean' ? pass() : reject('WEBVIEW_FIELD_INVALID', 'enable 必须是布尔值。');
        case 'updateSettings': {
            if (!isRecord(message.settings)) {return reject('WEBVIEW_FIELD_INVALID', 'settings 必须是对象。');}
            const settingsBytes = byteLength(JSON.stringify(message.settings));
            return settingsBytes <= WEBVIEW_LIMITS.maxSettingsBytes
                ? pass()
                : reject('WEBVIEW_LIMIT_EXCEEDED', `settings 不能超过 ${WEBVIEW_LIMITS.maxSettingsBytes} 字节。`);
        }
        case 'saveXlsxEdits':
            return surface === 'spreadsheet' ? validateSaveEdits(message) : reject('WEBVIEW_COMMAND_INVALID', 'Markdown 不支持表格编辑消息。');
        case 'getRows': {
            const start = validateFiniteInteger(message.start, 'start', 0, WEBVIEW_LIMITS.maxCoordinate);
            if (!start.ok) {return start;}
            const end = validateFiniteInteger(message.end, 'end', 0, WEBVIEW_LIMITS.maxCoordinate);
            if (!end.ok) {return end;}
            if ((message.end as number) < (message.start as number)) {return reject('WEBVIEW_COORDINATE_INVALID', 'end 不能小于 start。');}
            const sheetIndex = validateFiniteInteger(message.sheetIndex, 'sheetIndex', 0, 255);
            if (!sheetIndex.ok) {return sheetIndex;}
            return validateString(message.requestId, 'requestId', WEBVIEW_LIMITS.maxRequestIdLength);
        }
        case 'setPreferredViewMode':
            return message.mode === 'plain' || message.mode === 'styled'
                ? pass()
                : reject('WEBVIEW_FIELD_INVALID', 'mode 必须是 plain 或 styled。');
        case 'styleModeDecision':
            return message.decision === 'continue' || message.decision === 'convert' || message.decision === 'cancel'
                ? pass()
                : reject('WEBVIEW_FIELD_INVALID', 'decision 不是受支持的值。');
        default:
            return pass();
    }
}
