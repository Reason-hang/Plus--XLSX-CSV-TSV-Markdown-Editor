// Run through ego-browser nodejs with the managed fixture Page, not as a Node CLI.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export async function run(page) {
    const results = [];
    const pass = name => { results.push(name); console.log('PASS:', name); };
    const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.md-layout-grid:first-of-type [data-item]')).map(el => el.dataset.item));
    const open = async () => { await page.click('#openSettingsButton'); await page.click('#customizeMdToolbarButton'); };
    const wait = predicate => page.waitForFunction(predicate, undefined, { timeout: 4000 });
    const current = await page.evaluate(() => !document.querySelector('.md-layout-backdrop').hidden);
    if (!current) await open();
    const before = await shown();
    await page.click('[data-item="rtl"] button');
    assert.ok(!(await shown()).includes('rtl'));
    assert.equal(await page.evaluate(() => document.querySelector('#toggleRtlButton').closest('.tooltip').classList.contains('hidden')), false);
    await page.click('[data-cancel]'); await page.click('[data-cancel]');
    assert.equal(await page.evaluate(() => window.__toolbarQA.messages.filter(m => m.command === 'saveMdToolbarLayout').length), 0);
    pass('草稿隐藏不影响实际工具栏，取消不保存');
    await open();
    await page.press('[data-item="search"]', 'Alt+ArrowLeft');
    const keyed = await shown();
    assert.equal(keyed.indexOf('search'), before.indexOf('search') - 1);
    await page.dragAndDrop('[data-item="refresh"]', '[data-item="help"]');
    assert.notDeepEqual(await shown(), keyed);
    pass('Alt 方向键与真实拖动均改变顺序');
    await page.click('[data-item="rtl"] button'); await page.click('[data-item="info"] button');
    await page.click('[data-apply]'); await wait(() => document.querySelector('.md-layout-backdrop').hidden);
    assert.equal(await page.evaluate(() => document.querySelector('#toggleRtlButton').closest('.tooltip').classList.contains('hidden')), true);
    assert.equal(await page.evaluate(() => document.querySelector('#mdToolbarInfo').classList.contains('hidden')), true);
    await page.click('#toggleBackgroundButton');
    assert.ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme') || document.body.className));
    await open();
    assert.ok(!(await shown()).includes('rtl'));
    await page.click('button[data-item="rtl"]');
    assert.equal((await shown()).at(-1), 'rtl');
    await page.evaluate(() => { window.__toolbarQA.failSave = true; });
    await page.click('[data-apply]'); await wait(() => document.querySelector('.md-layout-status').textContent.includes('模拟保存失败'));
    assert.equal(await page.evaluate(() => document.querySelector('.md-layout-backdrop').hidden), false);
    await page.evaluate(() => { window.__toolbarQA.failSave = false; });
    await page.click('[data-apply]'); await wait(() => document.querySelector('.md-layout-backdrop').hidden);
    pass('按钮与 Logo 显隐保存、重新打开恢复、添加到末尾、保存失败保留草稿并重试；设置和主题事件仍有效');

    await page.evaluate(() => { document.querySelector('#markdownPreview').scrollTop = 3500; });
    await page.click('#backToTopButton');
    assert.equal(await page.evaluate(() => document.querySelector('#markdownPreview').scrollTop), 0);
    await page.click('#toggleEditModeButton');
    await wait(() => document.activeElement === document.querySelector('#markdownEditor'));
    await page.evaluate(() => {
        const editor = document.querySelector('#markdownEditor');
        editor.value += '\n未保存测试内容'; editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.setSelectionRange(10, 18); editor.scrollTop = 2000;
        document.querySelector('#markdownPreview').scrollTop = 2200;
    });
    const contentBefore = await page.evaluate(() => ({ value:document.querySelector('#markdownEditor').value, start:document.querySelector('#markdownEditor').selectionStart, end:document.querySelector('#markdownEditor').selectionEnd }));
    await page.click('#backToTopButton');
    assert.deepEqual(await page.evaluate(() => ({ value:document.querySelector('#markdownEditor').value, start:document.querySelector('#markdownEditor').selectionStart, end:document.querySelector('#markdownEditor').selectionEnd })), contentBefore);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#markdownEditor').scrollTop, document.querySelector('#markdownPreview').scrollTop]), [0,0]);
    assert.equal(await page.evaluate(() => window.__toolbarQA.messages.filter(m => m.command === 'saveMarkdown').length), 0);
    pass('普通预览与同步分屏返回顶部，内容和选择不变且不保存文档');

    await page.evaluate(() => { window.__toolbarQA.settings.syncScroll=false; window.__toolbarQA.send({command:'settingsUpdated',settings:window.__toolbarQA.settings}); });
    await page.evaluate(() => { document.querySelector('#markdownEditor').scrollTop=1500; document.querySelector('#markdownPreview').scrollTop=2000; });
    await page.click('#backToTopButton');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#markdownEditor').scrollTop, document.querySelector('#markdownPreview').scrollTop]), [1500,0]);
    pass('关闭同步滚动时仅预览回顶');
    await open();
    for (const [width, columns] of [[800,4],[600,3],[380,2],[320,2]]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', { width, height:700, deviceScaleFactor:1, mobile:false });
        const geometry = await page.evaluate(() => {
            const grid = document.querySelector('.md-layout-grid'); const dialog=document.querySelector('.md-layout-dialog');
            return { columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, overflow:dialog.scrollWidth>dialog.clientWidth, footer:document.querySelector('.md-layout-dialog footer').getBoundingClientRect().bottom<=innerHeight };
        });
        assert.equal(geometry.columns, columns); assert.equal(geometry.overflow,false); assert.equal(geometry.footer,true);
        await page.screenshot({path:`/private/tmp/md-toolbar-${width}.png`});
    }
    pass('800/600/380/320px 的四/三/二列布局、底部可见、无横向溢出');
    await page.cdp('Emulation.clearDeviceMetricsOverride', {});
    writeFileSync('/private/tmp/md-toolbar-browser-results.json', JSON.stringify({date:'2026-10-15',results},null,2));
    return results;
}

export async function edgeCases(page) {
    const results = [];
    const pass = name => { results.push(name); console.log('PASS:', name); };
    const wait = predicate => page.waitForFunction(predicate, undefined, { timeout:4000 });
    const open = async () => { await page.click('#openSettingsButton'); await page.click('#customizeMdToolbarButton'); };
    if (await page.evaluate(() => !document.querySelector('.md-layout-backdrop').hidden)) await page.click('[data-close]');
    if (await page.evaluate(() => document.body.classList.contains('edit-mode'))) await page.click('#cancelEditsButton');
    await open();
    const saves = await page.evaluate(() => window.__toolbarQA.messages.filter(m=>m.command==='saveMdToolbarLayout').length);
    await page.click('[data-reset]');
    assert.equal(await page.evaluate(() => document.querySelectorAll('button.md-layout-card').length),0);
    await page.click('[data-cancel]'); await page.click('[data-cancel]');
    assert.equal(await page.evaluate(() => window.__toolbarQA.messages.filter(m=>m.command==='saveMdToolbarLayout').length),saves);
    pass('恢复默认仅改草稿，取消不落盘');
    await open(); await page.click('[data-item="rtl"] button');
    await page.evaluate(()=>{
        const qa=window.__toolbarQA;qa.settings.toolbarLayout={...qa.settings.toolbarLayout,order:[...qa.settings.toolbarLayout.order].reverse()};
        qa.settings.toolbarLayoutRevision='c'.repeat(64);qa.send({command:'settingsUpdated',settings:qa.settings});
    });
    await wait(()=>document.querySelector('[data-apply]').disabled);
    assert.ok(await page.evaluate(()=>document.querySelector('.md-layout-status').textContent.includes('其他窗口')));
    await page.click('[data-cancel]'); await page.click('[data-cancel]');
    pass('外部布局变化不覆盖脏草稿，阻止直接应用');
    await page.evaluate(()=>window.__toolbarQA.send({command:'versionPreviewMd'}));
    await wait(()=>document.body.classList.contains('version-preview-mode'));
    assert.equal(await page.evaluate(()=>document.querySelector('#toggleEditModeButton').closest('.tooltip').classList.contains('hidden')),true);
    assert.equal(await page.evaluate(()=>document.querySelector('#previewEditButton').closest('.tooltip').classList.contains('hidden')),true);
    await page.evaluate(()=>{document.querySelector('#markdownPreview').scrollTop=1500;});
    await page.click('#backToTopButton');
    assert.equal(await page.evaluate(()=>document.querySelector('#markdownPreview').scrollTop),0);
    pass('历史只读隐藏编辑入口，仍可返回顶部');
    await page.evaluate(()=>window.__toolbarQA.send({command:'versionPreviewCancelledMd'}));
    await wait(()=>!document.body.classList.contains('version-preview-mode'));
    await page.click('#previewEditButton');
    await wait(()=>document.querySelector('#markdownPreview').contentEditable==='true');
    const html=await page.evaluate(()=>document.querySelector('#markdownPreview').innerHTML);
    await page.evaluate(()=>{document.querySelector('#markdownPreview').scrollTop=1800;});
    await page.click('#backToTopButton');
    assert.equal(await page.evaluate(()=>document.querySelector('#markdownPreview').innerHTML),html);
    assert.equal(await page.evaluate(()=>document.querySelector('#markdownPreview').scrollTop),0);
    await page.click('#cancelEditsButton');
    pass('所见即所得回顶不重建正文 DOM');
    await page.evaluate(()=>{const qa=window.__toolbarQA;qa.settings.stickyToolbar=false;qa.send({command:'settingsUpdated',settings:qa.settings});});
    await wait(()=>!document.body.classList.contains('sticky-toolbar-enabled'));
    await page.evaluate(()=>{document.querySelector('#content').scrollTop=2000;window.__toolbarQA.send({command:'backToTop'});});
    await wait(()=>document.querySelector('#content').scrollTop===0);
    pass('非固定工具栏使用主滚动容器，命令入口可回顶');
    await page.evaluate(()=>{const qa=window.__toolbarQA;qa.settings.stickyToolbar=true;qa.send({command:'settingsUpdated',settings:qa.settings});});
    writeFileSync('/private/tmp/md-toolbar-browser-edge-results.json',JSON.stringify({date:'2026-10-15',results},null,2));
    return results;
}
