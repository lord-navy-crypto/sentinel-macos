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
  // New meetings are blank: never accidentally export the fictional sample record.
  for(const key of ["title","meetingDate","attendees","agenda","discussion","decisions"]){
   assert.equal(await page.locator('[data-testid="meeting-"+key]').inputValue(),"",key+" must start empty");
  }
  assert.equal(await page.locator('[data-testid="meeting-actions-csv"]').inputValue(),
   "id,task,owner,due_date,priority,status,notes");
  assert.equal(await page.locator('[data-testid="meeting-export"]').count(),0);
  assert.equal(await page.locator('[data-testid="meeting-empty-guide"]').count(),1);
  // Enter the test fixture explicitly, as a real user would.
  await page.locator('[data-testid="meeting-title"]').fill("Project status and next steps");
  await page.locator('[data-testid="meeting-meetingDate"]').fill("2026-10-21");
  await page.locator('[data-testid="meeting-location"]').fill("Meeting room / video call");
  await page.locator('[data-testid="meeting-facilitator"]').fill("Jordan");
  const nl=String.fromCharCode(10);
  await page.locator('[data-testid="meeting-attendees"]').fill(["Alex","Jordan","Lee"].join(nl));
  await page.locator('[data-testid="meeting-agenda"]').fill(
   ["Review current progress","Discuss outstanding issues","Assign next steps"].join(nl));
  await page.locator('[data-testid="meeting-discussion"]').fill(
   ["Prototype ready for review.","Two open issues were discussed."].join(nl));
  await page.locator('[data-testid="meeting-decisions"]').fill(
   ["Keep the next release scope focused.","Use the shared handover checklist."].join(nl));
  await page.locator('[data-testid="meeting-actions-csv"]').fill([
   "id,task,owner,due_date,priority,status,notes",
   "A-001,Review prototype changes,Alex,2026-11-02,high,todo,Check accessibility",
   "A-002,Share project checklist,Jordan,2026-11-04,normal,in_progress,Use team template",
  ].join(nl));
  const summary=await page.locator('[data-testid="meeting-summary"]').innerText();
  assert.match(summary,/2 个明确分配的任务/);
  assert.match(summary,/3 位记录的参会者/);
  assert.match(await page.locator('[data-testid="meeting-action-preview"]').innerText(),/Alex.*2026-11-02/s);
  const zip=await saveZip(page,"meeting-minutes-default.zip");
  for(const name of ["meeting/meeting-minutes.docx","meeting/meeting-minutes.txt",
   "actions/assigned-actions.csv","reports/manifest.json"]){
   assert.ok(zip.file(name),"Missing real exported document "+name);
  }
  const word=await JSZip.loadAsync(await zip.file("meeting/meeting-minutes.docx").async("uint8array"));
  assert.match(await word.file("word/document.xml").async("string"),/Review prototype changes/);
  assert.match(await zip.file("meeting/meeting-minutes.txt").async("string"),/Keep the next release scope focused/);
  assert.match(await zip.file("actions/assigned-actions.csv").async("string"),/"A-001","Review prototype changes","Alex"/);
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.actionCount,2);
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
