"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","next-wave");fs.mkdirSync(dir,{recursive:true});
test("real CSV key audit detects conflicts and downloads trustworthy evidence",{timeout:65000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("CSV Duplicate Key Review");
  const btn=page.locator(".catalog-open");
  assert.equal(await btn.count(),1);
  await btn.click();await page.locator('[data-testid="next-wave-desk"]').waitFor();
  await page.locator('[data-testid="csv-audit-text"]').fill("ID,Name\n001,Alice\n002,Bob\n001,Clara\n002,Bob");
  assert.match(await page.locator('[data-testid="csv-audit-stats"]').innerText(),/冲突组 1/);
  const dl=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="csv-audit-export"]').click();
  const file=await dl,dest=path.join(dir,"audit.zip");await file.saveAs(dest);
  const zip=await JSZip.loadAsync(fs.readFileSync(dest),{checkCRC32:true});
  const report=JSON.parse(await zip.file("audit.json").async("string"));
  assert.equal(report.conflictingGroups,1);
  assert.equal(report.groups.length,2);
  const csv=await zip.file("duplicate-key-rows.csv").async("string");
  assert.match(csv,/source_row/);
  await page.screenshot({path:path.join(dir,"csv-audit.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
