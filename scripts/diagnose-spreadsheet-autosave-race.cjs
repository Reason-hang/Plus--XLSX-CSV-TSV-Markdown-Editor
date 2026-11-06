// 以实际前端函数为输入，模拟保存期间再次编辑；不读取或修改用户文档。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/webviews/spreadsheet/spreadsheetWebview.ts');
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const found = {};
function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && ['scheduleAutoSave', 'captureOriginalCellValues', 'hasPendingXlsxEdits'].includes(node.name.text)) {
        found[node.name.text] = node.getText(source);
    }
    if (ts.isIfStatement(node) && node.expression.getText(source) === "message.command === 'saveResult'") {
        found.saveResult = node.getText(source);
    }
    ts.forEachChild(node, visit);
}
visit(source);
if (Object.keys(found).length !== 4) { throw new Error(`缺少待诊断的源码节点：${Object.keys(found).join(', ')}`); }

const fixture = `
let isEditMode=true,isVersionPreviewMode=false,isSaving=true,isPlainView=true,isTemporaryStyleFile=false,exitAfterSave=false,manualSaveReminderUntil=0,autoSaveTimer=null;
let pendingOutsideControlEdits=[],pendingWorksheetOps=[],pendingCellStyleEdits=new Map();
const currentSettings={autoSave:true,autoSaveDelay:1000};
const cell={dataset:{originalText:'已发出的版本',originalHtml:'已发出的版本'},innerHTML:'保存期间的新内容',value:'保存期间的新内容'};
const document={querySelector: selector=>selector==='#tableContainer table'?{querySelectorAll:()=>[cell]}:null};
const hideLoading=()=>{},setLoadingText=()=>{},setButtonsEnabled=()=>{},getTableContainer=()=>null,showToast=()=>{},clearPendingOutsideControlEdits=()=>{pendingOutsideControlEdits=[]},getCellNormalizedValue=cell=>cell.value;
const I18n={t:(key,fallback)=>fallback};
${found.scheduleAutoSave}
${found.captureOriginalCellValues}
${found.hasPendingXlsxEdits}
function receive(message){${found.saveResult}}
scheduleAutoSave('text');
const pendingBefore=hasPendingXlsxEdits();
receive({command:'saveResult',ok:true,isAutosave:true});
globalThis.result={pendingBefore,pendingAfter:hasPendingXlsxEdits(),timerScheduled:autoSaveTimer!==null};
`;
const compiled = ts.transpileModule(fixture, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const context = { setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(compiled, context);
console.log(JSON.stringify(context.result));
if (context.result.pendingBefore && !context.result.pendingAfter && !context.result.timerScheduled) {
    console.error('未通过：保存期间的新内容被标记为已保存，且没有安排重试。');
    process.exitCode = 1;
}
