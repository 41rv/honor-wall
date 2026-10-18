import { chromium,expect } from '@playwright/test';
import { habitFixture } from '../../tests/habitFixtures.ts';
import { importData } from '../../tests/browser/helpers.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';import { spawn,execFileSync } from 'node:child_process';
const out=new URL('./',import.meta.url).pathname,root=fs.mkdtempSync('/tmp/masar-experience-perf-');
execFileSync('python3',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])','docs/habits-phase8/habits-rc1.zip',path.join(root,'before/honor-wall')]);
fs.mkdirSync(path.join(root,'after'),{recursive:true});fs.cpSync('build',path.join(root,'after/honor-wall'),{recursive:true});
const testedBuild=Object.fromEntries(fs.readdirSync('build',{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const file=path.join(e.parentPath,e.name);return[path.relative('build',file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const reports=[];
try{for(const stage of ['before','after']){
 const port=stage==='before'?4195:4196,base=`http://127.0.0.1:${port}/honor-wall/`;
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.join(root,stage)],{stdio:'ignore'});
 const context=await browser.newContext({baseURL:base,viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Riyadh'});
 try{
  for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));const s=habitFixture(),stamp='2026-10-21T08:00:00.000Z';
  s.habits=Array.from({length:120},(_,i)=>({...s.habits[1],id:`load-${String(i).padStart(3,'0')}`,title:`عادة مستقلة ${i}`,createdAt:stamp,updatedAt:stamp}));
  s.habitPlans=s.habits.map((h,i)=>({...habitFixture().habitPlans[2],id:'load-plan-'+i,habitId:h.id,createdAt:stamp,effectiveDate:'2026-10-21',schedule:{repeat:'daily'}}));
  s.habitPaths=[];s.habitEntries=[];s.habitSuggestions=[];s.habitImportReceipts=[];
  await importData(page,s);const dismiss=page.getByRole('button',{name:'إخفاء الرسالة',exact:true});if(await dismiss.isVisible())await dismiss.click();
  await page.goto(base+'#habits');await expect(page.locator('.habit-row').first()).toBeVisible();
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const navigation=[];
  for(let i=0;i<5;i++){
   const start=performance.now();await page.locator('.navigation a[href="#home"]').tap();await expect(page.locator('.home-habits .count')).toHaveText('0/120');await page.evaluate(()=>new Promise(requestAnimationFrame));navigation.push(performance.now()-start);
   await page.locator('.navigation a[href="#habits"]').tap();await expect(page.locator('main')).toHaveAttribute('data-route','habits');
  }
  await page.locator('.navigation a[href="#home"]').tap();await expect(page.locator('.home-habits .count')).toHaveText('0/120');
  const recording=[];for(let i=0;i<3;i++){
   const start=performance.now();await page.locator('.home-habits button[aria-label^="تسجيل عادة"]').first().tap();await expect(page.locator('.home-habits .count')).toHaveText(`${i+1}/120`);recording.push(performance.now()-start);
  }
  await page.evaluate(()=>{window.experienceReads=0;for(const prototype of [IDBObjectStore.prototype,IDBIndex.prototype]){const original=prototype.getAll;prototype.getAll=function(...args){window.experienceReads++;return original.apply(this,args);};}});
  await page.waitForTimeout(250);const first=await page.evaluate(()=>window.experienceReads);await page.waitForTimeout(1000);const last=await page.evaluate(()=>window.experienceReads);
  const sorted=a=>[...a].sort((x,y)=>x-y);reports.push({stage,cpuThrottle:4,habits:120,visibleHomeRows:await page.locator('.home-habits .habit-row').count(),navigationMs:navigation.map(Math.round),navigationMedianMs:Math.round(sorted(navigation)[2]),recordingMs:recording.map(Math.round),recordingMedianMs:Math.round(sorted(recording)[1]),idleAdditionalGetAllReads:last-first,physicalAndroid:false});
 }finally{await context.close();server.kill('SIGTERM');}
}}finally{await browser.close();}
fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify({testedBuild,method:'Identical 120-habit data, Chromium mobile 390px, CPU4x, before frozen published1.5.0 bytes and current candidate; navigation click to rendered count and next frame, recording click to updated count; synthetic local data only.',reports},null,2)+'\n');console.log(JSON.stringify(reports));
