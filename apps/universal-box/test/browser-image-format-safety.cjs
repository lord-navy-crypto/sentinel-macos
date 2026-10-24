"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dest=path.join(__dirname,"browser-test-results","image-format-safety");
fs.mkdirSync(dest,{recursive:true});
test("Existing batch image tool refuses spoofing and exports real JPEG in ZIP",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const exceptions=[];page.on("pageerror",e=>exceptions.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Batch Image Conversion → ZIP");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator("#batch-image-files").waitFor();
  assert.match(await page.locator('[data-testid="image-compatibility-note"]').innerText(),
   /transparent areas are placed on a white background/i);
  const base64=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=8;c.height=6;
   const ctx=c.getContext("2d");ctx.fillStyle="rgba(20,120,250,0.5)";
   ctx.fillRect(0,0,8,6);
   return c.toDataURL("image/png").split(",")[1];
  });
  const png=Buffer.from(base64,"base64");
  await page.locator("#batch-image-files").setInputFiles([
   {name:"real.png",mimeType:"image/png",buffer:png}
  ]);
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),true);
  await page.getByTestId("image-prepare-preview").click();
  await page.getByTestId("image-output-preview").waitFor({timeout:30000});
  const preview=await page.getByTestId("image-size-report").innerText();
  assert.match(preview,/8×6 → 8×6 px/);
  assert.match(preview,/real.png/);
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),false);
  const before=await page.getByTestId("image-output-preview").locator("img").evaluate(async img=>{
   await (img.complete?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",reject,{once:true});}));
   return {width:img.naturalWidth,height:img.naturalHeight,src:img.src};
  });
  assert.deepEqual({width:before.width,height:before.height},{width:8,height:6});
  assert.ok(before.src.startsWith("blob:"),"Preview must show real converted bytes, not a placeholder");
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByTestId("image-save-reviewed").click();
  const dl=await pending;
  const file=path.join(dest,"converted-image.zip");await dl.saveAs(file);
  const zip=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
  const entries=Object.keys(zip.files).filter(x=>x.endsWith(".jpg"));
  assert.equal(entries.length,1);
  const jpeg=await zip.file(entries[0]).async("nodebuffer");
  assert.deepEqual([...jpeg.subarray(0,3)],[255,216,255]);
  const report=JSON.parse(await zip.file("sentinel-box-image-conversion-report.json").async("string"));
  assert.equal(report.format,"image/jpeg");
  assert.equal(report.records.length,1);
  assert.equal(report.records[0].source,"real.png");
  assert.equal(report.records[0].target,entries[0]);
  assert.equal(report.records[0].sourceBytes,png.length);
  assert.equal(report.records[0].outputBytes,jpeg.length);
  assert.equal(report.records[0].deltaBytes,jpeg.length-png.length);
  assert.equal(report.records[0].width,8);
  assert.equal(report.records[0].height,6);
  assert.equal(report.records[0].sourceWidth,8);
  assert.equal(report.records[0].sourceHeight,6);
  const previewBytes=await page.evaluate(async()=>new Uint8Array(await (await fetch(document.querySelector('[data-testid="image-output-preview"] img').src)).arrayBuffer()).length);
  assert.equal(previewBytes,jpeg.length,"The preview bytes must match the exact ZIP member");
  assert.match(await page.locator('[data-testid="image-size-report"]').innerText(),/Real file size comparison/);
  assert.match(await page.locator('[data-testid="image-size-report"]').innerText(),/real.png/);
  // Changing output quality invalidates the cached ZIP rather than silently saving stale bytes.
  await page.getByRole("slider",{name:/Quality/}).fill("0.65");
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),true);
  assert.equal(await page.getByTestId("image-output-preview").count(),0);
  await page.getByTestId("image-prepare-preview").click();
  await page.getByTestId("image-output-preview").waitFor({timeout:30000});
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),false);
  // Try a misleading file extension, which must not yield a fake image result.
  await page.locator("#batch-image-files").setInputFiles([
   {name:"fake.jpg",mimeType:"image/jpeg",buffer:png}
  ]);
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),true,"Changing files clears previous ZIP preview");
  await page.getByTestId("image-prepare-preview").click();
  assert.match(await page.locator("p[role=status]").last().innerText(),/extension does not match/i);
  assert.equal(await page.getByTestId("image-save-reviewed").isDisabled(),true);
  assert.equal(await page.getByTestId("image-output-preview").count(),0);
  await page.screenshot({path:path.join(dest,"image-safety.png"),fullPage:true});
  assert.deepEqual(exceptions,[]);
 }finally{await page.close();await browser.close();}
});
