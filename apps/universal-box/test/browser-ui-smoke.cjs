"use strict";
/** Chromium smoke of actual Vite/React app (not native WKWebView).
 * UI catalog coverage != deep verification of every individual operation.
 */
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const JSZip=require("jszip");
const {chromium}=require("playwright");

const ROOT=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const reportPath=path.join(__dirname,"browser-test-results");
fs.mkdirSync(reportPath,{recursive:true});
async function openApp(browser){
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 await page.goto(ROOT,{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator(".app-shell").waitFor({timeout:15000});
 return page;
}
async function allTools(page){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator(".catalog-card").first().waitFor();
}
test("Universal Box loads and every catalog entry routes to a mounted workspace", {timeout:180000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await allTools(page);
  const count=await page.locator(".catalog-open").count();
  assert.ok(count>=85,"unexpectedly short tool catalog: "+count);
  const checked=[];
  for(let i=0;i<count;i++){
   const name=(await page.locator(".catalog-open").nth(i).innerText()).split("\n")[0];
   await page.locator(".catalog-open").nth(i).click();
   await page.locator("#main-content").waitFor({state:"visible"});
   const text=(await page.locator("#main-content").innerText()).trim();
   assert.ok(text.length>35,"tool workspace blank: "+name);
   checked.push(name);
   await allTools(page);
  }
  fs.writeFileSync(path.join(reportPath,"navigation-smoke.json"),JSON.stringify({
   total:checked.length,checked,uncaughtErrors:errors,
   note:"Mount/navigation smoke; not full operation-level tests for each catalog item."
  },null,2));
  await page.screenshot({path:path.join(reportPath,"tool-catalog.png"),fullPage:true});
  assert.deepEqual(errors,[],"Some workspaces threw uncaught errors: "+errors.join(" | "));
  console.log("PASS: "+checked.length+" catalog entries route to rendered workspaces.");
 }finally{await page?.close();await browser.close();}
});
test("integrated Web Capture ZIP contains working original manifest and files", {timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  await page.locator('.sidebar button.nav-item[aria-label^="Web Capture"]').click();
  await page.locator('[data-testid="export-companion"]').waitFor();
  const download=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="export-companion"]').click();
  const object=await download;
  const zipFile=path.join(reportPath,"UniversalBox-WebCapture-browser-export.zip");
  await object.saveAs(zipFile);
  const archive=await JSZip.loadAsync(fs.readFileSync(zipFile));
  assert.deepEqual(Object.keys(archive.files).sort(),["manifest.json","popup.html","popup.js"].sort());
  const manifest=JSON.parse(await archive.file("manifest.json").async("string"));
  assert.equal(manifest.version,"0.3.1");
  assert.deepEqual(manifest.permissions,["activeTab","scripting","clipboardWrite"]);
  assert.equal(manifest.background,undefined);
  assert.equal(manifest.host_permissions,undefined);
  await page.screenshot({path:path.join(reportPath,"web-capture-companion.png"),fullPage:true});
 }finally{await page?.close();await browser.close();}
});
test("CSV cleanup removes duplicate/blank rows, requires user approval and exports safe CSV", {timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  await page.locator('.sidebar button.nav-item[aria-label^="Web Capture"]').click();
  const source=page.locator('[data-testid="csv-source"]');
  await source.fill("Name,Score\n Ada , =1+1\n Ada , =1+1\n,\n");
  const text=await page.locator(".ub-companion-metrics").innerText();
  assert.match(text,/3\s*数据行/);
  assert.match(text,/1\s*重复行/);
  assert.match(text,/1\s*空行/);
  const result=page.locator('[data-testid="csv-preview"]');
  assert.match(await result.innerText(),/"Ada","'=1\+1"/);
  const btn=page.locator('[data-testid="save-cleaned"]');
  assert.equal(await btn.isDisabled(),true);
  await page.locator(".ub-companion-confirm input").check();
  const download=page.waitForEvent("download",{timeout:15000});
  await btn.click();
  const file=await download;
  const target=path.join(reportPath,"csv-cleanroom-export.csv");
  await file.saveAs(target);
  const content=fs.readFileSync(target,"utf8");
  assert.match(content,/"Ada","'=1\+1"/);
  assert.doesNotMatch(content,/^\s*,\s*$/m);
  assert.equal((content.match(/"Ada"/g)||[]).length,1);
  await page.screenshot({path:path.join(reportPath,"csv-review.png"),fullPage:true});
 }finally{await page?.close();await browser.close();}
});

test("File Intake lets users exclude mistaken source files before SHA-256 scan without deleting anything",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await allTools(page);
  await page.locator("#all-tools-search").fill("File Intake");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  const target=page.locator('input[aria-label="选择文件进行本地格式与哈希检查"]');
  const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  await target.setInputFiles([
   {name:"报告.pdf",mimeType:"application/pdf",buffer:pdf},
   {name:"报告.pdf",mimeType:"application/pdf",buffer:Buffer.from(pdf)},
   {name:"图表.png",mimeType:"image/png",buffer:png}
  ]);
  const stage=page.locator('[data-testid="intake-staged-list"]');
  await stage.waitFor();
  assert.equal(await stage.locator('[data-testid="intake-staged-row"]').count(),3);
  assert.match(await page.locator('[aria-label="Scan review"]').innerText(),/3 个文件/);
  assert.match(await page.locator('[aria-label="Scan review"]').innerText(),/同名文件/);
  await page.getByRole("button",{name:"从本次扫描排除第 2 个文件：报告.pdf"}).click();
  assert.equal(await stage.locator('[data-testid="intake-staged-row"]').count(),2);
  const review=await page.locator('[aria-label="Scan review"]').innerText();
  assert.match(review,/2 个文件/);
  assert.doesNotMatch(review,/同名文件/);
  assert.match(await page.locator('p[role="status"]').last().innerText(),/磁盘上的原文件没有改变/);
  await page.getByRole("button",{name:"开始本机扫描"}).click();
  await page.waitForFunction(()=>{
   const summary=document.querySelector('[aria-label="Inspection summary"]');
   return (summary?.textContent??"").includes("检查文件2");
  },null,{timeout:20000});
  const summary=await page.locator('[aria-label="Inspection summary"]').innerText();
  assert.match(summary,/检查文件\s*2/);
  const inspected=await page.locator('[aria-label="Inspected files"] [role="listitem"]').allInnerTexts();
  assert.equal(inspected.length,2);
  assert.ok(inspected.some(x=>x.includes("报告.pdf")));
  assert.ok(inspected.some(x=>x.includes("图表.png")));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(reportPath,"file-intake-exclusion.png"),fullPage:true});
 }finally{await page.close();await browser.close();}
});
