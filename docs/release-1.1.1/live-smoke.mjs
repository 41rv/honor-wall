import { chromium, expect } from '/workspace/honor-wall/node_modules/@playwright/test/index.mjs';
import { readStore, openCreate } from '/workspace/honor-wall/tests/browser/helpers.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const exec = promisify(execFile);
const site = 'https://41rv.github.io/honor-wall/';
const output = '/workspace/honor-wall/docs/release-1.1.1';
fs.mkdirSync(output, { recursive: true });
const requests = [], errors = [], checks = [];
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Riyadh',serviceWorkers:'block'});
// Chromium does not trust this environment's HTTPS intermediary. Fetch each
// live response with curl's verified TLS transport instead; never ignore TLS.
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if(url.origin !== new URL(site).origin || !url.pathname.startsWith('/honor-wall/')) return route.abort();
  try {
    const {stdout} = await exec('curl',['--fail','--silent','--show-error','--location','--max-time','30',url.href],{encoding:'buffer',maxBuffer:10*1024*1024});
    const relative = url.pathname.slice('/honor-wall/'.length) || 'index.html';
    const expected = fs.readFileSync(path.join('/tmp/masar-release-111-production',relative));
    const sha = value => crypto.createHash('sha256').update(value).digest('hex');
    if(sha(stdout)!==sha(expected)) throw Error('Live bytes differ: '+relative);
    requests.push({url:url.href,path:relative,sha256:sha(stdout),matches:true});
    const ext=path.extname(relative), types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'};
    await route.fulfill({status:200,contentType:types[ext]||'application/octet-stream',body:stdout});
  } catch(e) {errors.push(e.message);await route.abort();}
});
const page = await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const go = hash => page.goto(site+hash);
try {
  await page.clock.install({time:new Date('2026-10-14T09:00:00Z')});
  async function task(title,scheduled=false){
    await go('#tasks');await openCreate(page,'task');
    const f=page.getByRole('dialog');await f.getByLabel('الاسم',{exact:true}).fill(title);
    if(scheduled){await f.getByLabel('تاريخ التنفيذ',{exact:true}).fill('2026-10-14');await f.getByLabel('الأولوية',{exact:true}).selectOption('important');}
    await f.getByRole('button',{name:'إضافة',exact:true}).click();await expect(f).not.toBeVisible();
  }
  await task('تحقق النشر — مهمة عامة');await task('تحقق النشر — موعد اليوم',true);
  await go('#today');await expect(page.locator('.today-ordered')).toContainText('تحقق النشر — موعد اليوم');
  await page.getByText('اختيار مهام عامة لليوم',{exact:true}).click();
  await page.getByRole('button',{name:'إضافة «تحقق النشر — مهمة عامة» إلى اليوم',exact:true}).click();
  await page.getByRole('button',{name:'إكمال تحقق النشر — مهمة عامة',exact:true}).click();
  await page.getByRole('button',{name:'إعادة فتح تحقق النشر — مهمة عامة',exact:true}).click();
  await page.getByRole('button',{name:'إكمال تحقق النشر — مهمة عامة',exact:true}).click();
  await page.screenshot({path:output+'/live-today-390.png',fullPage:true});checks.push('today_auto_manual_complete_undo');
  await go('#calendar');await expect(page.locator('.calendar-day')).toHaveCount(7);
  const day=page.getByRole('region',{name:'2026-10-14',exact:true});await expect(day).toContainText('تحقق النشر — موعد اليوم');
  await day.getByRole('button',{name:'إتمام المهمة «تحقق النشر — موعد اليوم»',exact:true}).click();
  await day.getByRole('button',{name:'إعادة فتح المهمة «تحقق النشر — موعد اليوم»',exact:true}).click();
  await page.getByRole('button',{name:'الأسبوع القادم',exact:true}).click();
  await page.getByRole('button',{name:'الأسبوع الحالي',exact:true}).click();
  await expect(day).toContainText('تحقق النشر — موعد اليوم');
  await page.screenshot({path:output+'/live-calendar-390.png',fullPage:true});checks.push('calendar_seven_days_navigation_complete_undo');
  await go('#projects');await openCreate(page,'project');
  let f=page.getByRole('dialog');await f.getByLabel('الاسم',{exact:true}).fill('تحقق النشر — مشروع الرؤى');await f.getByRole('button',{name:'إضافة',exact:true}).click();await expect(f).not.toBeVisible();
  const project=(await readStore(page,'projects'))[0];await go('#project/'+project.id);
  for(const title of ['عمل التحقق الأول','عمل التحقق الثاني']){await page.getByRole('button',{name:'خطوة',exact:true}).click();f=page.getByRole('dialog');await f.getByLabel('الاسم',{exact:true}).fill(title);await f.getByRole('button',{name:'إضافة',exact:true}).click();await expect(f).not.toBeVisible();}
  await page.clock.setSystemTime(new Date(Date.parse(project.createdAt)+12*3600000));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'إتمام الخطوة «عمل التحقق الأول»',exact:true}).click();
  await expect.poll(async()=> (await readStore(page,'projectProgress')).filter(r=>r.reason==='completion').length).toBe(1);
  await go('#progress');const dashboard=page.getByRole('region',{name:'إحصائيات الفترة',exact:true});
  for(const label of ['شهري','سنوي','أسبوعي']){await dashboard.getByRole('button',{name:label,exact:true}).click();await expect(dashboard.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');}
  await page.getByRole('tab',{name:'رؤى مسار',exact:true}).click();
  const insights=page.getByRole('region',{name:'رؤى مسار',exact:true});
  await expect(insights.getByRole('img',{name:'تغير نسبة إنجاز تحقق النشر — مشروع الرؤى عبر الزمن',exact:true})).toBeVisible();
  await expect(insights.locator('.insight-milestones > div').filter({has:page.getByText('50٪',{exact:true})})).toContainText('12 ساعة');
  await page.screenshot({path:output+'/live-insights-390.png',fullPage:true});checks.push('dashboard_all_periods_project_history_50percent_12hours');
  await page.getByRole('tab',{name:'سجل الإنجاز',exact:true}).click();
  const history=page.getByRole('region',{name:'سجل الإنجاز',exact:true});
  await expect(history).toContainText('تحقق النشر — مهمة عامة');
  await expect(history).toContainText('عمل التحقق الأول');
  await history.getByLabel('تصفية سجل الإنجاز').selectOption('step');
  await expect(history.locator('.achievement-record')).toHaveCount(1);
  await page.getByRole('tab',{name:'نظرة عامة',exact:true}).click();
  await page.getByRole('tab',{name:'سجل الإنجاز',exact:true}).click();
  await expect(history.getByLabel('تصفية سجل الإنجاز')).toHaveValue('step');
  await page.screenshot({path:output+'/live-achievement-log-390.png',fullPage:true});
  checks.push('three_progress_tabs_history_readonly_filter_state');
  await go('#home');
  await expect(page.getByRole('heading',{name:'يومك، بخطوة واضحة',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'مهامي اليوم',exact:true})).toContainText('تحقق النشر — موعد اليوم');
  await expect(page.locator('main > section').first()).toHaveAttribute('aria-label','مهامي اليوم');
  await expect(page.getByRole('button',{name:'إضافة سريعة',exact:true})).toHaveCount(1);
  await expect(page.locator('.heading-add')).toHaveCount(0);
  await page.getByRole('button',{name:'إضافة سريعة',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'ماذا تريد أن تضيف؟',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await openCreate(page,'idea');
  f=page.getByRole('dialog');await f.getByLabel('الاسم',{exact:true}).fill('تحقق النشر — فكرة');
  await f.getByRole('button',{name:'إضافة',exact:true}).click();await expect(f).not.toBeVisible();
  await go('#ideas');await expect(page.locator('main')).toContainText('تحقق النشر — فكرة');
  await expect.poll(async()=> (await readStore(page,'ideas')).length).toBe(1);
  await go('#home');await page.screenshot({path:output+'/live-home-390.png',fullPage:true});
  checks.push('organized_home_unified_add_menu_create_idea_close_reopen');
  for(const width of [390,1366]){await page.setViewportSize({width,height:844});for(const hash of ['#today','#calendar','#progress']){await go(hash);await expect(page.locator('html')).toHaveAttribute('dir','rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
  checks.push('rtl_mobile_desktop_no_overflow');
  await go('#backup');const download=page.waitForEvent('download');await page.getByRole('button',{name:'تصدير JSON',exact:true}).click();const backup=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  expect(backup.version).toBe(3);expect(backup.projectProgress.length).toBeGreaterThan(0);
  await page.getByLabel('استيراد نسخة',{exact:true}).setInputFiles({name:'release-smoke-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByRole('button',{name:'تأكيد استبدال البيانات',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
  for(const store of ['projects','steps','tasks','ideas','events','taskCycles','projectProgress','projectTracking'])expect(await readStore(page,store)).toEqual(backup[store]);
  checks.push('download_v3_restore_all_eight_stores');
  expect(errors).toEqual([]);
  fs.writeFileSync(output+'/live-browser-result.json',JSON.stringify({timestamp:new Date().toISOString(),release:'1.1.1',url:site,status:'passed',checks,errors,requests,transport:'Per-request live HTTPS using curl with default TLS verification; browser route fulfillment; Chromium direct HTTPS unavailable (untrusted environment proxy CA); serviceWorkers blocked in this isolated live check, offline migration tested separately',user_data:'isolated synthetic local browser profile; no access to personal device data'},null,2));
  console.log(JSON.stringify({status:'passed',checks,live_requests:requests.length,errors}));
} catch(e) {
  fs.writeFileSync(output+'/live-browser-failure.json',JSON.stringify({timestamp:new Date().toISOString(),error:e.stack,checks,errors,requests},null,2));throw e;
} finally {await browser.close();}
