"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","jsonl");fs.mkdirSync(out,{recursive:true});
test("Offline JSONL logs: real malformed lines, severity/search filters, complete CSV and invalid file recovery",{
 timeout:90000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1380,height:880}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("JSONL / NDJSON Log Viewer");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();await page.locator('[data-testid="jsonl-inspector"]').waitFor();
  const lines=[
   '{"timestamp":"2026-10-22T00:00:00Z","level":"INFO","message":"Booted service"}',
   '{"timestamp":"2026-10-22T00:01:00Z","level":"ERROR","message":"=HYPERLINK(1)"}',
   'this is not json',
   '{"time":"2026-10-22T00:02:00Z","severity":"warning","msg":"Slow request"}',
  ].join("\n");
  await page.locator('[data-testid="jsonl-file"]').setInputFiles({
   name:"sample.jsonl",mimeType:"application/x-ndjson",buffer:Buffer.from(lines,"utf8")
  });
  await page.locator('[data-testid="jsonl-stats"]').waitFor();
  const stats=await page.locator('[data-testid="jsonl-stats"]').innerText();
  assert.match(stats,/全部行数：4/);assert.match(stats,/无效行：1/);
  assert.equal(await page.locator('[data-testid="jsonl-preview"] .task-row').count(),4);
  await page.locator('[data-testid="jsonl-level"]').selectOption("error");
  assert.match(await page.locator('[data-testid="jsonl-visible-count"]').innerText(),/1 行/);
  const d=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="jsonl-export"]').click();
  const dl=await d;assert.equal(dl.suggestedFilename(),"sentinel-jsonl-report.csv");
  const report=path.join(out,"errors.csv");await dl.saveAs(report);
  const csv=fs.readFileSync(report,"utf8");
  assert.match(csv,/HYPERLINK/);
  assert.match(csv,/'=HYPERLINK/);
  assert.doesNotMatch(csv,/Booted service/);
  assert.equal(csv.split("\r\n").filter(Boolean).length,2);

  await page.locator('[data-testid="jsonl-level"]').selectOption("invalid");
  assert.equal(await page.locator('[data-testid="jsonl-preview"] .task-row').count(),1);
  assert.match(await page.locator('[data-testid="jsonl-preview"]').innerText(),/this is not json/);
  await page.locator('[data-testid="jsonl-reset-filter"]').click();
  await page.locator('[data-testid="jsonl-search"]').fill("Slow request");
  assert.equal(await page.locator('[data-testid="jsonl-preview"] .task-row').count(),1);
  await page.locator('[data-testid="jsonl-reset-filter"]').click();

  await page.locator('[data-testid="jsonl-file"]').setInputFiles({
   name:"broken.jsonl",mimeType:"application/x-ndjson",buffer:Buffer.from([0xff,0xfe,0x00])
  });
  await page.locator('[data-testid="jsonl-status"]').filter({hasText:"之前的报告已保留"}).waitFor();
  assert.match(await page.locator('[data-testid="jsonl-stats"]').innerText(),/全部行数：4/);
  await page.locator('[data-testid="jsonl-clear"]').click();
  assert.equal(await page.locator('[data-testid="jsonl-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
