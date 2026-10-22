"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","snapshot-diff");fs.mkdirSync(out,{recursive:true});
test("Select two real folders, compare only metadata, export changed/all CSV and preserve good snapshot after invalid import",{
 timeout:110000,
},async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"sentinel-folder-diff-"));
 const before=path.join(temporary,"Before Folder"),after=path.join(temporary,"After Folder");
 fs.mkdirSync(path.join(before,"docs"),{recursive:true});
 fs.mkdirSync(path.join(after,"docs"),{recursive:true});
 const time=new Date("2026-01-01T00:00:00Z");
 function write(dir,rel,text){
  const full=path.join(dir,rel);fs.writeFileSync(full,text);fs.utimesSync(full,time,time);
 }
 write(before,"same.txt","same");write(before,"docs/changed.md","small");write(before,"deleted.csv","old");
 write(after,"same.txt","same");write(after,"docs/changed.md","much longer");write(after,"added.csv","new");
 const originals=[fs.readFileSync(path.join(before,"same.txt")),fs.readFileSync(path.join(after,"docs/changed.md"))];
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1420,height:880},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Folder Snapshot Diff");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="folder-snapshot-diff"]').waitFor();
  await page.locator('[data-testid="snapshot-before-folder"]').setInputFiles(before);
  await page.locator('[data-testid="snapshot-before-stats"]').filter({hasText:"3 文件"}).waitFor();
  await page.locator('[data-testid="snapshot-after-folder"]').setInputFiles(after);
  await page.locator('[data-testid="snapshot-diff-stats"]').waitFor();
  const stats=await page.locator('[data-testid="snapshot-diff-stats"]').innerText();
  assert.match(stats,/新增：1/);assert.match(stats,/删除：1/);assert.match(stats,/元数据变化：1/);assert.match(stats,/元数据相同：1/);
  const text=await page.locator('[data-testid="snapshot-diff-rows"]').innerText();
  assert.match(text,/added.csv/);assert.match(text,/deleted.csv/);assert.match(text,/docs\/changed.md/);
  assert.doesNotMatch(text,/same.txt/);
  const downloadPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="snapshot-export"]').click();
  const downloaded=await downloadPending;
  assert.equal(downloaded.suggestedFilename(),"sentinel-folder-snapshot-diff.csv");
  const csvPath=path.join(out,"changed-only.csv");await downloaded.saveAs(csvPath);
  const csv=fs.readFileSync(csvPath,"utf8");
  assert.match(csv,/docs\/changed.md/);
  assert.doesNotMatch(csv,/Before Folder|After Folder/);
  assert.doesNotMatch(csv,/same.txt/);
  assert.equal(csv.split("\r\n").filter(Boolean).length,4);

  await page.locator('[data-testid="snapshot-only-changes"]').uncheck();
  assert.match(await page.locator('[data-testid="snapshot-showing"]').innerText(),/4 条/);
  const secondPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="snapshot-export"]').click();
  const second=await secondPending;const fullCsv=path.join(out,"all.csv");await second.saveAs(fullCsv);
  assert.match(fs.readFileSync(fullCsv,"utf8"),/same.txt/);
  assert.equal(fs.readFileSync(fullCsv,"utf8").split("\r\n").filter(Boolean).length,5);

  // Invalid new selection must not destroy the last successful snapshots and report.
  await page.locator('[data-testid="snapshot-after-files"]').setInputFiles({
   name:"a".repeat(260)+".txt",mimeType:"text/plain",buffer:Buffer.from("bad"),
  });
  await page.locator('[data-testid="snapshot-status"]').filter({hasText:"之前的有效快照已保留"}).waitFor();
  assert.match(await page.locator('[data-testid="snapshot-diff-stats"]').innerText(),/新增：1/);
  assert.deepEqual(fs.readFileSync(path.join(before,"same.txt")),originals[0]);
  assert.deepEqual(fs.readFileSync(path.join(after,"docs/changed.md")),originals[1]);
  await page.locator('[data-testid="snapshot-clear"]').click();
  assert.equal(await page.locator('[data-testid="snapshot-diff-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{
  await page.close();await browser.close();fs.rmSync(temporary,{recursive:true,force:true});
 }
});
