const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const source = ts.createSourceFile('spreadsheetWebview.ts', fs.readFileSync('src/webviews/spreadsheet/spreadsheetWebview.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const found = {};
function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && ['scheduleAutoSave', 'hasPendingXlsxEdits'].includes(node.name.text)) found[node.name.text] = node.getText(source);
    if (ts.isIfStatement(node) && node.expression.getText(source) === "message.command === 'saveResult'") found.saveResult = node.getText(source);
    if (ts.isIfStatement(node) && node.expression.getText(source) === "message.command === 'initVirtualTable'") found.init = node.getText(source);
    ts.forEachChild(node, visit);
}
visit(source);
if (Object.keys(found).length !== 4) throw Error('missing source functions');
const script = `
let isEditMode=true,isVersionPreviewMode=false,isSaving=true,isPlainView=false,isTemporaryStyleFile=false,exitAfterSave=false,manualSaveReminderUntil=0,autoSaveTimer=null,pendingSaveWhileSaving=false,queuedSaveShouldExit=false,deferredSpreadsheetInit=false;
let pendingOutsideControlEdits=[],pendingWorksheetOps=[],pendingCellStyleEdits=new Map();
let inFlightSave={id:1,isAutosave:true,shouldExit:false,edits:[{row:1,col:1,value:'A'}],richEdits:[],styleEdits:[],operations:[],outsideEdits:[]};
const currentSettings={autoSave:true,autoSaveDelay:10,autoSaveMode:'all'};
const cell={dataset:{originalText:'old',originalHtml:'old'},innerHTML:'B',value:'B'};
const table={querySelectorAll:()=>[cell],querySelector:()=>cell};
const document={querySelector:selector=>selector==='#tableContainer table'?table:null};
const hideLoading=()=>{},setLoadingText=()=>{},setButtonsEnabled=()=>{},getTableContainer=()=>null,showToast=()=>{},getCellNormalizedValue=c=>c.value,getOrCreateRowCellData=()=>null,shouldScheduleAutosaveForChange=()=>true,clearAutoSaveTimer=()=>{},saveEdits=()=>{},setEditMode=()=>{};
const I18n={t:(key,fallback)=>fallback};
let refreshRequested=false;
const vscode={postMessage:m=>{if(m.command==='requestFreshData') refreshRequested=true;}};
${found.scheduleAutoSave}
${found.hasPendingXlsxEdits}
function receive(message){${found.saveResult} ${found.init}}
scheduleAutoSave('text');
pendingWorksheetOps.push({type:'insertRowAbove',index:2});
pendingCellStyleEdits.set('2:1',{row:2,col:1,bold:true});
receive({command:'initVirtualTable'});
if (!deferredSpreadsheetInit) throw Error('in-flight refresh was not deferred');
receive({command:'saveResult',ok:true,isAutosave:true,saveRequestId:999});
if (!isSaving || !inFlightSave) throw Error('stale response consumed active save');
receive({command:'saveResult',ok:true,isAutosave:true,saveRequestId:1});
if (cell.dataset.originalText!=='A' || !hasPendingXlsxEdits() || pendingWorksheetOps.length!==1 || pendingCellStyleEdits.size!==1 || !autoSaveTimer) throw Error('late changes lost or not queued');
clearTimeout(autoSaveTimer);
autoSaveTimer=null; isSaving=true;
inFlightSave={id:2,isAutosave:true,shouldExit:false,edits:[],richEdits:[],styleEdits:[],operations:[],outsideEdits:[]};
receive({command:'saveResult',ok:false,isAutosave:true,saveRequestId:2,error:'failure'});
if (pendingWorksheetOps.length!==1 || pendingCellStyleEdits.size!==1) throw Error('failed save discarded pending changes');
pendingWorksheetOps=[]; pendingCellStyleEdits.clear(); cell.dataset.originalText='B'; cell.dataset.originalHtml='B';
isSaving=true; inFlightSave={id:3,isAutosave:true,shouldExit:false,edits:[],richEdits:[],styleEdits:[],operations:[],outsideEdits:[]};
receive({command:'saveResult',ok:true,isAutosave:true,saveRequestId:3});
if (!refreshRequested) throw Error('deferred refresh was not requested: '+JSON.stringify({deferredSpreadsheetInit,isSaving,pending:hasPendingXlsxEdits(),pendingSaveWhileSaving}));
`;
vm.runInNewContext(ts.transpileModule(script, {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText, {setTimeout, clearTimeout});
console.log('保存批次模拟通过：忽略过期回执，保留后续文本、样式、结构并安排后续保存。');
