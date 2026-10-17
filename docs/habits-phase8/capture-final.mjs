import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { importData } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const root=fs.mkdtempSync("/tmp/masar-phase8-capture-"), site=path.join(root,"site/honor-wall");
fs.mkdirSync(path.dirname(site),{recursive:true});fs.cpSync("build",site,{recursive:true});
const base="http://127.0.0.1:4189/honor-wall/",out=new URL("./",import.meta.url).pathname;
const server=spawn("python3",["-m","http.server","4189","--bind","127.0.0.1","--directory",path.join(root,"site")],{stdio:"ignore"});
let browser;
const captures=[],errors=[];
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
 for(const width of [320,390])for(const theme of ["light","dark"]){
  const context=await browser.newContext({baseURL:base,viewport:{width,height:844},hasTouch:true,isMobile:true,timezoneId:"Asia/Riyadh"});
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(t=>localStorage.setItem("masar-theme",t),theme);
  await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
  const data=Object.assign(habitFixture(),JSON.parse(fs.readFileSync(path.join(out,"schema6-fixture.json"),"utf8")),{version:5});
  await importData(page,data);
  const toast=page.getByRole("button",{name:"إخفاء الرسالة",exact:true});if(await toast.isVisible())await toast.click();
  for(const route of ["home","habits","habit-path/culture","habit/reading","projects",`project/${data.projects[0].id}`,"tasks","ideas","ideas/reminders","progress","backup"]){
   await page.evaluate(hash=>{location.hash=hash;},"#"+route);
   await expect(page.locator("main")).toHaveAttribute("data-route",route.split("/")[0]);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
   const file=`${route.startsWith("project/")?"project-detail":route.replaceAll("/","-")}-${theme}-${width}.png`;
   await page.screenshot({path:path.join(out,file),fullPage:false,animations:"disabled"});
   captures.push({route,theme,width,file,position:"top"});
   if(route.startsWith("project/") || route==="habit/reading" || route==="backup"){
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    await page.locator("footer").scrollIntoViewIfNeeded();
    const bottom=file.replace(".png","-bottom.png");
    await page.screenshot({path:path.join(out,bottom),animations:"disabled"});
    captures.push({route,theme,width,file:bottom,position:"bottom"});
   }
  }
  await context.close();
 }
 fs.writeFileSync(path.join(out,"capture-results.json"),JSON.stringify({captures,errors,generatedImages:false,actualChromiumScreenshots:true,physicalAndroid:false},null,2)+"\n");
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(captures.length,"actual final screenshots; no page errors");
}finally{await browser?.close();server.kill("SIGTERM");}
