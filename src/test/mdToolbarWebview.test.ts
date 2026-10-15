import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MDEditorProvider } from '../mdEditorProvider';

// Real Electron Webview + real Provider/config transport, isolated test profile.
// Probe code is injected only by this test, never by the shipped extension.
describe('Markdown toolbar real Webview integration', function () {
    this.timeout(60000);
    it('applies a layout through the host and preserves document/editor state', async () => {
        const extension = vscode.extensions.getExtension('muhammad-ahmad.xlsx-viewer');
        assert.ok(extension, 'The development extension must be enabled in the isolated host');
        await extension.activate();
        assert.ok(extension.packageJSON.contributes.configuration.properties['xlsxViewer.md.toolbarLayout'], 'The host must load the new extension manifest');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tb-'));
        const file = path.join(directory, 'sample.md');
        const content = '# 临时验收\n\n' + '## 长文段落\n\n临时内容，检查滚动和未保存状态。\n\n'.repeat(100);
        fs.writeFileSync(file, content);
        const cfg = vscode.workspace.getConfiguration('xlsxViewer');
        assert.ok(cfg.inspect('md.toolbarLayout'), 'The new layout setting must be registered before testing persistence');
        const previous = cfg.inspect('md.toolbarLayout')?.globalValue;
        await cfg.update('md.toolbarLayout', null, vscode.ConfigurationTarget.Global);
        const provider = new MDEditorProvider({
            extensionUri: vscode.Uri.file(path.resolve(__dirname, '../..')),
            globalStorageUri: vscode.Uri.file(path.join(directory, 'storage'))
        } as vscode.ExtensionContext);
        const panel = vscode.window.createWebviewPanel('mdToolbarTest', 'Markdown 工具栏临时验收', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        let disposeListener: vscode.Disposable | undefined;
        try {
            const result = new Promise<{ ok: boolean; error?: string; checks?: string[] }>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Webview probe timed out')), 45000);
                disposeListener = panel.webview.onDidReceiveMessage(message => {
                    if (message.command === 'toolbarTestResult') { clearTimeout(timeout); resolve(message); }
                });
            });
            await provider.resolveCustomEditor({ uri: vscode.Uri.file(file), dispose() {} }, panel, new vscode.CancellationTokenSource().token);
            const nonce = panel.webview.html.match(/nonce="([^"]+)"/)![1];
            const bridge = `<script nonce="${nonce}">const toolbarTestApi=acquireVsCodeApi();window.acquireVsCodeApi=()=>toolbarTestApi;</script>`;
            const probe = `<script nonce="${nonce}">
            (async()=>{
                const checks=[];
                const wait=async(fn)=>{const start=Date.now();while(!fn()){if(Date.now()-start>15000)throw Error('等待界面超时');await new Promise(r=>setTimeout(r,30));}};
                const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
                const click=s=>{const el=document.querySelector(s);if(!el)throw Error('缺少控件 '+s);el.click();};
                try {
                    await wait(()=>document.querySelector('#markdownPreview').textContent.includes('临时验收'));
                    const preview=document.querySelector('#markdownPreview');
                    preview.scrollTop=1500;click('#backToTopButton');check(preview.scrollTop===0,'真实 Webview 预览返回顶部');
                    const settingsButton=document.querySelector('#openSettingsButton');
                    click('#openSettingsButton');click('#customizeMdToolbarButton');
                    click('[data-item="rtl"] button');click('[data-item="info"] button');
                    click('[data-apply]');await wait(()=>document.querySelector('.md-layout-backdrop').hidden);
                    check(document.querySelector('#toggleRtlButton').closest('.tooltip').classList.contains('hidden'),'宿主配置保存后隐藏 RTL');
                    check(document.querySelector('#mdToolbarInfo').classList.contains('hidden'),'说明图片隐藏');
                    check(document.querySelector('#openSettingsButton')===settingsButton,'保留设置按钮原节点');
                    click('#toggleEditModeButton');
                    await wait(()=>document.activeElement===document.querySelector('#markdownEditor'));
                    const editor=document.querySelector('#markdownEditor');
                    const edited=editor.value+'\\n未保存的内容';editor.value=edited;editor.dispatchEvent(new Event('input',{bubbles:true}));
                    await new Promise(r=>setTimeout(r,250));
                    editor.setSelectionRange(10,18);editor.scrollTop=1000;preview.scrollTop=1300;
                    click('#backToTopButton');
                    check(editor.value===edited&&editor.selectionStart===10&&editor.selectionEnd===18,'返回顶部保留源码与选区');
                    check(preview.scrollTop===0&&editor.scrollTop===0,'同步分屏返回顶部');
                    check(document.querySelector('#toggleRtlButton').closest('.tooltip').classList.contains('hidden'),'模式切换不覆盖隐藏偏好');
                    check(!document.querySelector('#saveEditsButton').closest('.tooltip').classList.contains('hidden'),'保存入口保留');
                    toolbarTestApi.postMessage({command:'toolbarTestResult',ok:true,checks});
                }catch(error){toolbarTestApi.postMessage({command:'toolbarTestResult',ok:false,error:String(error),checks});}
            })();</script>`;
            panel.webview.html = panel.webview.html.replace(/<script(?: nonce="[^"]+")? src=/, bridge + '$&').replace('</body>', probe + '</body>');
            const received = await result;
            assert.equal(received.ok, true, JSON.stringify(received));
            assert.ok(received.checks && received.checks.length >= 8);
            assert.deepStrictEqual((cfg.get('md.toolbarLayout') as { hidden: string[] }).hidden, ['rtl', 'info']);
            assert.equal(fs.readFileSync(file, 'utf8'), content, 'UI changes must not save the source');
            console.log('Webview checks:', received.checks);
        } finally {
            disposeListener?.dispose(); panel.dispose(); provider.dispose();
            await cfg.update('md.toolbarLayout', previous, vscode.ConfigurationTarget.Global);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
