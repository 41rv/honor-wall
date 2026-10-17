import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const site='https://41rv.github.io/honor-wall/', out=new URL('./',import.meta.url).pathname;
const cache='/tmp/masar-150-live-verified', checks=[], errors=[], requests=[];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'live-artifacts.json')));
const hashes=new Map(manifest.files.map(f=>[f.path,f.sha256]));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Riyadh',serviceWorkers:'block'});
// Chromium's environment proxy has a certificate-chain limitation. Supply ONLY
// actual public bytes already downloaded and hash-verified with normal HTTPS.
// No TLS bypass, generated assets, user profile, or intercepted write API.
await context.route('**/*',async route=>{
  try {
    const u=new URL(route.request().url());
    assert.equal(u.origin,new URL(site).origin);
    assert.ok(u.pathname.startsWith('/honor-wall/'));
    const name=u.pathname.slice('/honor-wall/'.length)||'index.html';
    const body=fs.readFileSync(path.join(cache,name));
    assert.equal(sha(body),hashes.get(name));
    requests.push(name);
    const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2'};
    await route.fulfill({status:200,body,contentType:types[path.extname(name)]||'application/octet-stream'});
  } catch(e){ errors.push(e.message);await route.abort(); }
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const go=async hash=>{await page.goto(site+hash);await expect(page.locator('main')).toBeVisible();};
const store=name=>page.evaluate(name=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('masar-v1');r.onerror=()=>reject(r.error.message);
  r.onsuccess=()=>{const db=r.result;const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>{resolve(q.result);db.close();};q.onerror=()=>{reject(q.error.message);db.close();};};
}),name);
try {
 await go('#home');
 await expect(page.locator('.navigation a')).toHaveText(['العادات','الرئيسية','المشاريع']);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 checks.push('three_primary_sections_and_rtl');
 const schema=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('masar-v1');r.onsuccess=()=>{resolve({version:r.result.version,stores:[...r.result.objectStoreNames]});r.result.close();};}));
 assert.equal(schema.version,70);assert.equal(schema.stores.length,19);
 assert.equal((await store('habits')).length,0);assert.equal((await store('reminders')).length,0);
 checks.push('schema7_19_stores_no_seeded_habits_or_reminders');
 await page.locator('.navigation a[href="#habits"]').tap();
 await expect(page.getByRole('heading',{name:'مساراتي',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'عادة جديدة',exact:true}).tap();
 let d=page.getByRole('dialog');await d.getByLabel('اسم العادة',{exact:true}).fill('اختبار ترتيب المكتب');
 await d.getByRole('button',{name:'حفظ',exact:true}).click();await expect(d).toHaveCount(0);
 await go('#home');
 const card=page.getByRole('region',{name:'عاداتي اليوم',exact:true});
 await card.getByRole('button',{name:'تسجيل عادة «اختبار ترتيب المكتب»',exact:true}).tap();
 await expect(card.locator('.count')).toHaveText('1/1');
 await page.reload();await expect(card.locator('.count')).toHaveText('1/1');
 await card.getByRole('button',{name:'التراجع عن عادة «اختبار ترتيب المكتب»',exact:true}).tap();
 await expect(card.locator('.count')).toHaveText('0/1');
 assert.equal((await store('habitEntries')).length,1);
 checks.push('simple_habit_create_home_record_persistence_undo_single_entry');
 await go('#habits');await page.getByRole('button',{name:'استيراد عادات',exact:true}).click();
 const imported={format:'masar.habits',version:1,kind:'path',path:{title:'مسار تحقق النشر',habits:[{key:'reading',title:'قراءة للتحقق',kind:'progressive',schedule:{repeat:'daily'},phases:[{key:'pages',title:'قراءة',unit:'صفحة',start:1,goal:20,step:1}],current:{phaseKey:'pages',target:1}}]}};
 await page.getByLabel('ملف JSON للعادات').setInputFiles({name:'release-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
 await expect(page.getByRole('region',{name:'معاينة استيراد العادات'})).toContainText('صفحة');
 assert.equal((await store('habits')).length,1);
 await page.getByRole('button',{name:'تأكيد استيراد العادات',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 assert.equal((await store('habits')).length,2);assert.equal((await store('habitPaths')).length,1);
 checks.push('habit_path_graded_json_preview_and_commit');
 await go('#home');
 await card.getByRole('spinbutton',{name:'كمية «قراءة للتحقق»',exact:true}).fill('3');
 await card.getByRole('button',{name:'سجّل',exact:true}).click();
 await expect(card.locator('.count')).toHaveText('1/2');
 assert.equal((await store('habitEntries')).find(e=>e.result.kind==='graded').result.amount,3);
 await card.getByRole('button',{name:'تراجع',exact:true}).click();await expect(card.locator('.count')).toHaveText('0/2');
 checks.push('graded_home_actual_quantity_record_and_undo');
 await page.locator('.task-shortcut').tap();await expect(page.locator('main')).toHaveAttribute('data-route','tasks');
 await page.getByRole('button',{name:'إضافة سريعة',exact:true}).tap();
 await page.getByRole('dialog',{name:'ماذا تريد أن تضيف؟',exact:true}).getByRole('button',{name:'مهمة جديدة',exact:true}).click();
 d=page.getByRole('dialog');await d.getByLabel('الاسم',{exact:true}).fill('مهمة تحقق النشر');
 await d.getByRole('button',{name:'إضافة',exact:true}).click();await expect(d).toHaveCount(0);
 assert.equal((await store('tasks')).length,1);
 checks.push('existing_task_shortcut_fab_and_create');
 await page.locator('.navigation a[href="#projects"]').tap();
 await page.locator('.project-gateway a[href="#ideas"]').click();
 await page.getByRole('button',{name:'تذكيرات',exact:true}).click();
 const reminders=page.getByRole('region',{name:'التذكيرات',exact:true});
 await reminders.getByLabel('عنوان التذكير',{exact:true}).fill('كتاب تحقق النشر');
 await reminders.getByRole('button',{name:'حفظ سريع',exact:true}).click();
 await reminders.getByRole('button',{name:'مراجعة «كتاب تحقق النشر»',exact:true}).click();
 await expect(reminders.getByRole('button',{name:'التراجع عن مراجعة «كتاب تحقق النشر»',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();assert.equal((await store('reminders')).length,1);
 checks.push('gateway_reminder_create_review_and_reload');
 await go('#calendar');await expect(page.locator('.calendar-day')).toHaveCount(7);
 await go('#progress');await expect(page.getByRole('region',{name:'إحصائيات الفترة',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'رؤى مسار',exact:true}).click();
 await expect(page.getByRole('region',{name:'رؤى مسار',exact:true})).toBeVisible();
 checks.push('legacy_calendar_dashboard_insights_routes');
 for(const width of [320,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:844});
   await page.evaluate(t=>localStorage.setItem('masar-theme',t),theme);
   for(const route of ['home','habits','projects','tasks','ideas/reminders','progress']){
    await go('#'+route);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await expect(page.locator('.living-sky')).toHaveCount(1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route);
    await page.screenshot({path:path.join(out,`live-${route.replaceAll('/','-')}-${width}-${theme}.png`),animations:'disabled'});
   }
 }
 checks.push('six_screens_320_390_light_dark_rtl_single_sky_no_overflow_24_screenshots');
 assert.deepEqual(errors,[]);
} catch(e){errors.push(e.stack||e.message);throw e;}
finally{
 fs.writeFileSync(path.join(out,'live-browser.json'),JSON.stringify({version:'1.5.0',at:new Date().toISOString(),url:site,checks,passed:checks.length,errors,verifiedPublicRequests:requests.length,actualBrowser:true,isolatedTestData:true,transport:'Public production bytes downloaded using verified HTTPS, hashed against tested build, then fulfilled at actual public origin because of browser proxy certificate limitation.',serviceWorker:'Blocked for this public smoke test; native update/offline verified separately in phase8 on identical bytes.',physicalAndroidTested:false},null,2)+'\n');
 await browser.close();
}
console.log('PASS public production browser checks:',checks.length,'verified asset requests:',requests.length);
