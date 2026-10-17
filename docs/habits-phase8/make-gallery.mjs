import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
const out=new URL("./",import.meta.url).pathname;
const pages=[["home","الرئيسية"],["habits","العادات والمسارات"],["habit-reading","العادة المتدرجة"],["ideas-reminders","التذكيرات"],["project-detail","تفاصيل المشروع"],["progress","التقدم"],["habit-path-culture","تفاصيل المسار"],["backup","النسخ الاحتياطي"]];
const tiles=pages.flatMap(([key,label])=>["light","dark"].map(theme=>`<figure><figcaption>${label} — ${theme==="light"?"فاتح":"داكن"}</figcaption><a href="${key}-${theme}-390.png"><img src="${key}-${theme}-390.png" alt="${label}" /></a></figure>`)).join("");
const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>مسار — مراجعة النسخة المرشحة</title><style>body{margin:24px;background:#e5eeeb;color:#163f34;font-family:Arial,sans-serif}h1{font-size:24px}p{font-size:15px}section{display:grid;grid-template-columns:repeat(4,240px);gap:18px}figure{margin:0;border-radius:12px;overflow:hidden;background:#fff}figcaption{height:36px;display:flex;align-items:center;justify-content:center}img{width:240px;height:520px;object-fit:cover;object-position:top;display:block}a:focus{outline:3px solid green}</style><h1>مسار — النسخة المرشحة habits-rc1</h1><p>لقطات Chromium فعلية، عرض 390 بكسل، دون توليد صور. اضغط أي صورة لفتح اللقطة الكاملة. العرض هنا مقتطف من أعلى كل صفحة.</p><section>${tiles}</section></html>`;
fs.writeFileSync(path.join(out,"gallery.html"),html);
const server=spawn("python3",["-m","http.server","4273","--bind","127.0.0.1","--directory",out],{stdio:"ignore"});
for(let i=0;i<40;i++){try{if((await fetch("http://127.0.0.1:4273/gallery.html")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
try{const page=await browser.newPage({viewport:{width:1064,height:844},deviceScaleFactor:1});await page.goto("http://127.0.0.1:4273/gallery.html");await page.locator("img").last().waitFor();await page.screenshot({path:path.join(out,"overview.png"),fullPage:true});}finally{await browser.close();server.kill("SIGTERM");}
