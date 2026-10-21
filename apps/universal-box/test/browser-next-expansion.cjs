"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","next-expansion");fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function openTool(page,search){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(search);
 assert.equal(await page.locator(".catalog-open").count(),1,"Catalog entry missing: "+search);
 await page.locator(".catalog-open").click();
 await page.locator('[data-testid="new-tools-desk"]').waitFor();
}
async function downloaded(page,selector,filename){
 const upcoming=page.waitForEvent("download",{timeout:25000});
 await page.locator(selector).click();const download=await upcoming;
 const dest=path.join(dir,filename);await download.saveAs(dest);
 return fs.readFileSync(dest).toString("utf8");
}
async function finish(session,name){
 try{await session.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(session.errors,[]);}
 finally{await session.page.close();await session.browser.close();}
}
test("browser bookmark import rejects unsafe scheme, provides accurate CSV & Markdown",{timeout:65000},async()=>{
 const s=await setup();try{
  await openTool(s.page,"Bookmark HTML Organizer");
  await s.page.locator('[data-testid="bookmarks-source"]').fill('<DL><DT><A HREF="https://example.org/x?a=1&amp;b=2">学习 &amp; 科学</A><DT><A HREF="javascript:alert(1)">unsafe</A></DL>');
  assert.match(await s.page.locator('[data-testid="bookmarks-stats"]').innerText(),/1 可用书签/);
  const csv=await downloaded(s.page,'[data-testid="bookmarks-csv-export"]',"bookmarks.csv");
  assert.match(csv,/学习 & 科学/);assert.match(csv,/a=1&b=2/);assert.doesNotMatch(csv,/javascript/u);
  const md=await downloaded(s.page,'[data-testid="bookmarks-md-export"]',"bookmarks.md");
  assert.match(md,/学习 & 科学/u);
 }finally{await finish(s,"bookmarks.png");}
});
test("actual imported calendar exposes overlaps and exports source-derived UTC times",{timeout:65000},async()=>{
 const s=await setup();try{
  await openTool(s.page,"ICS Calendar Import");
  assert.match(await s.page.locator('[data-testid="ics-stats"]').innerText(),/2 个事件 · 1 对时间冲突/);
  const csv=await downloaded(s.page,'[data-testid="ics-csv-export"]',"calendar.csv");
  assert.match(csv,/2026-11-12T09:00:00Z/);assert.match(csv,/Science Demo/);
  await s.page.locator('[data-testid="ics-source"]').fill("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=Europe/Dublin:20261112T090000\nEND:VEVENT\nEND:VCALENDAR");
  assert.match(await s.page.getByRole("alert").innerText(),/TZID/);
 }finally{await finish(s,"calendar.png");}
});
test("real SRT QA finds timing issues and exports warning evidence",{timeout:65000},async()=>{
 const s=await setup();try{
  await openTool(s.page,"SRT VTT Subtitle Timeline QA");
  assert.match(await s.page.locator('[data-testid="subtitle-qa-stats"]').innerText(),/3 条字幕/);
  const raw=await downloaded(s.page,'[data-testid="subtitle-qa-json-export"]',"subtitle-qa.json");
  const result=JSON.parse(raw);assert.equal(result.count,3);
  assert.ok(result.warnings.some(w=>w.category==="overlap"));
  const csv=await downloaded(s.page,'[data-testid="subtitle-qa-csv-export"]',"subtitle-qa.csv");
  assert.match(csv,/overlap/);
 }finally{await finish(s,"subtitle.png");}
});
