"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","next-wave");fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {page,browser,errors};
}
async function launch(page,term){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(term);
 const btn=page.locator(".catalog-open");
 assert.equal(await btn.count(),1,"Missing tool "+term);
 await btn.click();await page.locator('[data-testid="next-wave-desk"]').waitFor();
}
async function download(page,selector,name){
 const ready=page.waitForEvent("download",{timeout:25000});
 await page.locator(selector).click();
 const file=await ready,dest=path.join(dir,name);
 await file.saveAs(dest);return fs.readFileSync(dest);
}
async function done(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
test("EPUB creation exports a real readable EPUB 3 ZIP package",{timeout:65000},async()=>{
 const s=await setup();try{
  await launch(s.page,"EPUB 3 Book Maker");
  await s.page.locator('[data-testid="epub-title"]').fill("中文科普");
  await s.page.locator('[data-testid="epub-content"]').fill("# 地理\n\nMountains & oceans.");
  const data=await download(s.page,'[data-testid="epub-export"]',"book.epub");
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});
  assert.equal(await zip.file("mimetype").async("string"),"application/epub+zip");
  assert.match(await zip.file("EPUB/chapter.xhtml").async("string"),/Mountains &amp; oceans/u);
 }finally{await done(s,"epub.png");}
});
test("local SHA-256 baseline detects changed user-selected files",{timeout:65000},async()=>{
 const s=await setup();try{
  await launch(s.page,"SHA-256 Baseline Verify");
  await s.page.locator('[data-testid="hash-files"]').setInputFiles([{name:"note.txt",mimeType:"text/plain",buffer:Buffer.from("first") }]);
  const data=await download(s.page,'[data-testid="hash-baseline-export"]',"baseline.json");
  const manifest=JSON.parse(data.toString("utf8"));
  assert.equal(manifest.files.length,1);
  assert.match(manifest.files[0].sha256,/^[0-9a-f]{64}$/u);
  await s.page.locator('[data-testid="hash-files"]').setInputFiles([{name:"note.txt",mimeType:"text/plain",buffer:Buffer.from("second") }]);
  await s.page.locator('[data-testid="hash-verify"]').click();
  assert.match(await s.page.locator('[data-testid="hash-check-results"]').innerText(),/modified/);
 }finally{await done(s,"integrity.png");}
});
test("CSV key audit distinguishes conflict from identical duplicate and downloads evidence",{timeout:65000},async()=>{
 const s=await setup();try{
  await launch(s.page,"CSV Duplicate Key Review");
  await s.page.locator('[data-testid="csv-audit-text"]').fill("ID,Name\n001,Alice\n002,Bob\n001,Clara\n002,Bob");
  assert.match(await s.page.locator('[data-testid="csv-audit-stats"]').innerText(),/冲突组 1/);
  const data=await download(s.page,'[data-testid="csv-audit-export"]',"audit.zip");
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});
  const report=JSON.parse(await zip.file("audit.json").async("string"));
  assert.equal(report.conflictingGroups,1);
  assert.equal(report.groups.length,2);
 }finally{await done(s,"csv-audit.png");}
});
