// Original browser captures of the isolated phase1 candidate before/after the
// one-line contrast correction. No image generation or personal browser data.
import { chromium } from '@playwright/test';
import { importData, sizedFixture } from '../../tests/browser/helpers.ts';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const output = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const results=[];
try {
 for (const [width,theme] of [[320,'dark'],[390,'dark'],[390,'light']]) {
  for (const stage of ['before','after']) {
   const build=stage==='before'?'/tmp/masar-navigation-before-contrast':'/tmp/masar-navigation-production';
   const context=await browser.newContext({baseURL:'http://127.0.0.1:4998',viewport:{width,height:844},timezoneId:'Asia/Riyadh',hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
   await context.addInitScript(mode=>localStorage.setItem('masar-theme',mode),theme);
   await context.route('**/*',async route=>{
    const relative=new URL(route.request().url()).pathname.replace(/^\/honor-wall\//,'/').slice(1)||'index.html';
    const file=path.join(build,relative);
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff':'font/woff','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
    await route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
   });
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-10-21T20:00:00Z'));
   await importData(page,sizedFixture(20));
   const close=page.getByRole('button',{name:'إخفاء الرسالة',exact:true});if(await close.isVisible())await close.click();
   await page.goto('/#progress');await page.locator('.period-dashboard').waitFor();
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));scrollTo(0,360);});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const prefix=`contrast-${stage}-progress-night-${theme}-${width}`;
   await page.screenshot({path:path.join(output,prefix+'.png')});
   const row=await page.evaluate(()=>{
    const p=document.querySelector('.period-dashboard >p.muted');
    const text=[...p.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.includes('جزئية'));
    const range=document.createRange();range.selectNodeContents(text);const b=range.getBoundingClientRect();
    const color=getComputedStyle(p).color.match(/[\d.]+/g).map(Number);
    return {label:text.textContent.trim(),rgb:color.slice(0,3),alpha:color[3]??1,rect:[b.x,b.y,b.right,b.bottom],required:4.5,occluded:[]};
   });
   await page.addStyleTag({content:'.period-dashboard >p.muted{color:transparent!important}'});
   const bg=path.join(output,prefix+'-background.png'),data=path.join(output,prefix+'-row.json');
   await page.screenshot({path:bg});fs.writeFileSync(data,JSON.stringify([row]));
   const measured=JSON.parse(execFileSync('python3',['docs/living-sky-shell/measure-contrast.py',bg,data],{encoding:'utf8'}));
   results.push({stage,width,theme,...measured[0]});assert.deepEqual(errors,[]);
   await context.close();
  }
 }
 fs.writeFileSync(path.join(output,'contrast-comparison.json'),JSON.stringify(results,null,2)+'\n');
 assert.ok(results.filter(r=>r.stage==='after').every(r=>r.passes));
 console.log(results.map(r=>`${r.stage} ${r.width} ${r.theme}: ${r.minimum_ratio}:1`).join('\n'));
} finally {await browser.close();}
