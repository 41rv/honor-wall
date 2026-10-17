import {chromium} from '@playwright/test';
import {importData,readStore,sizedFixture} from '../../tests/browser/helpers.ts';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',timezoneId:'Asia/Riyadh'});const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-21T10:00:00Z'));
 const source=sizedFixture(2);await importData(page,source);
 await page.evaluate(()=>localStorage.setItem('masar-pending-today/t0',JSON.stringify({id:'t0',today:{date:'2026-10-21',timeZone:'Asia/Riyadh'}})));
 await importData(page,source);
 const before=(await readStore(page,'tasks')).find(t=>t.id==='t0');const pending=await page.evaluate(()=>localStorage.getItem('masar-pending-today/t0'));
 await page.reload();await page.waitForTimeout(500);const after=(await readStore(page,'tasks')).find(t=>t.id==='t0');
 const result={pending_after_restore:!!pending,today_before_reload:before.today??null,today_after_reload:after.today??null,unexpected_replay:JSON.stringify(before.today)!==JSON.stringify(after.today)};
 fs.writeFileSync('docs/habits-phase2/pending-intent-result.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
