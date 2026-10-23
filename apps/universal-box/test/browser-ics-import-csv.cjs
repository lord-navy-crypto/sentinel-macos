"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","ics-import");
fs.mkdirSync(out,{recursive:true});

test("Existing ICS generator -> new offline ICS import -> actual CSV, with safe failure recovery",{
 timeout:90000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1420,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Bulk Calendar ICS Generator");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="ics-import-desk"]').waitFor();
  const rows=[
   "2026-11-12T09:00 | 2026-11-12T10:00 | First session | Room A",
   "2026-11-12T09:30 | 2026-11-12T10:30 | Second session | Room B",
  ].join("\n");
  await page.locator('[data-testid="life-calendar-rows"]').fill(rows);
  assert.match(await page.locator('[data-testid="life-calendar-count"]').innerText(),/2 个事件，1 组时间冲突/);
  const pending=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="life-calendar-export"]').click();
  const icsDownload=await pending;
  assert.equal(icsDownload.suggestedFilename(),"universal-box-multi-calendar.ics");
  const source=path.join(out,"generated.ics");
  await icsDownload.saveAs(source);
  const bytes=fs.readFileSync(source);
  assert.match(bytes.toString("utf8"),/BEGIN:VCALENDAR/);
  assert.match(bytes.toString("utf8"),/BEGIN:VEVENT/);

  await page.locator('[data-testid="ics-import-file"]').setInputFiles({
   name:"archive.ics",mimeType:"text/calendar",buffer:bytes,
  });
  await page.locator('[data-testid="ics-import-stats"]').waitFor();
  assert.match(await page.locator('[data-testid="ics-import-stats"]').innerText(),/日程：2/);
  assert.match(await page.locator('[data-testid="ics-import-stats"]').innerText(),/UTC 时间重叠：1 组/);
  const displayed=await page.locator('[data-testid="ics-import-rows"]').innerText();
  assert.match(displayed,/2026-11-12T09:00:00Z/);
  assert.match(displayed,/First session/);
  assert.match(displayed,/Second session/);

  const csvPending=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="ics-export-csv"]').click();
  const csvDownload=await csvPending;
  assert.equal(csvDownload.suggestedFilename(),"sentinel-calendar-from-ics.csv");
  const csvPath=path.join(out,"roundtrip-events.csv");
  await csvDownload.saveAs(csvPath);
  const csv=fs.readFileSync(csvPath,"utf8");
  assert.match(csv,/start_utc_or_date,end_utc_or_date/);
  assert.match(csv,/"First session","Room A"/);
  assert.match(csv,/"Second session","Room B"/);
  assert.equal(csv.split("\r\n").filter(Boolean).length,3);

  // Recurrence must be refused rather than silently flattened into one occurrence.
  const bad=bytes.toString("utf8").replace("SUMMARY:First session",
   "RRULE:FREQ=DAILY;COUNT=10\r\nSUMMARY:First session");
  await page.locator('[data-testid="ics-import-file"]').setInputFiles({
   name:"recurring.ics",mimeType:"text/calendar",buffer:Buffer.from(bad),
  });
  await page.locator('[data-testid="ics-import-status"]')
   .filter({hasText:"之前的日程档案仍保留"}).waitFor();
  assert.match(await page.locator('[data-testid="ics-import-stats"]').innerText(),/日程：2/);
  assert.deepEqual(fs.readFileSync(source),bytes);
  await page.locator('[data-testid="ics-clear"]').click();
  assert.equal(await page.locator('[data-testid="ics-import-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
