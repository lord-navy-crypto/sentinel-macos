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
  const pending=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="photo-save"]').click();
  const saved=await pending,file=path.join(out,"batch-photo-preview.zip");
  await saved.saveAs(file);
  const archive=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
  const manifest=JSON.parse(await archive.file("reports/manifest.json").async("string"));
  assert.equal(manifest.files.length,2);
  for(const r of manifest.files){
   const img=await archive.file(r.outputName).async("uint8array");
   assert.equal(img.length,r.outputBytes);
   assert.equal(r.sizeDeltaBytes,r.originalBytes-r.outputBytes);
   assert.equal(r.smallerThanSource,r.outputBytes<r.originalBytes);
  }
  await s.page.locator('[data-testid="photo-target-kb"]').fill("200");
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"] img').count(),0,"changing settings invalidates stale preview");
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


test("Photo quick presets and direct one-picture JPEG export without ZIP",{
 timeout:80000,
},async()=>{
 const s=await start();
 try{
  const png=await s.page.evaluate(()=>{
   const canvas=document.createElement("canvas");canvas.width=680;canvas.height=430;
   const ctx=canvas.getContext("2d");
   for(let y=0;y<430;y+=10)for(let x=0;x<680;x+=10){
    ctx.fillStyle="rgb("+((x*7+y)%255)+","+((x+y*13)%255)+","+((x*3+y*5)%255)+")";
    ctx.fillRect(x,y,10,10);
   }
   return canvas.toDataURL("image/png").split(",")[1];
  });
  await s.page.locator('[data-testid="photo-files"]').setInputFiles({
   name:"family-picture.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")
  });
  await s.page.locator('[data-testid="photo-preset-email"]').click();
  assert.equal(await s.page.locator('[data-testid="photo-format"]').inputValue(),"jpeg");
  assert.equal(await s.page.locator('[data-testid="photo-max-size"]').inputValue(),"1024");
  assert.equal(await s.page.locator('[data-testid="photo-target-kb"]').inputValue(),"250");
  await s.page.locator('[data-testid="photo-target-kb"]').fill("600");
  await s.page.locator('[data-testid="photo-preset-web"]').click();
  assert.equal(await s.page.locator('[data-testid="photo-target-kb"]').inputValue(),"400");
  assert.equal(await s.page.locator('[data-testid="photo-format"]').inputValue(),"webp");
  await s.page.locator('[data-testid="photo-preset-email"]').click();
  await s.page.locator('[data-testid="photo-preview-run"]').click();
  await s.page.locator('[data-testid="photo-actual-preview"] img').waitFor({timeout:25000});
  assert.equal(await s.page.locator('[data-testid="photo-report"]').count(),1);
  assert.match(await s.page.locator('[data-testid="photo-save"]').innerText(),/图片/);
  const pending=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="photo-save"]').click();
  const download=await pending;
  assert.match(download.suggestedFilename(),/\.jpg$/);
  const destination=path.join(out,"single-photo-email.jpg");
  await download.saveAs(destination);
  const bytes=fs.readFileSync(destination);
  assert.ok(bytes.length>20);
  assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  assert.equal(bytes[bytes.length-2],0xff);assert.equal(bytes[bytes.length-1],0xd9);
  assert.match(await s.page.locator('[data-testid="speech-portable-status"]').innerText(),/非 ZIP/);
  await s.page.locator('[data-testid="photo-preset-detail"]').click();
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"] img').count(),0,"changing presets invalidates stale preview");
  await s.page.screenshot({path:path.join(out,"single-photo-presets.png"),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});


test("Photo drag-add: retains listed order, clears stale preview, rejects over-limit and removes without touching originals",{
 timeout:85000,
},async()=>{
 const s=await start();
 try{
  const sample=await s.page.evaluate(()=>{
   const canvas=document.createElement("canvas");canvas.width=360;canvas.height=240;
   const g=canvas.getContext("2d");g.fillStyle="#3c82ad";g.fillRect(0,0,360,240);
   g.fillStyle="#f8f9fb";g.fillRect(25,20,90,80);
   return canvas.toDataURL("image/png").split(",")[1];
  });
  await s.page.locator('[data-testid="photo-files"]').setInputFiles({
   name:"first.png",mimeType:"image/png",buffer:Buffer.from(sample,"base64")
  });
  await s.page.locator('[data-testid="photo-input-entry"]').first().waitFor();
  assert.equal(await s.page.locator('[data-testid="photo-input-entry"]').count(),1);
  await s.page.locator('[data-testid="photo-preview-run"]').click();
  await s.page.locator('[data-testid="photo-actual-preview"] img').waitFor({timeout:25000});
  await s.page.evaluate(encoded=>{
   const raw=atob(encoded),data=new Uint8Array(raw.length);
   for(let i=0;i<data.length;i++)data[i]=raw.charCodeAt(i);
   const transfer=new DataTransfer();
   transfer.items.add(new File([data],"second.png",{type:"image/png"}));
   document.querySelector('[data-testid="photo-drop-zone"]').dispatchEvent(
    new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));
  },sample);
  await s.page.locator('[data-testid="photo-input-entry"]').nth(1).waitFor();
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"]').count(),0,
   "Adding a new photo must invalidate the previously compressed image");
  assert.match(await s.page.locator('[data-testid="photo-input-entry"]').nth(1).innerText(),/second.png/);
  assert.match(await s.page.locator('[data-testid="photo-save"]').innerText(),/ZIP/);
  const pending=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="photo-save"]').click();
  const dl=await pending;const filepath=path.join(out,"photo-drag-batch.zip");
  await dl.saveAs(filepath);
  const zip=await JSZip.loadAsync(fs.readFileSync(filepath),{checkCRC32:true});
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.deepEqual(manifest.files.map(x=>x.source),["first.png","second.png"]);

  // Invalid file append should not delete either selected item.
  await s.page.evaluate(()=>{
   const transfer=new DataTransfer();
   transfer.items.add(new File(["not an image"],"notes.txt",{type:"text/plain"}));
   document.querySelector('[data-testid="photo-drop-zone"]').dispatchEvent(
    new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  assert.equal(await s.page.locator('[data-testid="photo-input-entry"]').count(),2);
  await s.page.locator('[data-testid="photo-remove-0"]').click();
  assert.equal(await s.page.locator('[data-testid="photo-input-entry"]').count(),1);
  assert.match(await s.page.locator('[data-testid="photo-input-entry"]').first().innerText(),/second.png/);
  assert.equal(await s.page.locator('[data-testid="photo-actual-preview"]').count(),0);
  await s.page.locator('[data-testid="photo-clear-all"]').click();
  assert.equal(await s.page.locator('[data-testid="photo-input-entry"]').count(),0);
  assert.equal(await s.page.locator('[data-testid="photo-save"]').isDisabled(),true);
  await s.page.screenshot({path:path.join(out,"photo-drag-batch-list.png"),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});
