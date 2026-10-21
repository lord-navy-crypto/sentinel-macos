"use strict";
/** Browser-level exports and reinspection for subtitle, file organizer and calendar. */
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","life-media");
fs.mkdirSync(folder,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function goto(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const button=page.locator(".catalog-open");
 assert.equal(await button.count(),1,"Expected one catalog entry for "+query);
 await button.click();
}
async function download(page,selector,name){
 const promise=page.waitForEvent("download",{timeout:25000});
 await page.locator(selector).click();
 const file=await promise,target=path.join(folder,name);
 await file.saveAs(target);const data=fs.readFileSync(target);
 assert.ok(data.length>30,"Generated empty "+name);
 return data;
}
async function cleanup(s,name){
 try{await s.page.screenshot({path:path.join(folder,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
test("real two-point subtitle drift resync exports corrected WebVTT",{timeout:60000},async()=>{
 const s=await open();
 try{
  await goto(s.page,"Subtitle Drift Repair");
  await s.page.locator('[data-testid="life-sub-format"]').selectOption("vtt");
  await s.page.locator('[data-testid="life-sub-a1"]').fill("00:00:01.000");
  await s.page.locator('[data-testid="life-sub-b1"]').fill("00:00:02.000");
  await s.page.locator('[data-testid="life-sub-a2"]').fill("00:00:11.000");
  await s.page.locator('[data-testid="life-sub-b2"]').fill("00:00:12.200");
  await s.page.locator('[data-testid="life-sub-source"]').fill(
   "1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n00:00:11,000 --> 00:00:13,000\nI can do it");
  assert.match(await s.page.locator('[data-testid="life-sub-stats"]').innerText(),/2 条字幕/);
  const out=(await download(s.page,'[data-testid="life-sub-export"]',"synced.vtt")).toString("utf8");
  assert.match(out,/WEBVTT/);
  assert.match(out,/00:00:02\.000 --> 00:00:03\.020/);
  assert.match(out,/00:00:12\.200 --> 00:00:14\.240/);
  assert.match(out,/你好/);
 }finally{await cleanup(s,"subtitle.png");}
});
test("real categorized file ZIP preserves bytes and manifest without overwriting inputs",{timeout:60000},async()=>{
 const s=await open();
 try{
  await goto(s.page,"Smart File Organizer");
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  const notes=Buffer.from("Hello from Word note","utf8");
  const audio=Buffer.from("Local audio bytes","utf8");
  await s.page.locator('[data-testid="life-organize-files"]').setInputFiles([
   {name:"photo.png",mimeType:"image/png",buffer:Buffer.from(png)},
   {name:"report.docx",mimeType:"application/octet-stream",buffer:notes},
   {name:"sample.wav",mimeType:"audio/wav",buffer:audio}
  ]);
  assert.match(await s.page.locator('[data-testid="life-organize-count"]').innerText(),/3 文件/);
  const zip=await JSZip.loadAsync(await download(s.page,'[data-testid="life-organize-export"]',"organized.zip"),{checkCRC32:true});
  const paths=Object.keys(zip.files);
  for(const x of ["Pictures/001-photo.png","Documents/002-report.docx","Audio/003-sample.wav","universal-box-organize-manifest.json"])
   assert.ok(paths.includes(x),"Missing "+x);
  assert.deepEqual(Buffer.from(await zip.file("Pictures/001-photo.png").async("uint8array")),Buffer.from(png));
  assert.equal(await zip.file("Documents/002-report.docx").async("string"),"Hello from Word note");
  const manifest=JSON.parse(await zip.file("universal-box-organize-manifest.json").async("string"));
  assert.equal(manifest.count,3);
 }finally{await cleanup(s,"organizer.png");}
});
test("real multi-event .ics output contains two distinct events and reports overlaps",{timeout:60000},async()=>{
 const s=await open();
 try{
  await goto(s.page,"Bulk Calendar ICS Generator");
  await s.page.locator('[data-testid="life-calendar-rows"]').fill(
   "2026-11-12T09:00 | 2026-11-12T10:00 | Seminar | School\n"
   +"2026-11-12T09:30 | 2026-11-12T10:15 | Lab | Room 3");
  assert.match(await s.page.locator('[data-testid="life-calendar-count"]').innerText(),/2 个事件，1 组时间冲突/);
  const ics=(await download(s.page,'[data-testid="life-calendar-export"]',"calendar.ics")).toString("utf8");
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
  assert.match(ics,/DTSTART:20261112T090000Z/);
  assert.match(ics,/SUMMARY:Seminar/);
  assert.match(ics,/SUMMARY:Lab/);
  const ids=[...ics.matchAll(/UID:(.+)\r\n/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,2);
 }finally{await cleanup(s,"calendar.png");}
});