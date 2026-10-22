"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","clipboard-image");fs.mkdirSync(out,{recursive:true});
test("Only explicit pasted/local image -> actual PNG bytes; bad paste retains preview and clear works",{
 timeout:85000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:880},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Paste Image to PNG");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="clipboard-image-desk"]').waitFor();
  assert.equal(await page.locator('[data-testid="clipboard-image-save"]').count(),0);
  const base64=await page.evaluate(()=>{
   const canvas=document.createElement("canvas");canvas.width=37;canvas.height=29;
   const ctx=canvas.getContext("2d");ctx.fillStyle="#ed5522";ctx.fillRect(0,0,37,29);
   return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.evaluate(encoded=>{
   const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
   const transfer=new DataTransfer();
   transfer.items.add(new File([bytes],"clipboard.png",{type:"image/png"}));
   document.querySelector('[data-testid="clipboard-image-paste-zone"]').dispatchEvent(
    new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:transfer}));
  },base64);
  await page.locator('[data-testid="clipboard-image-preview"]').waitFor({timeout:16000});
  assert.match(await page.locator('[data-testid="clipboard-image-stats"]').innerText(),/37 × 29/);
  const requested=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="clipboard-image-save"]').click();
  const download=await requested;
  assert.equal(download.suggestedFilename(),"clipboard-image.png");
  const dest=path.join(out,"actual-pasted.png");await download.saveAs(dest);
  const bytes=fs.readFileSync(dest);
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16),37);assert.equal(bytes.readUInt32BE(20),29);

  // Unsupported SVG paste cannot replace the previously generated PNG.
  await page.evaluate(()=>{
   const dt=new DataTransfer();
   dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],"risky.svg",{type:"image/svg+xml"}));
   document.querySelector('[data-testid="clipboard-image-paste-zone"]').dispatchEvent(
    new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:dt}));
  });
  await page.locator('[data-testid="clipboard-image-status"]').filter({hasText:"之前的预览保留"}).waitFor();
  assert.equal(await page.locator('[data-testid="clipboard-image-preview"]').count(),1);

  await page.locator('[data-testid="clipboard-image-file"]').setInputFiles({
   name:"selected.png",mimeType:"image/png",buffer:Buffer.from(base64,"base64")
  });
  await page.locator('[data-testid="clipboard-image-status"]').filter({hasText:"已在本机生成真实 PNG"}).waitFor();
  await page.locator('[data-testid="clipboard-image-clear"]').click();
  assert.equal(await page.locator('[data-testid="clipboard-image-preview"]').count(),0);
  assert.equal(await page.locator('[data-testid="clipboard-image-save"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
