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
  await navigate(session.page,"Screen Frame Capture");
  await session.page.locator('[data-testid="vision-capture-ocr-copy"]').waitFor();
  assert.equal(await session.page.locator('[data-testid="vision-capture-ocr-copy"]').isDisabled(),true);
  assert.equal(await session.page.locator('[data-testid="vision-run-ocr"]').isDisabled(),true);
  assert.match(await session.page.locator('[data-testid="vision-native-unavailable"]').innerText(),/macOS/);
  assert.equal(await session.page.locator('[data-testid="vision-copy-text"]').count(),0);
  await session.page.screenshot({path:path.join(target,"screenshot-ocr-browser-limitation.png"),fullPage:true});
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});


test("PDF everyday: drag local PDF, choose odd/even/reverse shortcuts, export exact real page order",{
 timeout:90000,
},async()=>{
 const session=await start();
 try{
  const {page}=session;
  const doc=await PDFDocument.create();
  for(let number=1;number<=5;number++)doc.addPage([400+number*10,600]);
  const source=Buffer.from(await doc.save());
  await navigate(page,"PDF Size Optimizer");
  await page.locator('[data-testid="pdf-mini-drop-zone"]').waitFor();
  // Genuine user-provided File via drag and drop, not a mocked loaded-PDF state.
  await page.evaluate(encoded=>{
   const raw=atob(encoded),bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   const dt=new DataTransfer();
   dt.items.add(new File([bytes],"five-pages.pdf",{type:"application/pdf"}));
   const drop=document.querySelector('[data-testid="pdf-mini-drop-zone"]');
   if(!drop)throw Error("PDF drop area missing");
   drop.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dt}));
  },source.toString("base64"));
  await page.locator('[aria-label="Imported PDF document information"]').getByText("5", {exact:false}).first().waitFor();
  assert.match(await page.locator('[aria-label="Imported PDF document information"]').innerText(),/5.*pages/);

  await page.locator('[data-testid="pdf-quick-odd"]').click();
  assert.equal(await page.locator('[data-testid="pdf-page-expression"]').inputValue(),"1,3,5");
  await page.locator('[data-testid="pdf-quick-preview-pages"]').click();
  await page.locator('[data-testid="pdf-quick-output-preview"]').waitFor();
  await page.locator('[data-testid="pdf-quick-output-preview"] .pdf-preview').waitFor();
  let downloadPending=page.waitForEvent("download");
  await page.locator('[data-testid="pdf-quick-export-pages"]').click();
  let dl=await downloadPending;let output=path.join(target,"odd-page-shortcut.pdf");
  await dl.saveAs(output);
  let result=await PDFDocument.load(fs.readFileSync(output));
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[410,430,450]);

  await page.locator('[data-testid="pdf-quick-even"]').click();
  assert.equal(await page.locator('[data-testid="pdf-page-expression"]').inputValue(),"2,4");
  assert.equal(await page.locator('[data-testid="pdf-quick-output-preview"]').count(),0,
    "Changing selection must invalidate the old preview");
  downloadPending=page.waitForEvent("download");
  await page.locator('[data-testid="pdf-quick-export-pages"]').click();
  dl=await downloadPending;output=path.join(target,"even-page-shortcut.pdf");
  await dl.saveAs(output);
  result=await PDFDocument.load(fs.readFileSync(output));
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[420,440]);

  await page.locator('[data-testid="pdf-quick-reverse"]').click();
  assert.equal(await page.locator('[data-testid="pdf-page-expression"]').inputValue(),"5,4,3,2,1");
  downloadPending=page.waitForEvent("download");
  await page.locator('[data-testid="pdf-quick-export-pages"]').click();
  dl=await downloadPending;output=path.join(target,"reversed-page-shortcut.pdf");
  await dl.saveAs(output);
  result=await PDFDocument.load(fs.readFileSync(output));
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[450,440,430,420,410]);

  await page.locator('[data-testid="pdf-quick-first"]').click();
  assert.equal(await page.locator('[data-testid="pdf-page-expression"]').inputValue(),"1");
  await page.locator('[data-testid="pdf-quick-last"]').click();
  assert.equal(await page.locator('[data-testid="pdf-page-expression"]').inputValue(),"5");
  await page.locator('[data-testid="pdf-quick-optimize"]').click();
  await page.locator('[data-testid="pdf-structure-optimizer"]').waitFor();
  assert.deepEqual(session.errors,[]);
  await page.screenshot({path:path.join(target,"pdf-quick-tasks.png"),fullPage:true});
 }finally{await session.page.close();await session.browser.close();}
});


test("PDF merge: preflight pages, reorder duplicate filenames, preview real output and export correct order",{
 timeout:90000,
},async()=>{
 const session=await start();
 try{
  const {page}=session;
  await navigate(page,"PDF Preview & Tools");
  await page.locator("#pdf-picker").waitFor();
  const mk=async widths=>{
   const pdf=await PDFDocument.create();
   for(const width of widths)pdf.addPage([width,600]);
   return Buffer.from(await pdf.save());
  };
  const first=await mk([411,412]),second=await mk([520]),third=await mk([630]);
  await page.locator("#pdf-picker").setInputFiles([
   {name:"same-name.pdf",mimeType:"application/pdf",buffer:first},
   {name:"same-name.pdf",mimeType:"application/pdf",buffer:second},
   {name:"last.pdf",mimeType:"application/pdf",buffer:third},
  ]);
  await page.locator('[data-testid="pdf-merge-entry"]').nth(2).waitFor({timeout:25000});
  assert.equal(await page.locator('[data-testid="pdf-merge-entry"]').count(),3);
  assert.match(await page.locator('[data-testid="pdf-merge-order"]').innerText(),/共|合并|页/);
  await page.locator('[data-testid="pdf-merge-preview"]').click();
  await page.locator('[data-testid="pdf-merge-output-preview"]').waitFor();
  assert.match(await page.locator('[data-testid="pdf-merge-output-preview"]').innerText(),/4 页/);

  await page.locator('[data-testid="pdf-merge-up-2"]').click();
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),0,"Changing order clears stale preview");
  await page.locator('[data-testid="pdf-merge-up-1"]').click();
  assert.match(await page.locator('[data-testid="pdf-merge-entry"]').first().innerText(),/last.pdf/);
  await page.locator('[data-testid="pdf-merge-preview"]').click();
  await page.locator('[data-testid="pdf-merge-output-preview"]').waitFor();
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"按当前顺序合并并另存 PDF"}).click();
  const dl=await pending;
  assert.equal(dl.suggestedFilename(),"merged.pdf");
  const name=path.join(target,"daily-merge-ordered.pdf");
  await dl.saveAs(name);
  const merged=await PDFDocument.load(fs.readFileSync(name));
  assert.deepEqual(merged.getPages().map(p=>p.getWidth()),[630,411,412,520]);

  await page.locator('[data-testid="pdf-merge-remove-1"]').click();
  assert.equal(await page.locator('[data-testid="pdf-merge-entry"]').count(),2);
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),0);
  await page.locator('[data-testid="pdf-merge-clear"]').click();
  assert.equal(await page.locator('[data-testid="pdf-merge-entry"]').count(),0);
  await page.screenshot({path:path.join(target,"pdf-merge-quick.png"),fullPage:true});
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});


test("PDF Finder drop: append verified PDFs, keep previous preview on invalid selection, and export correct page order",{
 timeout:90000,
},async()=>{
 const session=await start();
 try{
  const {page}=session;
  await navigate(page,"PDF Preview & Tools");
  const document=async widths=>{
   const pdf=await PDFDocument.create();
   for(const width of widths)pdf.addPage([width,600]);
   return Buffer.from(await pdf.save());
  };
  const first=await document([410,411]),second=await document([520]),third=await document([630]);
  await page.locator("#pdf-picker").setInputFiles({
   name:"first.pdf",mimeType:"application/pdf",buffer:first
  });
  await page.locator('[data-testid="pdf-merge-entry"]').first().waitFor();
  await page.locator('[data-testid="pdf-merge-preview"]').click();
  await page.locator('[data-testid="pdf-merge-output-preview"]').waitFor();

  const drop=async(name,bytes)=>{
   await page.evaluate(([fileName,buffer])=>{
    const transfer=new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(buffer)],fileName,{type:"application/pdf"}));
    document.querySelector('[data-testid="pdf-file-drop"]').dispatchEvent(
     new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:transfer}));
   },[name,Array.from(bytes)]);
  };
  // An invalid dropped file must leave the original selection AND real prepared preview unchanged.
  await drop("broken.pdf",Buffer.from("not an actual PDF"));
  await page.getByRole("status").last().filter({hasText:"原有选择与预览均保留"}).waitFor();
  assert.equal(await page.locator('[data-testid="pdf-merge-entry"]').count(),1);
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),1);

  await drop("second.pdf",second);
  await page.locator('[data-testid="pdf-merge-entry"]').nth(1).waitFor();
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),0,
   "A valid appended document invalidates the stale merge preview");
  await drop("third.pdf",third);
  await page.locator('[data-testid="pdf-merge-entry"]').nth(2).waitFor();
  const actualOrder=await page.locator('[data-testid="pdf-merge-entry"] .task-copy').allInnerTexts();
  assert.deepEqual(actualOrder.map(x=>x.split(" · ")[0]),["1. first.pdf","2. second.pdf","3. third.pdf"]);
  await page.locator('[data-testid="pdf-merge-preview"]').click();
  await page.locator('[data-testid="pdf-merge-output-preview"]').waitFor();
  assert.match(await page.locator('[data-testid="pdf-merge-output-preview"]').innerText(),/4 页/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"按当前顺序合并并另存 PDF"}).click();
  const dl=await pending;
  const pathOut=path.join(target,"finder-dropped-merge.pdf");
  await dl.saveAs(pathOut);
  const parsed=await PDFDocument.load(fs.readFileSync(pathOut));
  assert.deepEqual(parsed.getPages().map(p=>p.getWidth()),[410,411,520,630]);

  // The ordinary file picker intentionally REPLACES, rather than appending.
  await page.locator("#pdf-picker").setInputFiles({
   name:"replacement.pdf",mimeType:"application/pdf",buffer:second
  });
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="pdf-merge-entry"]').length===1);
  assert.match(await page.locator('[data-testid="pdf-merge-entry"]').first().innerText(),/replacement.pdf/);
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),0);

  // Splitting and rotation modes must accept a single dropped file, not an appended batch.
  await page.getByRole("button",{name:"Split",exact:true}).click();
  await drop("single.pdf",first);
  await page.getByText("single.pdf",{exact:false}).first().waitFor();
  assert.match(await page.locator("#pdf-pages").inputValue(),/1-2/);
  await page.screenshot({path:path.join(target,"pdf-finder-drop-safe.png"),fullPage:true});
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});


test("PDF merge: verify displayed source page ranges and save a safe Chinese custom filename",{
 timeout:85000,
},async()=>{
 const session=await start();
 try{
  const {page}=session;
  const makePdf=async widths=>{
   const doc=await PDFDocument.create();
   for(const width of widths)doc.addPage([width,600]);
   return Buffer.from(await doc.save());
  };
  await navigate(page,"PDF Preview & Tools");
  await page.locator("#pdf-picker").setInputFiles([
   {name:"chapter-one.pdf",mimeType:"application/pdf",buffer:await makePdf([430,431])},
   {name:"chapter-two.pdf",mimeType:"application/pdf",buffer:await makePdf([610])},
  ]);
  await page.locator('[data-testid="pdf-merge-entry"]').nth(1).waitFor();
  assert.match(await page.locator('[data-testid="pdf-merge-entry"]').nth(0).innerText(),/合并后第\s*1–2\s*页/);
  assert.match(await page.locator('[data-testid="pdf-merge-entry"]').nth(1).innerText(),/合并后第\s*3\s*页/);
  const nameInput=page.locator('[data-testid="pdf-merge-output-name"]');
  await nameInput.fill("../somewhere.pdf");
  await page.locator('[data-testid="pdf-merge-name-error"]').waitFor();
  assert.equal(await page.getByRole("button",{name:"按当前顺序合并并另存 PDF"}).isDisabled(),true);

  await nameInput.fill("研究资料汇总.PDF");
  assert.equal(await page.locator('[data-testid="pdf-merge-name-error"]').count(),0);
  await page.locator('[data-testid="pdf-merge-preview"]').click();
  await page.locator('[data-testid="pdf-merge-output-preview"]').waitFor();
  // Merely changing the output filename should not generate an obsolete merge or erase the real preview.
  await nameInput.fill("最终合并稿.pdf");
  assert.equal(await page.locator('[data-testid="pdf-merge-output-preview"]').count(),1);
  const wait=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"按当前顺序合并并另存 PDF"}).click();
  const dl=await wait;
  assert.equal(dl.suggestedFilename(),"最终合并稿.pdf");
  const saveAs=path.join(target,"pdf-custom-name-merge.pdf");
  await dl.saveAs(saveAs);
  const actual=await PDFDocument.load(fs.readFileSync(saveAs));
  assert.deepEqual(actual.getPages().map(x=>x.getWidth()),[430,431,610]);
  assert.deepEqual(session.errors,[]);
 }finally{await session.page.close();await session.browser.close();}
});
