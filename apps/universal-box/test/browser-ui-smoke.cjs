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
