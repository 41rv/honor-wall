import {chromium,expect} from '@playwright/test';
import {sizedFixture,importData} from '../../tests/browser/helpers.ts';
import fs from 'node:fs';
function fixture() {
    const data = sizedFixture(6);
    data.version = 2;
    data.taskCycles = [];
    const at = "2026-10-01T09:00:00.000Z";
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const row of group) {
            row.createdAt = at;
            row.updatedAt = at;
        }
    data.projects[0].title = "بناء عادة القراءة";
    data.steps.find((s) => s.id === "s0")!.status = "done";
    data.steps.find((s) => s.id === "s0")!.completedAt =
        "2026-10-20T09:00:00.000Z";
    data.steps.find((s) => s.id === "s1")!.title = "قراءة الفصل الثاني";
    data.steps.find((s) => s.id === "s1")!.status = "doing";
    data.steps.find((s) => s.id === "s1")!.startedAt =
        "2026-10-20T09:00:00.000Z";
    data.tasks = data.tasks.slice(0, 5).map((t, i) => ({
        ...t,
        title: [
            "مراجعة خطة الأسبوع",
            "ممارسة اللغة الإنجليزية",
            "ترتيب مساحة العمل",
            "قراءة عشر صفحات",
            "تجهيز قائمة القراءة",
        ][i],
        priority: (
            [
                "important-urgent",
                "important",
                "urgent",
                "low",
                undefined,
            ] as const
        )[i],
        today: { date: "2026-10-21", timeZone: "Asia/Riyadh" },
    }));
    data.ideas = [];
    return data;
}

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const reports=[];
try {
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4173/honor-wall/',viewport:{width:390,height:844},timezoneId:'Asia/Riyadh'});const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('masar-theme','light');localStorage.setItem('masar-sky-blur','12');});
 await importData(page,fixture());await page.goto('/honor-wall/#home');await page.evaluate(()=>document.fonts.ready);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 for(let i=0;i<5;i++){
  const add=page.getByRole('button',{name:'إضافة سريعة',exact:true});
  await add.evaluate(button=>{
   (window as any).glassPaint=new Promise<number>(resolve=>button.addEventListener('click',event=>{
    const start=event.timeStamp;
    const painted=()=>{const d=document.querySelector('dialog[open]');
     if(d && parseFloat(getComputedStyle(d).opacity)>0)requestAnimationFrame(()=>resolve(performance.now()-start));
     else requestAnimationFrame(painted);
    };requestAnimationFrame(painted);
   },{capture:true,once:true}));
  });
  const started=performance.now();await add.click();await expect(page.getByRole('dialog',{name:'ماذا تريد أن تضيف؟',exact:true})).toBeVisible();
  const wall=performance.now()-started,paint=await page.evaluate(()=>(window as any).glassPaint);
  reports.push({wallMs:Math.round(wall),eventToPaintMs:Math.round(paint)});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'ماذا تريد أن تضيف؟',exact:true})).toHaveCount(0);
 }
 fs.writeFileSync('docs/experience-phase1/dialog-response-diagnosis.json',JSON.stringify({cpuThrottle:4,isolatedSyntheticData:true,reports},null,2)+'\n');console.log(reports);
}finally{await browser.close();}
