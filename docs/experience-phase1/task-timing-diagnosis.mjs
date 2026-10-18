import { chromium,expect } from '@playwright/test';
import { largeFixture,importData,openCreate } from '../../tests/browser/helpers.ts';
import fs from 'node:fs';import path from 'node:path';import { spawn,execFileSync } from 'node:child_process';
const out=new URL('./',import.meta.url).pathname,root=fs.mkdtempSync('/tmp/masar-task-timing-');
execFileSync('python3',['-c','import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])','docs/habits-phase8/habits-rc1.zip',path.join(root,'before/honor-wall')]);
fs.mkdirSync(path.join(root,'after'),{recursive:true});fs.cpSync('build',path.join(root,'after/honor-wall'),{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const reports=[];
try {for(const stage of ['before','after']){
 const port=stage==='before'?4197:4198,base=`http://127.0.0.1:${port}/honor-wall/`;
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.join(root,stage)],{stdio:'ignore'});
 const context=await browser.newContext({baseURL:base});
 try {
  for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const page=await context.newPage();await importData(page,largeFixture());await page.goto(base+'#projects');
  await page.getByText('إعداد المشاريع النشطة',{exact:true}).click();await page.getByLabel('الحد الأقصى للمشاريع النشطة').fill('30');await page.getByRole('button',{name:'حفظ حد المشاريع',exact:true}).click();
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');
  await page.goto(base+'#projects');await openCreate(page,'project');await page.getByRole('dialog').getByLabel('الاسم',{exact:true}).fill('مشروع اختبار السرعة');await page.getByRole('dialog').getByRole('button',{name:'إضافة',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await page.getByRole('button',{name:'مشروع اختبار السرعة',exact:true}).waitFor();
  await page.goto(base+'#project/p0');await page.getByRole('button',{name:'مرحلة',exact:true}).click();await page.getByRole('dialog').getByLabel('الاسم',{exact:true}).fill('مرحلة السرعة');await page.getByRole('dialog').getByRole('button',{name:'إضافة',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('ملاحظات العنصر').pressSequentially('ملاحظة اختبار الحفظ والسرعة');await expect(page.getByText('محفوظ تلقائيًا')).toBeVisible();
  const navigationStart=performance.now();await page.goto(base+'#tasks');const gotoReturned=performance.now();
  await expect(page.locator('main')).toHaveAttribute('data-route','tasks');const control=page.getByRole('button',{name:'إكمال مهمة 0',exact:true});await expect(control).toBeVisible();
  const animations=await page.locator('main').evaluate(async node=>{const animations=node.getAnimations();const count=animations.length;await Promise.all(animations.map(a=>a.finished.catch(()=>{})));return count;});
  const ready=performance.now(),before=await cdp.send('Performance.getMetrics');const clickStart=performance.now();await control.click();await expect(page.locator('.completed-list')).toContainText('مهمة 0');const complete=performance.now(),after=await cdp.send('Performance.getMetrics');
  const values=rows=>Object.fromEntries(rows.metrics.map(m=>[m.name,m.value]));const a=values(before),b=values(after);
  reports.push({stage,cpuThrottle:4,tasks:200,projects:20,steps:2200,events:10000,hashGotoReturnedMs:Math.round(gotoReturned-navigationStart),viewAndTransitionReadinessAfterGotoMs:Math.round(ready-gotoReturned),clickToCompletedListMs:Math.round(complete-clickStart),combinedIntervalFromGotoReturnMs:Math.round(complete-gotoReturned),routeAnimationsAwaited:animations,completionMainThreadSeconds:b.TaskDuration-a.TaskDuration});
 }finally{await context.close();server.kill('SIGTERM');}
}}finally{await browser.close();}
fs.writeFileSync(path.join(out,'task-timing-diagnosis.json'),JSON.stringify({method:'Original large-fixture project/stage/notes workflow on actual old1.5.0 and candidate, CPU4x. Separate asynchronous hash-route/readiness from task-completion timing. No product delays, no assertion thresholds changed.',reports},null,2)+'\n');console.log(JSON.stringify(reports));
