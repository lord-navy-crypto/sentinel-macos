"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","graph-highres-png");fs.mkdirSync(dir,{recursive:true});
test("Live graph outputs genuine high-res PNG plus unchanged SVG",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 async function download(btn,name){
  assert.equal(await btn.count(),1,"Expected one visible graph export control for "+name);
  const [file]=await Promise.all([
    page.waitForEvent("download",{timeout:15000}),
    btn.click({timeout:15000}),
  ]);
  assert.equal(file.suggestedFilename(),name);
  const target=path.join(dir,name);await file.saveAs(target);return fs.readFileSync(target);
 }
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Advanced Graph / 高级绘图");
  const open=page.locator(".catalog-open");assert.equal(await open.count(),1);await open.click();
  await page.locator("#advanced-graph-svg").waitFor();
  const svg=await download(page.getByRole("button",{name:"Export SVG"}),"daily-desk-graph.svg");
  assert.match(svg.toString("utf8"),/<svg/u);
  const png=await download(page.locator('[data-testid="graph-export-png"]'),"daily-desk-graph.png");
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),1560);assert.equal(png.readUInt32BE(20),940);
  assert.ok(png.length>3500,"Expected meaningful nonblank graph image");
  await page.locator('[data-testid="graph-copy-png"]').click();
  const status=await page.locator(".graph-workbench p[role=status]").last().innerText();
  assert.match(status,/Copied high-resolution|Graph copy unavailable/);
  await page.screenshot({path:path.join(dir,"graph-highres.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
