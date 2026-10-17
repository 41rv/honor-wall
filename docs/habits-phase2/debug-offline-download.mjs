import { chromium } from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';
const prefix='/tmp/masar-habits-phase2-pwa-';
const root=fs.readdirSync('/tmp').filter(n=>n.startsWith(path.basename(prefix))).map(n=>'/tmp/'+n).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
const downloadPath=path.join(root,'native-downloads');fs.mkdirSync(downloadPath,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/profile',{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],acceptDownloads:true,...(process.env.EXPLICIT_DOWNLOADS?{downloadsPath:downloadPath}:{}),viewport:{width:390,height:844},timezoneId:'Asia/Riyadh',isMobile:true,hasTouch:true});
const page=await context.newPage();page.on('close',()=>console.log('PAGE CLOSED'));page.on('crash',()=>console.log('PAGE CRASH'));context.on('close',()=>console.log('CONTEXT CLOSED'));context.browser().on('disconnected',()=>console.log('BROWSER DISCONNECTED'));
try {
 await context.setOffline(true);await page.clock.setFixedTime(new Date('2026-10-21T20:00:00Z'));await page.goto('http://127.0.0.1:4186/honor-wall/#backup');
 const b=page.getByRole('button',{name:'تنزيل نسخة الأمان الأخيرة',exact:true});await b.waitFor();
 const wait=page.waitForEvent('download');await b.click();const d=await wait;
 console.log('URL',d.url(),'Name',d.suggestedFilename(),'connected',context.browser().isConnected(),'closed',page.isClosed());
 console.log('failure',await d.failure());
 try {await d.saveAs(downloadPath+'/saved.json');console.log('SAVE OK',fs.statSync(downloadPath+'/saved.json').size);}catch(e){console.log('SAVE FAILED',e.message,'connected',context.browser().isConnected(),'closed',page.isClosed());}
} finally{await context.close();}
