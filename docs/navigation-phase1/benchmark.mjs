// Current phase1 candidate: native clock, three independent contexts, CPU4x.
// Only Date is controlled. Playwright Clock is deliberately NOT installed.
import { chromium } from "@playwright/test";
import { importData, sizedFixture } from "../../tests/browser/helpers.ts";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const output = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
const all = [];
try {
    for (let repeat=0; repeat<3; repeat++) {
        for (const stage of ["after"]) {
            console.log("Starting sample",repeat+1);
            const build="/tmp/masar-navigation-production";
            const errors=[];
            const context=await browser.newContext({baseURL:"http://127.0.0.1:4998",viewport:{width:390,height:844},hasTouch:true,timezoneId:"Asia/Riyadh",serviceWorkers:"block"});
            await context.addInitScript(() => {
                const fixed=Date.parse("2026-10-21T10:00:00Z");
                const OriginalDate=Date;
                window.Date=new Proxy(OriginalDate,{
                    construct(target,args,newTarget){return Reflect.construct(target,args.length ? args : [fixed],newTarget);},
                    apply(){return new OriginalDate(fixed).toString();},
                    get(target,key,receiver){return key==="now" ? ()=>fixed : Reflect.get(target,key,receiver);},
                });
                localStorage.setItem("masar-theme","dark");
            });
            await context.route("**/*",async route=>{
                const relative=new URL(route.request().url()).pathname.replace(/^\/honor-wall\//,"/").slice(1)||"index.html";
                const file=path.join(build,relative);
                const types={".html":"text/html",".js":"application/javascript",".css":"text/css",".woff":"font/woff",".woff2":"font/woff2",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};
                await route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||"application/octet-stream"});
            });
            const page=await context.newPage();
            page.on("pageerror",e=>errors.push(e.message));
            page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
            const data=sizedFixture(500);
            data.tasks=Array.from({length:500},(_,i)=>({...data.tasks[i%10],id:`t${i}`,title:`مهمة اختبار ${i}`,...(i<3?{today:{date:"2026-10-21",timeZone:"Asia/Riyadh"}}:{})}));
            await importData(page,data);await page.goto("/#home");
            await page.evaluate(()=>document.fonts.ready);
            await page.locator('main[data-route="home"]').waitFor();
            await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() =>
                performance.now.toString().includes("[native code]") &&
                requestAnimationFrame.toString().includes("[native code]")
            ), true, "Benchmark must use the native browser performance clock and rAF");
            const cdp=await context.newCDPSession(page);
            await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
            const measured=await page.evaluate(async()=>{
                const frames={navigation:[],scroll:[]},longs=[],navigation=[];
                let running=true,phase="navigation",previous=performance.now();
                const observe=new PerformanceObserver(list=>longs.push(...list.getEntries().map(e=>({duration:e.duration,phase}))));
                observe.observe({type:"longtask",buffered:false});
                const tick=now=>{if(frames[phase])frames[phase].push(now-previous);previous=now;if(running)requestAnimationFrame(tick);};
                requestAnimationFrame(tick);
                const twoFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                const tabs=["home","projects","habits"];
                for(let i=0;i<18;i++){
                    const route=tabs[(i+1)%tabs.length],start=performance.now();
                    document.querySelector(`.navigation a[href="#${route}"]`).click();
                    await new Promise((resolve,reject)=>{const check=()=>{if(document.querySelector(`.navigation a[href="#${route}"][aria-current="page"]`))resolve();else if(performance.now()-start>5000)reject(new Error(`Navigation did not commit: ${route}; hash=${location.hash}; main=${document.querySelector("main")?.dataset.route}`));else requestAnimationFrame(check);};check();});
                    const commit=performance.now()-start;
                    await twoFrames();
                    navigation.push({route,commit_ms:commit,paint_ms:performance.now()-start});
                    await new Promise(resolve=>setTimeout(resolve,280));
                }
                phase="settle";
                document.querySelector('.task-shortcut').click();
                await new Promise(resolve=>setTimeout(resolve,650));
                phase="scroll";previous=performance.now();
                for(let i=0;i<50;i++){window.scrollBy(0,180);await twoFrames();}
                running=false;observe.disconnect();
                const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))];
                const frameStats=xs=>({count:xs.length,median_ms:percentile(xs,.5),p95_ms:percentile(xs,.95),over50:xs.filter(x=>x>50).length});
                return {navigation,navigation_p95_ms:percentile(navigation.map(x=>x.paint_ms),.95),navigation_commit_p95_ms:percentile(navigation.map(x=>x.commit_ms),.95),frames_navigation:frameStats(frames.navigation),frames_scroll:frameStats(frames.scroll),long_tasks:longs,tasks:document.querySelectorAll(".task-row").length};
            });
            assert.equal(measured.tasks,500);assert.deepEqual(errors,[]);
            const result={stage,repeat:repeat+1,...measured,cpu_throttle:4,clock:"Date proxy only; native performance.now and native requestAnimationFrame",physical_android:false};
            all.push(result);
            fs.writeFileSync(path.join(output,"benchmark-samples.json"),JSON.stringify(all,null,2)+"\n");
            console.log(stage,repeat+1,"navigation p95",measured.navigation_p95_ms.toFixed(1),"scroll p95",measured.frames_scroll.p95_ms.toFixed(1));
            await context.close();
        }
    }
    const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
    const summary={};
    for(const stage of ["after"]){
        const samples=all.filter(x=>x.stage===stage);
        summary[stage]={samples:3,navigation_p95_median_ms:median(samples.map(x=>x.navigation_p95_ms)),navigation_p95_range_ms:[Math.min(...samples.map(x=>x.navigation_p95_ms)),Math.max(...samples.map(x=>x.navigation_p95_ms))],commit_p95_median_ms:median(samples.map(x=>x.navigation_commit_p95_ms)),scroll_frame_p95_median_ms:median(samples.map(x=>x.frames_scroll.p95_ms)),scroll_frames_over50:samples.map(x=>x.frames_scroll.over50),navigation_frame_p95_median_ms:median(samples.map(x=>x.frames_navigation.p95_ms))};
    }
    fs.writeFileSync(path.join(output,"benchmark-summary.json"),JSON.stringify({method:"Three independent current-candidate contexts, CPU4x, 500 tasks and 500 steps, 54 main-tab transitions; native browser clock/rAF; local scene13:00. No before/after performance claim.",...summary},null,2)+"\n");
} finally {await browser.close();}
