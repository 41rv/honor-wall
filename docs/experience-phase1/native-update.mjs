import { chromium, expect } from '@playwright/test';
import { habitFixture } from '../../tests/habitFixtures.ts';
import { importData,readStore } from '../../tests/browser/helpers.ts';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn,execFileSync } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
const out=new URL('./',import.meta.url).pathname;
const root=fs.mkdtempSync('/tmp/masar-experience-pwa-'),old=path.join(root,'old'),site=path.join(root,'site/honor-wall'),profile=path.join(root,'profile');
execFileSync('python3',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])','docs/habits-phase8/habits-rc1.zip',old]);
const manifest=JSON.parse(fs.readFileSync('docs/habits-phase8/candidate-manifest.json'));
const hashes=directory=>Object.fromEntries(fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const file=path.join(e.parentPath,e.name);return [path.relative(directory,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}));
assert.deepEqual(hashes(old),manifest.build);
const testedBuild=hashes('build');
fs.mkdirSync(path.dirname(site),{recursive:true});fs.cpSync(old,site,{recursive:true});
const base='http://127.0.0.1:4194/honor-wall/';
const server=spawn('python3',['-m','http.server','4194','--bind','127.0.0.1','--directory',path.join(root,'site')],{stdio:'ignore'});
const options={executablePath:'/usr/bin/chromium',args:['--no-sandbox'],headless:true,baseURL:base,viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Riyadh'};
const checks=[],errors=[];let context,stopped=false;
const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
const all=async page=>{const names=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('masar-v1');r.onsuccess=()=>{resolve([...r.result.objectStoreNames]);r.result.close();};}));return Object.fromEntries(await Promise.all(names.map(async n=>[n,await readStore(page,n)])));};
const schema=page=>page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('masar-v1');r.onsuccess=()=>{const db=r.result,names=[...db.objectStoreNames],tx=db.transaction(names);resolve({version:db.version,indexes:Object.fromEntries(names.map(n=>{const s=tx.objectStore(n);return [n,{key:s.keyPath,indexes:[...s.indexNames].map(k=>{const i=s.index(k);return {name:k,key:i.keyPath,unique:i.unique};})}];}))});db.close();};}));
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 context=await chromium.launchPersistentContext(profile,options);let page=await context.newPage();watch(page);await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));
 await page.goto(base+'#backup');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 const data=Object.assign(habitFixture(),JSON.parse(fs.readFileSync('docs/habits-phase8/schema6-fixture.json','utf8')),{version:5});data.habitSuggestions=data.habitSuggestions.filter(s=>s.status!=='new');
 await importData(page,data);await expect(page.getByRole('dialog')).toHaveCount(0);
 const before=await all(page),schemaBefore=await schema(page);assert.equal(schemaBefore.version,70);assert.equal(Object.keys(before).length,19);
 checks.push('actual_published_1_5_0_runtime_initialized_with_19_synthetic_stores_schema7');
 const staleTab=await context.newPage();await staleTab.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));await staleTab.goto(base+'#habits');await expect(staleTab.getByRole('heading',{name:'مساراتي',exact:true})).toBeVisible();
 const oldTabSource=await staleTab.locator('script[type=module]').getAttribute('src');

 fs.writeFileSync(path.join(out,'native-before.json'),JSON.stringify({rows:before,schema:schemaBefore},null,2)+'\n');
 fs.cpSync('build',site,{recursive:true});
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.getByRole('button',{name:'تحديث الآن',exact:true}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'تحديث الآن',exact:true}).click();await expect(page.getByRole('button',{name:'تصدير JSON',exact:true})).toBeVisible();
 await page.waitForFunction(()=>!document.querySelector('.update-banner'));
 // Identify the new runtime through its asset URL after the app's real update.
 const entry=Object.keys(testedBuild).find(n=>/^assets\/index-.*\.js$/.test(n));
 await expect.poll(()=>page.locator('script[type=module]').getAttribute('src')).toBe('/honor-wall/'+entry);
 const migrated=await all(page),schemaAfter=await schema(page);assert.equal(schemaAfter.version,80);
 assert.equal(Object.keys(migrated).length,20);assert.deepEqual(migrated.habitAssessments,[]);
 for(const name of Object.keys(before)) {assert.deepEqual(migrated[name],before[name]);assert.deepEqual(schemaAfter.indexes[name],schemaBefore.indexes[name]);}
 checks.push('real_service_worker_schema7_to8_adds_only_assessments_preserves_every_original_row_and_index');
 fs.writeFileSync(path.join(out,'native-after.json'),JSON.stringify({rows:migrated,schema:schemaAfter},null,2)+'\n');
 assert.notEqual(oldTabSource,'/honor-wall/'+entry);await staleTab.close();
 checks.push('already_open_1_5_0_tab_does_not_block_upgrade_or_rewrite_any_of19_stores');

 const download=page.waitForEvent('download');await page.getByRole('button',{name:'تصدير JSON',exact:true}).click();const backup=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));assert.equal(backup.version,6);for(const [name,rows] of Object.entries(before))assert.deepEqual(backup[name],rows);
 assert.deepEqual(backup.habitAssessments,[]);checks.push('native_chromium_real_snapshot6_download_matches20_stores');
 await page.goto(base+'#home');const row=page.locator('.home-habits [data-habit-id="reading"]');
 await row.getByRole('slider').fill('3');await row.getByRole('button',{name:'سجّل',exact:true}).click();await expect(page.locator('.home-habits .count')).toHaveText('1/2');
 await row.locator('.habit-feedback summary').click();await row.getByLabel('صعوبة الأداء',{exact:true}).selectOption('4');await row.getByLabel('المدة الفعلية بالدقائق',{exact:true}).fill('6.5');await row.getByRole('button',{name:'حفظ التقييم والمدة',exact:true}).click();
 await expect.poll(async()=>(await readStore(page,'habitEntries')).find(e=>e.localDate==='2026-10-21'&&e.habitId==='reading')?.effortRating).toBe(4);
 const record=(await readStore(page,'habitEntries')).find(e=>e.localDate==='2026-10-21'&&e.habitId==='reading');
 assert.equal((await readStore(page,'habitAssessments')).find(a=>a.id===record.id).durationMinutes,6.5);
 checks.push('quantity_and_optional_feedback_saved_with_canonical_entry_link');
 // Reproduce the exact known-field entry reconstruction of old 1.5.0.
 await page.evaluate(record=>new Promise((resolve,reject)=>{const r=indexedDB.open('masar-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('habitEntries','readwrite');const {effortRating:_r,durationMinutes:_m,...known}=record;tx.objectStore('habitEntries').put({...known,result:{...known.result,amount:4}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),record);
 await page.reload();const assessed=page.locator('.home-habits [data-habit-id="reading"]');
 await assessed.locator('.habit-feedback summary').click();await expect(assessed.getByLabel('صعوبة الأداء',{exact:true})).toHaveValue('4');await expect(assessed.getByLabel('المدة الفعلية بالدقائق',{exact:true})).toHaveValue('6.5');
 assert.equal((await readStore(page,'habitEntries')).find(e=>e.id===record.id).effortRating,undefined);
 const saved=await all(page);checks.push('old_known_field_writer_cannot_erase_canonical_feedback_visible_after_reload');
 await context.close();context=null;server.kill('SIGTERM');await once(server,'exit');stopped=true;
 let unavailable=false;try{await fetch(base);}catch{unavailable=true;}assert.ok(unavailable);
 context=await chromium.launchPersistentContext(profile,options);await context.setOffline(true);page=await context.newPage();watch(page);await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));await page.goto(base+'#home');
 await expect(page.locator('.daily-overview')).toBeVisible();await expect(page.locator('.home-habits .count')).toHaveText('1/2');assert.deepEqual(await all(page),saved);
 checks.push('full_browser_restart_with_http_server_stopped_and_network_offline_preserves_all20_stores');
 await page.screenshot({path:path.join(out,'native-offline-home-390.png'),animations:'disabled'});
 await page.locator('.home-habits [data-habit-id="reading"]').getByRole('button',{name:'تراجع',exact:true}).click();await expect(page.locator('.home-habits .count')).toHaveText('0/2');
 assert.equal((await readStore(page,'habitEntries')).filter(e=>e.localDate==='2026-10-21').length,0);assert.equal((await readStore(page,'habitAssessments')).length,0);checks.push('offline_undo_removes_only_current_graded_record_with_its_feedback');
 await page.goto(base+'#habit-path/culture');await page.getByRole('button',{name:'خيارات العادة أو المسار',exact:true}).click();await page.getByRole('button',{name:'حذف نهائي',exact:true}).click();
 const d=page.getByRole('dialog');await d.getByRole('checkbox').check();await d.getByRole('button',{name:'تأكيد الحذف النهائي',exact:true}).click();await expect(page).toHaveURL(/#habits$/);
 assert.equal((await readStore(page,'habitPaths')).length,0);assert.equal((await readStore(page,'habits')).length,2);assert.deepEqual(await readStore(page,'habitEntries'),before.habitEntries);
 checks.push('offline_path_only_permanent_deletion_keeps_habits_and_all_original_history');
 await page.getByRole('button',{name:'استيراد عادات',exact:true}).click();await page.getByLabel('ملف JSON للعادات').setInputFiles({name:'offline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'masar.habits',version:1,kind:'habit',habit:{key:'offline',title:'عادة مستوردة دون اتصال',kind:'simple',schedule:{repeat:'daily'}}}))});await expect(page.getByRole('region',{name:'معاينة استيراد العادات'})).toBeVisible();await page.getByRole('button',{name:'تأكيد استيراد العادات',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 assert.equal((await readStore(page,'habits')).length,3);checks.push('native_offline_habit_json_preview_and_atomic_import');
 for(const name of ['projects','steps','tasks','ideas','events','taskCycles','projectProgress','projectTracking','projectPlans','stepWork','recommendations','paceSettings'])assert.deepEqual(await readStore(page,name),before[name]);
 checks.push('habit_actions_do_not_mutate_any_of_12_legacy_stores');
 const final=await all(page);await context.close();context=null;
 context=await chromium.launchPersistentContext(profile,options);await context.setOffline(true);page=await context.newPage();watch(page);await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));await page.goto(base+'#habits');await expect(page.getByRole('heading',{name:'مساراتي',exact:true})).toBeVisible();assert.deepEqual(await all(page),final);
 checks.push('second_offline_full_restart_preserves_deletion_and_import_without_resurrecting_rows');
 assert.deepEqual(errors,[]);
} catch(e){errors.push(e.stack||e.message);throw e;}
finally{
 fs.writeFileSync(path.join(out,'native-pwa.json'),JSON.stringify({checks,passed:checks.length,errors,testedBuild,source:'Frozen actual 1.5.0 runtime from approved candidate ZIP, hashes verified; isolated local origin and persistent Chromium profile',schemaBefore:70,schemaAfter:80,realServiceWorkerUpdate:true,fullBrowserOfflineRestart:stopped,serverUnavailableDuringOfflineRestart:stopped,physicalAndroidTested:false,downloadAfterOfflinePersistentRestartTested:false,published:false},null,2)+'\n');
 await context?.close();if(!stopped)server.kill('SIGTERM');
}
console.log('PASS native PWA update/offline checks:',checks.length);
