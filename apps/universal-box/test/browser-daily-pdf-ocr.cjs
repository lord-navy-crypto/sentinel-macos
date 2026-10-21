"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {PDFDocument,StandardFonts}=require("pdf-lib"),{chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const target=path.join(__dirname,"browser-test-results","daily-pdf-ocr");
fs.mkdirSync(target,{recursive:true});
async function start(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1380,height:880}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function navigate(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 assert.equal(await page.locator(".catalog-open").count(),1,"Catalog should locate one task: "+query);
 await page.locator(".catalog-open").click();
}
test("PDF compression UI measures a real PDF and exports a verifiable smaller document",{timeout:85000},async()=>{
 const session=await start();
 try{
  const {page}=session;
  const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica);
  for(let n=0;n<50;n++)source.addPage([595,842]).drawText("Class notes page "+n,{x:50,y:760,font,size:14});
  const bytes=Buffer.from(await source.save({useObjectStreams:false}));
  await navigate(page,"PDF Size Optimizer");
  await page.locator("#mini-pdf-input").setInputFiles({name:"study.pdf",mimeType:"application/pdf",buffer:bytes});
  await page.locator('[data-testid="pdf-structure-optimizer"]').waitFor();
  await page.locator('[data-testid="pdf-optimize-run"]').click();
  const report=await page.locator('[data-testid="pdf-optimize-report"]').innerText({timeout:25000});
  assert.match(report,/50/);
  assert.match(report,/实际节省/);
  const task=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="pdf-optimize-save"]').click();
  const output=await task,filename=path.join(target,"smaller.pdf");await output.saveAs(filename);
  const optimized=fs.readFileSync(filename);
  assert.ok(optimized.length<bytes.length,"File must be measured smaller, not merely renamed");
  assert.equal((await PDFDocument.load(optimized)).getPageCount(),50);
  await page.screenshot({path:path.join(target,"pdf-optimizer.png"),fullPage:true});
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});
test("Screen-capture-to-OCR UI is real-native-only, never simulates extracted text in Chromium",{timeout:50000},async()=>{
 const session=await start();
 try{
  await navigate(session.page,"Screenshot OCR & Copy");
  await session.page.locator('[data-testid="vision-capture-ocr-copy"]').waitFor();
  assert.equal(await session.page.locator('[data-testid="vision-capture-ocr-copy"]').isDisabled(),true);
  assert.equal(await session.page.locator('[data-testid="vision-run-ocr"]').isDisabled(),true);
  assert.match(await session.page.locator('[data-testid="vision-native-unavailable"]').innerText(),/macOS/);
  assert.equal(await session.page.locator('[data-testid="vision-copy-text"]').count(),0);
  await session.page.screenshot({path:path.join(target,"screenshot-ocr-browser-limitation.png"),fullPage:true});
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});
