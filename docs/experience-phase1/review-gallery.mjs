import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const server=spawn('python3',['-m','http.server','4200','--bind','127.0.0.1','--directory',new URL('./',import.meta.url).pathname],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:4200/comparison.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:980,height:1100}});
 await page.goto('http://127.0.0.1:4200/comparison.html');
 await page.locator('section').first().locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 await page.locator('section').first().screenshot({path:new URL('./comparison-home-390.png',import.meta.url).pathname});
}finally{await browser?.close();server.kill('SIGTERM');}
