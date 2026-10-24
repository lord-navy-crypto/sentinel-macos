"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const ROOT=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","photo-heic-preview");
fs.mkdirSync(out,{recursive:true});
async function start(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(ROOT,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill("Target Size Photo Compression");
 assert.equal(await page.locator(".catalog-open").count(),1);
 await page.locator(".catalog-open").click();
 await page.locator('[data-testid="photo-files"]').waitFor();
 return {page,browser,errors};
}
test("Existing photo tool previews real compressed output and byte-level size comparisons before saving",{timeout:80000},async()=>{
 const s=await start();
 try{
  const png=await s.page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=780;c.height=520;
   const ctx=c.getContext("2d");
   for(let y=0;y<c.height;y+=4)for(let x=0;x<c.width;x+=4){
    ctx.fillStyle="rgb("+((x*3+y*7)%255)+","+((x*5+y*2)%255)+","+((x*11+y*3)%255)+")";
    ctx.fillRect(x,y,4,4);
   }
   return c.toDataURL("image/png").split(",")[1];
  });
  await s.page.locator('[data-testid="photo-files"]').setInputFiles([
   {name:"poster.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")},
   {name:"second.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")}
  ]);
  await s.page.locator('[data-testid="photo-max-size"]').selectOption("512");
  await s.page.locator('[data-testid="photo-target-kb"]').fill("110");
  await s.page.locator('[data-testid="photo-preview-run"]').click();
  await s.page.locator('[data-testid="photo-actual-preview"] img').waitFor({timeout:25000});
  assert.equal(await s.page.locator('[data-testid="photo-report"]').count(),2);
  assert.match(await s.page.locator('[data-testid="photo-size-summary"]').innerText(),/原图合计/);
  assert.match(await s.page.locator('[data-testid="photo-size-summary"]').innerText(),/压缩合计/);
  const thumb=await s.page.locator('[data-testid="photo-actual-preview"] img').evaluate(el=>({loaded:el.complete,w:el.naturalWidth}));
  assert.ok(thumb.loaded&&thumb.w>0,"actual output preview image must decode");
  // Compare the exact converted preview blob to the ZIP image member after the local
  // integrity gate. Showing a nice preview is insufficient if a different file is saved.
  const previewBytes=await s.page.locator('[data-testid="photo-actual-preview"] img')
    .evaluate(async img=>[...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
  const pending=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="photo-save"]').click();
  const saved=await pending,file=path.join(out,"batch-photo-preview.zip");
  await saved.saveAs(file);
  const archive=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
  const manifest=JSON.parse(await archive.file("reports/manifest.json").async("string"));
  assert.equal(manifest.files.length,2);
  for(const [i,r] of manifest.files.entries()){
   const img=await archive.file(r.outputName).async("uint8array");
   if(i===0)assert.deepEqual([...img],previewBytes,"saved JPEG must exactly match displayed preview");
   assert.equal(img.length,r.outputBytes);
   assert.equal(r.sizeDeltaBytes,r.originalBytes-r.outputBytes);
   assert.equal(r.smallerThanSource,r.outputBytes<r.originalBytes);
  }
  await s.page.locator('[data-testid="photo-target-kb"]').fill("200");
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"] img').count(),0,"changing settings invalidates stale preview");
  assert.equal(await s.page.locator('[data-testid="photo-size-summary"]').count(),0,"old size reports cannot pass as current settings");
  // The direct one-click compression path remains available, but it also validates the
  // generated ZIP and real magic bytes before the save dialog is allowed.
  const next=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="photo-save"]').click();
  const direct=await next;const directFile=path.join(out,"batch-photo-direct-verified.zip");
  await direct.saveAs(directFile);
  const directZip=await JSZip.loadAsync(fs.readFileSync(directFile),{checkCRC32:true});
  const directMeta=JSON.parse(await directZip.file("reports/manifest.json").async("string"));
  assert.equal(directMeta.settings.targetKB,200);
  assert.equal(directMeta.files.length,2);
  for(const rec of directMeta.files){
   const bytes=await directZip.file(rec.outputName).async("uint8array");
   assert.equal(bytes.length,rec.outputBytes);
   assert.deepEqual([...bytes.slice(0,3)],[255,216,255]);
  }
  await s.page.screenshot({path:path.join(out,"photo-preview.png"),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});
test("HEIC browser import refuses unsupported native conversion and never fabricates a result",{timeout:55000},async()=>{
 const s=await start();
 try{
  const heic=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypheic"),Buffer.alloc(100)]);
  await s.page.locator('[data-testid="photo-files"]').setInputFiles({
   name:"IMG_0001.HEIC",mimeType:"image/heic",buffer:heic
  });
  assert.match(await s.page.locator('[data-testid="photo-count"]').innerText(),/1 张/);
  await s.page.locator('[data-testid="photo-preview-run"]').click();
  await s.page.waitForFunction(()=>document.querySelector('[data-testid="speech-portable-status"]')?.textContent?.includes("HEIC decoding needs"));
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"]').count(),0);
  assert.equal(await s.page.locator('[data-testid="photo-report"]').count(),0);
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});


test("Photo workbench locks input/quality changes during an active local encoding, then lets user start over",{timeout:85000},async()=>{
 const {page,browser,errors}=await start();
 try{
  const b64=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=560;c.height=420;
   const ctx=c.getContext("2d");ctx.fillStyle="#acddee";ctx.fillRect(0,0,c.width,c.height);
   ctx.fillStyle="#132436";ctx.font="24px sans-serif";ctx.fillText("Local office photo",30,80);
   return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('[data-testid="photo-files"]').setInputFiles({name:"first.png",mimeType:"image/png",buffer:Buffer.from(b64,"base64")});
  await page.evaluate(()=>{
   const native=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(cb,type,quality){
    if(type==="image/jpeg")return native.call(this,b=>setTimeout(()=>cb(b),500),type,quality);
    return native.call(this,cb,type,quality);
   };
  });
  await page.locator('[data-testid="photo-preview-run"]').click();
  for(const id of ["photo-files","photo-format","photo-max-size","photo-target-kb"]){
   assert.equal(await page.locator('[data-testid="'+id+'"]').isDisabled(),true,"Input locked during encoding: "+id);
  }
  await page.locator('[data-testid="photo-actual-preview"] img').waitFor({timeout:30000});
  assert.equal(await page.locator('[data-testid="photo-files"]').isDisabled(),false);
  await page.locator('[data-testid="photo-target-kb"]').fill("330");
  assert.equal(await page.locator('[data-testid="photo-actual-preview"] img').count(),0,"Old conversion preview discarded");
  assert.equal(await page.locator('[data-testid="photo-report"]').count(),0);
  await page.locator('[data-testid="photo-files"]').setInputFiles({name:"second.png",mimeType:"image/png",buffer:Buffer.from(b64,"base64")});
  assert.match(await page.locator('[data-testid="photo-count"]').innerText(),/1 张/);
  assert.equal(await page.locator('[data-testid="photo-report"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Cancel immediately aborts real photo JPEG conversion without exposing a partial ZIP",{timeout:85000},async()=>{
 const {page,browser,errors}=await start();
 try{
  const b64=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=640;c.height=480;
   const g=c.getContext("2d");g.fillStyle="#ddeeff";g.fillRect(0,0,c.width,c.height);
   g.fillStyle="#223344";g.font="24px sans-serif";g.fillText("Example",20,80);
   return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('[data-testid="photo-files"]').setInputFiles({name:"photo.png",mimeType:"image/png",buffer:Buffer.from(b64,"base64")});
  await page.evaluate(()=>{
   const native=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(cb,type,quality){
    if(type==="image/jpeg")return native.call(this,blob=>setTimeout(()=>cb(blob),900),type,quality);
    return native.call(this,cb,type,quality);
   };
  });
  await page.locator('[data-testid="photo-preview-run"]').click();
  await page.locator('[data-testid="photo-cancel"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="speech-portable-status"]')?.textContent?.includes("Photo compression cancelled."),null,{timeout:16000});
  assert.equal(await page.locator('[data-testid="photo-actual-preview"] img').count(),0);
  assert.equal(await page.locator('[data-testid="photo-report"]').count(),0);
  assert.equal(await page.locator('[data-testid="photo-files"]').isDisabled(),false);
  await page.locator('[data-testid="photo-preview-run"]').click();
  await page.locator('[data-testid="photo-actual-preview"] img').waitFor({timeout:30000});
  assert.equal(await page.locator('[data-testid="photo-report"]').count(),1);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
