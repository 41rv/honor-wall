import { chromium, expect } from "@playwright/test";
import { habitFixture } from "../../tests/habitFixtures.ts";
import { importData } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const root=fs.mkdtempSync("/tmp/masar-phase8-capture-"), site=path.join(root,"site/honor-wall");
const stage=process.argv[2]||"after";
const source=stage==="before"?path.join(root,"published-150"):"build";
if(stage==="before")execFileSync("python3",["-c","import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])","docs/habits-phase8/habits-rc1.zip",source]);
const testedBuild=Object.fromEntries(fs.readdirSync(source,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const file=path.join(e.parentPath,e.name);return[path.relative(source,file),crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")];}));
if(stage==="before")assert.deepEqual(testedBuild,JSON.parse(fs.readFileSync("docs/habits-phase8/candidate-manifest.json")).build);
fs.mkdirSync(path.dirname(site),{recursive:true});fs.cpSync(source,site,{recursive:true});
const base="http://127.0.0.1:4189/honor-wall/",out=new URL("./"+(process.argv[2]||"after")+"/",import.meta.url).pathname;fs.mkdirSync(out,{recursive:true});
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
  const data=Object.assign(habitFixture(),JSON.parse(fs.readFileSync("docs/habits-phase8/schema6-fixture.json","utf8")),{version:5});
  await importData(page,data);
  const toast=page.getByRole("button",{name:"إخفاء الرسالة",exact:true});if(await toast.isVisible())await toast.click();
  for(const route of ["home","habits","habit-path/culture","habit/reading","backup"]){
   await page.evaluate(hash=>{location.hash=hash;},"#"+route);
   await expect(page.locator("main")).toHaveAttribute("data-route",route.split("/")[0]);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
   const file=`${route.startsWith("project/")?"project-detail":route.replaceAll("/","-")}-${theme}-${width}.png`;
   await page.screenshot({path:path.join(out,file),fullPage:false,animations:"disabled"});
   captures.push({route,theme,width,file,position:"top",documentHeight:await page.evaluate(()=>document.documentElement.scrollHeight)});
   if(route==="home"){
    await page.locator(".home-execution").evaluate(n=>n.scrollIntoView({block:"start"}));await page.evaluate(()=>scrollBy(0,-80));
    const middle=`home-projects-${theme}-${width}.png`;await page.screenshot({path:path.join(out,middle),animations:"disabled"});captures.push({route,theme,width,file:middle,position:"projects"});
    await page.locator("footer").scrollIntoViewIfNeeded();const bottom=`home-secondary-${theme}-${width}.png`;await page.screenshot({path:path.join(out,bottom),animations:"disabled"});captures.push({route,theme,width,file:bottom,position:"secondary"});
   }
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
 fs.writeFileSync(path.join(out,"capture-results.json"),JSON.stringify({stage,testedBuild,captures,errors,generatedImages:false,actualChromiumScreenshots:true,physicalAndroid:false},null,2)+"\n");
 if(errors.length)throw new Error(JSON.stringify(errors));
 console.log(captures.length,"actual final screenshots; no page errors");
}finally{await browser?.close();server.kill("SIGTERM");}
