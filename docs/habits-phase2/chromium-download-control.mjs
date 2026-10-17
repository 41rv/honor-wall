import {chromium} from '@playwright/test';import fs from 'node:fs';
const root=fs.mkdtempSync('/tmp/masar-browser-download-control-');
for(let attempt=0;attempt<2;attempt++){
 const context=await chromium.launchPersistentContext(root+'/profile',{executablePath:'/usr/bin/chromium',args:['--no-sandbox'],headless:true,acceptDownloads:true,...(process.env.MASAR_CHROMIUM_WRITABLE_XDG?{env:{...process.env,XDG_CACHE_HOME:root+'/cache',XDG_CONFIG_HOME:root+'/config'}}:{})});
 const page=await context.newPage();
 try{
  await context.setOffline(attempt===1);await page.setContent('<button>Download</button>');
  await page.evaluate(()=>document.querySelector('button').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['{"control":true}'],{type:'application/json'}));a.download='control.json';a.click();});
  const wait=page.waitForEvent('download');await page.click('button');const download=await wait;await download.saveAs(root+'/control-'+attempt+'.json');console.log(attempt,'PASS',fs.readFileSync(root+'/control-'+attempt+'.json','utf8'));
 }catch(e){console.log(attempt,'FAIL',e.message);}finally{await context.close();}
}
