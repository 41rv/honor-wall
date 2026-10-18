import { chromium,expect } from '@playwright/test';
import { importData,largeFixture } from '../../tests/browser/helpers.ts';
import fs from 'node:fs';import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4188','--strictPort'],{stdio:['ignore','ignore','inherit'],env:{...process.env,VITE_BASE_PATH:'/honor-wall/'}});let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4188/honor-wall/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({baseURL:'http://127.0.0.1:4188/honor-wall/'});const page=await context.newPage();
 await page.addInitScript(()=>{
  window.taskRenderCommits=[];
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject:()=>1,onCommitFiberUnmount(){},onCommitFiberRoot(_id,root){
   const rows=[];function visit(f){if(!f)return;const p=f.memoizedProps;if(p?.task && p?.onActions && p?.onComplete)rows.push({id:p.task.id,rendered:!!(f.flags&1),sameTask:!!f.alternate&&f.alternate.memoizedProps.task===p.task});visit(f.child);visit(f.sibling);}visit(root.current);
   if(rows.length)window.taskRenderCommits.push(rows);
  }};
 });
 await importData(page,largeFixture());await page.goto('/honor-wall/#tasks');await expect(page.locator('.task-row')).toHaveCount(200);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await page.waitForTimeout(300);
 const samples=[];
 for(let i=0;i<3;i++){
  await page.evaluate(()=>window.taskRenderCommits=[]);const start=performance.now();await page.getByRole('button',{name:`إكمال مهمة ${i}`,exact:true}).click();await expect(page.locator('.completed-list')).toContainText(`مهمة ${i}`);
  samples.push({ms:Math.round(performance.now()-start),commits:await page.evaluate(()=>window.taskRenderCommits.map(rows=>({rows:rows.length,rendered:rows.filter(r=>r.rendered).length,changedTaskIdentities:rows.filter(r=>!r.sameTask).length})))});
 }
 fs.writeFileSync(`docs/experience-phase1/task-render-${process.argv[2]||'before'}.json`,JSON.stringify({synthetic:true,cpuThrottle:4,samples},null,2)+'\n');console.log(samples);
}finally{await browser?.close();server.kill('SIGTERM');}
