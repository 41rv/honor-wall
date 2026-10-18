import { chromium,expect } from '@playwright/test';
import { habitFixture } from '../../tests/habitFixtures.ts';
import { importData,readStore } from '../../tests/browser/helpers.ts';
import fs from 'node:fs';import path from 'node:path';import {spawn,execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const out=new URL('./',import.meta.url).pathname,root=fs.mkdtempSync('/tmp/masar-old-writer-'),site=path.join(root,'honor-wall');
execFileSync('python3',['-c','import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])','docs/habits-phase8/habits-rc1.zip',site]);
const base='http://127.0.0.1:4201/honor-wall/',server=spawn('python3',['-m','http.server','4201','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const context=await browser.newContext({baseURL:base,timezoneId:'Asia/Riyadh'}),page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));await importData(page,habitFixture());await page.goto(base+'#habit/reading');
 const row=page.locator('.habit-detail > .habit-row');await row.getByRole('spinbutton',{name:'كمية «قراءة»',exact:true}).fill('3');await row.getByRole('button',{name:'سجّل',exact:true}).click();await expect(row.getByRole('button',{name:'تعديل التسجيل',exact:true})).toBeVisible();
 // Model a new client's valid optional feedback on this same per-day entry.
 await page.evaluate(async()=>{const request=indexedDB.open('masar-v1');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('habitEntries','readwrite'),s=tx.objectStore('habitEntries'),r=s.index('[habitId+localDate]').get(['reading','2026-10-21']);r.onsuccess=()=>s.put({...r.result,effortRating:5,durationMinutes:2});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
 const before=(await readStore(page,'habitEntries')).find(e=>e.habitId==='reading'&&e.localDate==='2026-10-21');assert.equal(before.effortRating,5);assert.equal(before.durationMinutes,2);
 await row.getByRole('spinbutton',{name:'كمية «قراءة»',exact:true}).fill('4');await row.getByRole('button',{name:'تعديل التسجيل',exact:true}).click();await expect.poll(async()=>(await readStore(page,'habitEntries')).find(e=>e.id===before.id)?.result.amount).toBe(4);
 const after=(await readStore(page,'habitEntries')).find(e=>e.id===before.id);assert.equal(after.effortRating,undefined);assert.equal(after.durationMinutes,undefined);
 fs.writeFileSync(path.join(out,'old-writer-diagnosis.json'),JSON.stringify({oldRuntime:'actual frozen1.5.0',isolatedSyntheticData:true,oldClientDropsUnknownOptionalFeedbackOnQuantityEdit:true,before,after,physicalAndroid:false},null,2)+'\n');console.log('REPRODUCED: an already-open1.5.0 writer drops numeric rating and duration when schema version is unchanged.');
}finally{await browser?.close();server.kill('SIGTERM');}
