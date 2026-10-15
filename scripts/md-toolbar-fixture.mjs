// Browser QA only. Uses the actual provider HTML, built Webview and resources;
// mocks the VS Code transport, never writes user settings or source documents.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/mdEditorProvider.ts'), 'utf8');
const template = source.match(/return `\s*(<!DOCTYPE html>[\s\S]*?<\/html>)`;/)?.[1];
if (!template) throw new Error('Provider HTML template not found');
const vars = {
    imgUri: '/resources/md/view.png', svgUri: '/resources/md/logo.svg', scriptUri: '/dist/md/mdWebview.js',
    styleUri: '/resources/md/mdWebview.css', themeUri: '/resources/shared/theme.css', highlightUri: '/resources/md/highlight.css',
    katexStyleUri: '/resources/md/katex/katex.min.css', feedbackStyleUri: '/resources/shared/feedback.css',
    cspSource: "'self'", remoteImageSource: '', nonce: 'toolbar-fixture'
};
const html = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!(name in vars)) throw new Error('Unknown template value: ' + name);
    return vars[name];
}).replace('<body>', '<body class="vscode-dark">').replace('<script nonce="toolbar-fixture" src="/dist/md/mdWebview.js">', '<script src="/fixture-host.js"></script><script nonce="toolbar-fixture" src="/dist/md/mdWebview.js">');
const host = `
window.__toolbarQA = { messages: [], failSave: false, delaySave: false, settings: { stickyToolbar:true, wordWrap:true, syncScroll:true, previewPosition:'right', showOutline:false, showLineNumbers:true, moveMdButtonsToEnd:false, isMdEnabled:false, language:'zh', toolbarLayout:null, toolbarLayoutRevision:'a'.repeat(64) } };
const qa=window.__toolbarQA;
qa.send=(data)=>window.postMessage(data,'*');
qa.content='# 工具栏验收样本\\n\\n'+Array.from({length:120},(_,i)=>'## 章节 '+(i+1)+'\\n\\n用于检查长文导航和编辑状态保留的临时内容。\\n\\n').join('');
window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:(msg)=>{
 qa.messages.push(msg);
 if(msg.command==='webviewReady') setTimeout(()=>{qa.send({command:'initSettings',settings:qa.settings});qa.send({command:'initMarkdown',content:qa.content});},0);
 if(msg.command==='saveMdToolbarLayout'&&!qa.delaySave) setTimeout(()=>{
   if(qa.failSave) qa.send({command:'toolbarLayoutSaved',requestId:msg.requestId,ok:false,message:'模拟保存失败，草稿已保留'});
   else {qa.settings.toolbarLayout=msg.layout;qa.settings.toolbarLayoutRevision=(qa.settings.toolbarLayoutRevision[0]==='a'?'b':'a').repeat(64);qa.send({command:'settingsUpdated',settings:qa.settings});qa.send({command:'toolbarLayoutSaved',requestId:msg.requestId,ok:true});}
 },10);
 if(msg.command==='saveMarkdown') {qa.content=msg.text;setTimeout(()=>qa.send({command:'saveResult',ok:true}),0);}
}});
`;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); return; }
    if (pathname === '/fixture-host.js') { res.setHeader('Content-Type','application/javascript'); res.end(host); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(pathname));
    const allowed = ['dist', 'resources'].some(dir => target.startsWith(path.join(root, dir) + path.sep));
    if (!allowed || !existsSync(target)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type',types[path.extname(target)] || 'application/octet-stream'); res.end(readFileSync(target));
}).listen(4177,'127.0.0.1',()=>console.log('Toolbar QA fixture: http://127.0.0.1:4177'));
