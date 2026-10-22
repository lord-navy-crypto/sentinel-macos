"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const url=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dest=path.join(__dirname,"browser-test-results","meeting-minutes");
fs.mkdirSync(dest,{recursive:true});
async function saveZip(page,filename){
 const pending=page.waitForEvent("download",{timeout:30000});
 await page.locator('[data-testid="meeting-export"]').click();
 const dl=await pending,target=path.join(dest,filename);
 await dl.saveAs(target);
 return JSZip.loadAsync(fs.readFileSync(target),{checkCRC32:true});
}
test("Meetings produce genuine editable Word, action CSV and truthful attendee/task previews",{timeout:95000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(url,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Meeting Minutes & Assigned Tasks");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="meeting-minutes-desk"]').waitFor();
  const summary=await page.locator('[data-testid="meeting-summary"]').innerText();
  assert.match(summary,/2 个明确分配的任务/);
  assert.match(summary,/3 位记录的参会者/);
  assert.match(await page.locator('[data-testid="meeting-action-preview"]').innerText(),/Alex.*2026-11-02/s);
  const zip=await saveZip(page,"meeting-minutes-default.zip");
  for(const name of ["meeting/meeting-minutes.docx","meeting/meeting-minutes.txt",
   "actions/assigned-actions.csv","actions/open-action-deadlines.ics","reports/manifest.json"]){
   assert.ok(zip.file(name),"Missing real exported document "+name);
  }
  const word=await JSZip.loadAsync(await zip.file("meeting/meeting-minutes.docx").async("uint8array"));
  assert.match(await word.file("word/document.xml").async("string"),/Review prototype changes/);
  assert.match(await zip.file("meeting/meeting-minutes.txt").async("string"),/Keep the next release scope focused/);
  assert.match(await zip.file("actions/assigned-actions.csv").async("string"),/"A-001","Review prototype changes","Alex"/);
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.actionCount,2);
  assert.equal(manifest.calendarEvents,2);
  const packagedIcs=await zip.file("actions/open-action-deadlines.ics").async("string");
  assert.equal((packagedIcs.match(/BEGIN:VEVENT/gu)||[]).length,2);
  assert.match(packagedIcs,/DTSTART;VALUE=DATE:20261102/);
  assert.doesNotMatch(packagedIcs,/BEGIN:VALARM/);
  assert.match((await page.locator('[data-testid="meeting-calendar-count"]').textContent())??"",/2\s*\/\s*2/);
  const icsPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="meeting-calendar-export"]').click();
  const calendarTarget=path.join(dest,"meeting-calendar.ics");
  await (await icsPending).saveAs(calendarTarget);
  const standaloneIcs=fs.readFileSync(calendarTarget,"utf8");
  assert.match(standaloneIcs,/BEGIN:VCALENDAR\r\nVERSION:2.0/);
  assert.equal((standaloneIcs.match(/BEGIN:VEVENT/gu)||[]).length,2);
  assert.doesNotMatch(standaloneIcs,/ATTENDEE:|BEGIN:VALARM/);

  await page.locator('[data-testid="meeting-title"]').fill("项目审议会议");
  await page.locator('[data-testid="meeting-decisions"]').fill("审核现有文档并保留记录");
  await page.locator('[data-testid="meeting-actions-csv"]').fill(
   "id,task,owner,due_date,priority,status,notes\n"+
   "CN-01,准备交付材料,王丽,2026-12-02,high,todo,核对中文姓名");
  assert.match(await page.locator('[data-testid="meeting-action-preview"]').innerText(),/王丽/);
  const cn=await saveZip(page,"meeting-minutes-chinese.zip");
  const cnWord=await JSZip.loadAsync(await cn.file("meeting/meeting-minutes.docx").async("uint8array"));
  const xml=await cnWord.file("word/document.xml").async("string");
  assert.match(xml,/项目审议会议/);assert.match(xml,/王丽/);assert.match(xml,/审核现有文档并保留记录/);
  assert.match(await cn.file("actions/assigned-actions.csv").async("string"),/准备交付材料/);
  const cnCalendar=(await cn.file("actions/open-action-deadlines.ics").async("string"))
   .replace(/\r\n[ \t]/gu,"");
  assert.match(cnCalendar,/准备交付材料/);
  assert.match(cnCalendar,/王丽/);
  await page.locator('[data-testid="meeting-actions-csv"]').fill(
   "id,task,owner,due_date,priority,status,notes\n"+
   "A-01,To-do,Alex,2026-11-04,normal,todo,\n"+
   "A-02,Done task,Lee,2026-11-05,normal,done,"
  );
  assert.match(await page.locator('[data-testid="meeting-calendar-count"]').innerText(),/1 \/ 2/);
  const donePending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="meeting-calendar-export"]').click();
  const doneFile=path.join(dest,"meeting-open-only.ics");
  await (await donePending).saveAs(doneFile);
  assert.doesNotMatch(fs.readFileSync(doneFile,"utf8"),/Done task/);
  await page.locator('[data-testid="meeting-calendar-include-done"]').check();
  assert.match(await page.locator('[data-testid="meeting-calendar-count"]').innerText(),/2 \/ 2/);

  await page.locator('[data-testid="meeting-actions-csv"]').fill(
   "id,task,owner,due_date,priority,status,notes\n"+
   "X-01,Missing owner,,2026-11-02,normal,todo,");
  await page.locator('[data-testid="meeting-error"]').waitFor();
  assert.match(await page.locator('[data-testid="meeting-error"]').innerText(),/Owner/);
  assert.equal(await page.locator('[data-testid="meeting-export"]').count(),0);
  await page.screenshot({path:path.join(dest,"meeting-validation.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
