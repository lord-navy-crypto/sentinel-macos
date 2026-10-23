"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {PDFDocument,StandardFonts}=require("pdf-lib"),{chromium}=require("playwright");
const url=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","scan-pdf");
fs.mkdirSync(folder,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill("Scanned PDF Image Compressor");
 assert.equal(await page.locator(".catalog-open").count(),1);
 await page.locator(".catalog-open").click();
 return {page,browser,errors};
}
test("Real scanned-image PDF is re-encoded to smaller PDF with verified page read-back",{timeout:90000},async()=>{
 const {page,browser,errors}=await open();
 try{
  // A deterministic high-frequency grayscale scan-like image encoded as PNG:
  // a JPEG re-encode should yield meaningful compression without fake size claims.
  const data=await page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=850;c.height=1100;
   const ctx=c.getContext("2d");const image=ctx.createImageData(c.width,c.height);
   let seed=1337;
   for(let i=0;i<image.data.length;i+=4){
    seed=(Math.imul(seed,1664525)+1013904223)|0;
    const noise=((seed>>>16)&63);
    const value=Math.max(0,247-noise);
    image.data[i]=value;image.data[i+1]=value;image.data[i+2]=value;image.data[i+3]=255;
   }
   ctx.putImageData(image,0,0);
   ctx.fillStyle="#151515";ctx.font="28px serif";
   for(let i=1;i<=22;i++)ctx.fillText("Scanned laboratory notes / Page lines "+i,35,65+i*43);
   return c.toDataURL("image/png").split(",")[1];
  });
  const pdf=await PDFDocument.create();
  const image=await pdf.embedPng(Buffer.from(data,"base64"));
  for(let i=0;i<3;i++){const p=pdf.addPage([612,792]);p.drawImage(image,{x:0,y:0,width:612,height:792});}
  const original=Buffer.from(await pdf.save({useObjectStreams:false}));
  assert.ok(original.length>100000,"Test PDF should contain a genuinely encoded scanned image.");
  await page.locator("#mini-pdf-input").setInputFiles({name:"scan.pdf",mimeType:"application/pdf",buffer:original});
  await page.locator('[data-testid="pdf-scan-compressor"]').waitFor();
  await page.locator('[data-testid="pdf-scan-accept"]').check();
  await page.locator('[data-testid="pdf-scan-preset"]').selectOption("balanced");
  await page.locator('[data-testid="pdf-scan-run"]').click();
  await page.locator('[data-testid="pdf-scan-report"]').waitFor({timeout:45000});
  const report=await page.locator('[data-testid="pdf-scan-report"]').innerText();
  assert.match(report,/3 页/);
  assert.match(report,/节省/);
  assert.equal(await page.locator('[data-testid="pdf-scan-save"]').isDisabled(),false);
  const fileEvent=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="pdf-scan-save"]').click();
  const dl=await fileEvent,target=path.join(folder,"recompressed.pdf");await dl.saveAs(target);
  const smaller=fs.readFileSync(target);
  assert.ok(smaller.length<original.length,"Actual PDF must shrink in bytes");
  const checked=await PDFDocument.load(smaller);
  assert.equal(checked.getPageCount(),3);
  assert.equal(Math.round(checked.getPages()[0].getWidth()),612);
  await page.locator('[data-testid="pdf-scan-preview-toggle"]').click();
  await page.locator('[data-testid="pdf-scan-output-preview"]').waitFor();
  await page.screenshot({path:path.join(folder,"actual-scan-compression.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
test("An existing selectable text layer blocks scan-only flattening",{timeout:50000},async()=>{
 const {page,browser,errors}=await open();
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  const p=pdf.addPage([612,792]);p.drawText("Selectable text must survive",{font,size:16,x:65,y:680});
  await page.locator("#mini-pdf-input").setInputFiles({
   name:"searchable.pdf",mimeType:"application/pdf",
   buffer:Buffer.from(await pdf.save()),
  });
  await page.locator('[data-testid="pdf-scan-compressor"]').waitFor();
  await page.locator('[data-testid="pdf-scan-accept"]').check();
  await page.locator('[data-testid="pdf-scan-run"]').click();
  await page.waitForFunction(()=>!!document.querySelector('[data-testid="pdf-scan-status"]')?.textContent?.includes("contains selectable/OCR text"));
  assert.equal(await page.locator('[data-testid="pdf-scan-save"]').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
