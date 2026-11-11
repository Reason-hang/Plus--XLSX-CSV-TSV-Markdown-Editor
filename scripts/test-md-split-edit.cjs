const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const source = ts.createSourceFile('mdWebview.ts', fs.readFileSync('src/webviews/md/mdWebview.ts', 'utf8'), ts.ScriptTarget.Latest, true);
let fn;
function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'pushPreviewEditsToEditor') fn = node.getText(source);
    ts.forEachChild(node, visit);
}
visit(source);
if (!fn) throw Error('missing split editor synchronization');
const script = `
let previewToEditorTimer=null,isEditMode=true,isPreviewEditMode=false,splitPreviewBaselineHtml='before',splitPreviewTrailingNewlines='\\n',currentContent='原文\\n',splitEditorSource='原文\\n',activeScrollSource=null,scrollTimeout=null;
let html='before',converted='新内容',saved=0;
const editor={value:'原文\\n'}, preview={};
const $=id=>id==='markdownEditor'?editor:preview;
const getPreviewEditHtml=()=>html,previewToMarkdown=()=>converted,sanitizeMarkdownCopyLinkArtifacts=x=>x,pushUndoState=()=>{},refreshEditorLineCache=()=>{},updateStatusInfo=()=>{},scheduleMarkdownAutoSave=()=>{saved++},showToast=()=>{};
const window={clearTimeout};
${fn}
if (!pushPreviewEditsToEditor() || editor.value!=='原文\\n' || saved) throw Error('unchanged preview altered source');
html='after';
if (!pushPreviewEditsToEditor() || editor.value!=='新内容\\n' || saved!==1) throw Error('edited preview did not sync');
html='<details>unsafe</details>';
if (pushPreviewEditsToEditor() || editor.value!=='新内容\\n') throw Error('unsafe preview overwrote source');
splitEditorSource='一\\r\\n二\\r\\n'; editor.value='一\\n二\\n'; converted='一\\n二更新'; html='changed again';
if (!pushPreviewEditsToEditor() || currentContent!=='一\\r\\n二更新\\r\\n') throw Error('split preview changed untouched CRLF');
clearTimeout(scrollTimeout);
`;
const { reconcileEditorLineEndings } = require('../out/webviews/md/previewEditSafety');
vm.runInNewContext(ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,{setTimeout,clearTimeout,reconcileEditorLineEndings});
console.log('分屏预览同步模拟通过：未编辑不改原文，安全编辑同步，不安全内容拒绝覆盖。');
