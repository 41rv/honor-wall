import {chromium,expect} from '@playwright/test';
import {habitFixture} from '../../tests/habitFixtures.ts';
import {importData,readStore} from '../../tests/browser/helpers.ts';
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const out=new URL('./',import.meta.url).pathname,root=fs.mkdtempSync('/tmp/masar-recording-capture-'),site=path.join(root,'site/honor-wall');
fs.mkdirSync(path.dirname(site),{recursive:true});fs.cpSync('build',site,{recursive:true});
const base='http://127.0.0.1:4199/honor-wall/',server=spawn('python3',['-m','http.server','4199','--bind','127.0.0.1','--directory',path.join(root,'site')],{stdio:'ignore'});
const captures=[],errors=[];let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(const width of [320,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({baseURL:base,viewport:{width,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Riyadh'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>localStorage.setItem('masar-theme',t),theme);await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));await importData(page,habitFixture());
  const toast=page.getByRole('button',{name:'إخفاء الرسالة',exact:true});if(await toast.isVisible())await toast.click();await page.goto(base+'#home');
  const row=page.locator('.home-habits [data-habit-id="reading"]');await row.getByRole('slider').fill('3');await row.getByRole('button',{name:'سجّل',exact:true}).click();await expect(page.locator('.home-habits .count')).toHaveText('1/2');
  await row.locator('.habit-feedback summary').click();await row.getByLabel('صعوبة الأداء',{exact:true}).selectOption('4');await row.getByLabel('المدة الفعلية بالدقائق',{exact:true}).fill('6.5');await row.getByRole('button',{name:'حفظ التقييم والمدة',exact:true}).click();
  await expect.poll(async()=>(await readStore(page,'habitEntries')).find(e=>e.habitId==='reading'&&e.localDate==='2026-10-21')?.effortRating).toBe(4);
  await row.locator('.habit-feedback summary').click();await row.locator('.habit-feedback').scrollIntoViewIfNeeded();
  const file=`record-feedback-${theme}-${width}.png`;await page.screenshot({path:path.join(out,file),animations:'disabled'});captures.push({file,width,theme,state:'saved assessment and actual duration reopened'});
  const s=habitFixture();s.habitPaths=[];s.habitEntries=[];s.habitSuggestions=[];s.habitImportReceipts=[];
  s.habits=Array.from({length:4},(_,i)=>({...s.habits[1],id:'quick'+i,title:'عادة مستقلة '+i}));s.habitPlans=s.habits.map((h,i)=>({...habitFixture().habitPlans[2],id:'quick-plan'+i,habitId:h.id,schedule:{repeat:'daily'}}));
  await importData(page,s);if(await toast.isVisible())await toast.click();await page.goto(base+'#home');await page.getByRole('button',{name:'تسجيل عادة «عادة مستقلة 0»',exact:true}).click();await expect(page.locator('.home-habits .count')).toHaveText('1/4');
  const feedback=page.getByRole('region',{name:'تقييم آخر تسجيل',exact:true});await feedback.locator('summary').click();await feedback.scrollIntoViewIfNeeded();const last=`record-followup-${theme}-${width}.png`;await page.screenshot({path:path.join(out,last),animations:'disabled'});captures.push({file:last,width,theme,state:'completed habit outside first3, optional followup'});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'recording-captures.json'),JSON.stringify({captures,errors,actualBrowserScreenshots:true,generatedImages:false},null,2)+'\n');if(errors.length)throw new Error(JSON.stringify(errors));
}finally{await browser?.close();server.kill('SIGTERM');}
console.log('PASS',captures.length,'actual recording/feedback screenshots');
