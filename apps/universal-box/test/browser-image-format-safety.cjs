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
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"Convert all & save ZIP"}).click();
  const dl=await pending;
  const file=path.join(dest,"converted-image.zip");await dl.saveAs(file);
  const zip=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
  const entries=Object.keys(zip.files).filter(x=>x.endsWith(".jpg"));
  assert.equal(entries.length,1);
  const jpeg=await zip.file(entries[0]).async("nodebuffer");
  assert.deepEqual([...jpeg.subarray(0,3)],[255,216,255]);
  // Try a misleading file extension, which must not yield a fake image result.
  await page.locator("#batch-image-files").setInputFiles([
   {name:"fake.jpg",mimeType:"image/jpeg",buffer:png}
  ]);
  await page.getByRole("button",{name:"Convert all & save ZIP"}).click();
  assert.match(await page.locator("p[role=status]").last().innerText(),/extension does not match/i);
  await page.screenshot({path:path.join(dest,"image-safety.png"),fullPage:true});
  assert.deepEqual(exceptions,[]);
 }finally{await page.close();await browser.close();}
});
