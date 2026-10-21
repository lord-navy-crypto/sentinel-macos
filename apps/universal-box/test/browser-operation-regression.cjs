"use strict";
/** Actual Chromium file-input → UI operation → download → parse. WKWebView/macOS QA is separate. */
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const JSZip=require("jszip"),{PDFDocument}=require("pdf-lib"),{chromium}=require("playwright");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","operations");
fs.mkdirSync(folder,{recursive:true});
const fixture=(name,buffer,mimeType="application/octet-stream")=>({name,mimeType,buffer:Buffer.from(buffer)});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(root,{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator(".app-shell").waitFor({timeout:15000});
 return {browser,page,errors};
}
async function launch(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const found=page.locator(".catalog-open");
 assert.equal(await found.count(),1,"Ambiguous catalog query: "+query);
 await found.first().click();
 await page.locator("#main-content").waitFor({state:"visible"});
}
async function downloaded(page,name,click){
 const promise=page.waitForEvent("download",{timeout:30000});
 await click();const dl=await promise;const dest=path.join(folder,name);
 await dl.saveAs(dest);
 const bytes=fs.readFileSync(dest);
 assert.ok(bytes.length>0,"Download is empty: "+name);
 return bytes;
}
async function close(s,name){
 try{
  await s.page.screenshot({path:path.join(folder,name),fullPage:true});
  assert.deepEqual(s.errors,[],"Uncaught page errors");
 }finally{await s.page.close();await s.browser.close();}
}
function pngDimensions(bytes){
 assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
 assert.equal(bytes.toString("ascii",12,16),"IHDR");
 return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
}
async function solidPng(page,color){
 const uri=await page.evaluate(color=>{
  const canvas=document.createElement("canvas");
  canvas.width=120;canvas.height=60;
  const ctx=canvas.getContext("2d");ctx.fillStyle=color;ctx.fillRect(0,0,120,60);
  return canvas.toDataURL("image/png");
 },color);
 return Buffer.from(uri.split(",")[1],"base64");
}

test("CSV: filtered and sorted rows download safely after approval",{timeout:90000},async()=>{
 const s=await setup(),p=s.page;
 try{
  await p.locator('.sidebar button.nav-item[aria-label^="Web Capture"]').click();
  await p.locator('[data-testid="csv-source"]').fill("Name,Score\nZoe,10\nAda,11\nAda,2\nBob,7\n");
  await p.locator('[data-testid="csv-filter"]').fill("Ada");
  await p.locator('[data-testid="csv-sort-column"]').selectOption("1");
  const preview=await p.locator('[data-testid="csv-preview"]').innerText();
  assert.ok(preview.indexOf('"Ada","2"')<preview.indexOf('"Ada","11"'));
  assert.doesNotMatch(preview,/Zoe|Bob/);
  assert.equal(await p.locator('[data-testid="save-cleaned"]').isDisabled(),true);
  await p.locator(".ub-companion-confirm input").check();
  const bytes=await downloaded(p,"csv-refined.csv",()=>p.locator('[data-testid="save-cleaned"]').click());
  assert.match(bytes.toString("utf8"),/"Ada","2"\r\n"Ada","11"/);
 }finally{await close(s,"csv-refined.png");}
});
test("PDF: insert blank pages, then reorder a re-imported PDF",{timeout:120000},async()=>{
 const s=await setup(),p=s.page;
 try{
  const pdf=await PDFDocument.create();pdf.addPage([200,300]);pdf.addPage([300,400]);
  const source=Buffer.from(await pdf.save());
  await launch(p,"Insert Blank Pages into PDF");
  await p.locator("#mini-pdf-input").setInputFiles(fixture("source.pdf",source,"application/pdf"));
  await p.getByText("2 pages",{exact:false}).first().waitFor({timeout:15000});
  await p.locator("label").filter({hasText:"Insert after page"}).locator("input").fill("1");
  await p.locator("label").filter({hasText:"Number of blank pages"}).locator("input").fill("2");
  const inserted=await downloaded(p,"pdf-inserted.pdf",()=>p.getByRole("button",{name:"Insert and save a new PDF"}).click());
  const a=await PDFDocument.load(inserted);
  assert.equal(a.getPageCount(),4);
  assert.deepEqual([a.getPage(3).getWidth(),a.getPage(3).getHeight()],[300,400]);
  await p.getByRole("button",{name:/Extract & reorder/}).click();
  await p.locator("#mini-pdf-input").setInputFiles(fixture("with-blanks.pdf",inserted,"application/pdf"));
  await p.getByText("4 pages",{exact:false}).first().waitFor({timeout:15000});
  await p.locator("label").filter({hasText:"Page order"}).locator("input").fill("4,1");
  const reordered=await downloaded(p,"pdf-reordered.pdf",()=>p.getByRole("button",{name:"Extract / reorder and save new PDF"}).click());
  const b=await PDFDocument.load(reordered);
  assert.equal(b.getPageCount(),2);
  assert.deepEqual([b.getPage(0).getWidth(),b.getPage(0).getHeight()],[300,400]);
  assert.deepEqual([b.getPage(1).getWidth(),b.getPage(1).getHeight()],[200,300]);
  assert.equal((await PDFDocument.load(source)).getPageCount(),2);
 }finally{await close(s,"pdf-operations.png");}
});
test("Excel: CSV → XLSX → CSV preserves text and neutralizes formulas",{timeout:120000},async()=>{
 const s=await setup(),p=s.page;
 try{
  await launch(p,"Free Excel XLSX");
  await p.locator("#excel-csv").fill('Name,Code,Formula\n"李华",00123,"=SUM(1,2)"\n"Ada",00007,"<text> & ok"');
  const book=await downloaded(p,"generated.xlsx",()=>p.getByRole("button",{name:"Create and save XLSX"}).click());
  const archive=await JSZip.loadAsync(book,{checkCRC32:true});
  const xml=await archive.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(xml,/00123/);assert.match(xml,/&lt;text&gt; &amp; ok/);
  assert.match(xml,/t="inlineStr"/);assert.doesNotMatch(xml,/<f(?:\s|>)/);
  await p.locator("#excel-xlsx-file").setInputFiles(fixture("test.xlsx",book,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  await p.getByText("First sheet: Data",{exact:false}).waitFor({timeout:15000});
  const csv=await downloaded(p,"excel-roundtrip.csv",()=>p.getByRole("button",{name:"Save CSV",exact:true}).click());
  assert.match(csv.toString("utf8"),/李华,00123/);
  assert.match(csv.toString("utf8"),/'=SUM\(1,2\)/);
 }finally{await close(s,"excel-operations.png");}
});
test("ZIP: real pack, CRC verification, single-file selection and safe repack",{timeout:120000},async()=>{
 const s=await setup(),p=s.page;
 try{
  await launch(p,"Batch ZIP Pack");
  await p.locator("#zip-pack-files").setInputFiles([
   fixture("report.txt","free office tools\n","text/plain"),
   fixture("data.csv","name,value\nAda,42\n","text/csv")
  ]);
  const packed=await downloaded(p,"batch.zip",()=>p.getByRole("button",{name:"Save selected files as ZIP"}).click());
  const zip=await JSZip.loadAsync(packed,{checkCRC32:true});
  const manifest=JSON.parse(await zip.file("universal-box-manifest.json").async("string"));
  assert.equal(manifest.length,2);
  assert.equal(await zip.file(manifest[0].output).async("string"),"free office tools\n");
  await launch(p,"Safe ZIP Selective Extract");
  await p.getByRole("button",{name:/Safe ZIP selective export/}).click();
  await p.locator("#safe-zip-file").setInputFiles(fixture("batch.zip",packed,"application/zip"));
  await p.getByText("3 entries",{exact:false}).waitFor({timeout:15000});
  await p.getByLabel(/001-report\.txt/).check();
  const selected=await downloaded(p,"selected.zip",()=>p.getByRole("button",{name:"Verify, extract & save selected ZIP"}).click());
  const safe=await JSZip.loadAsync(selected,{checkCRC32:true});
  const report=JSON.parse(await safe.file("manifest.json").async("string"));
  assert.equal(report.files.length,1);
  assert.equal(report.files[0].original,manifest[0].output);
  assert.equal(await safe.file(report.files[0].output).async("string"),"free office tools\n");
 }finally{await close(s,"zip-operations.png");}
});
test("Images: PNG → batch transformed ZIP → verified PNG, plus pixel diff",{timeout:120000},async()=>{
 const s=await setup(),p=s.page;
 try{
  const red=await solidPng(p,"#e01010"),blue=await solidPng(p,"#1010e0");
  await launch(p,"Batch Image Pipeline");
  await p.locator("#batch-images-input").setInputFiles([fixture("red.png",red,"image/png"),fixture("blue.png",blue,"image/png")]);
  await p.locator("label").filter({hasText:"Output format"}).locator("select").selectOption("png");
  const bundle=await downloaded(p,"image-pipeline.zip",()=>p.getByRole("button",{name:"Resize → convert → rename → save ZIP"}).click());
  const archive=await JSZip.loadAsync(bundle,{checkCRC32:true});
  const report=JSON.parse(await archive.file("workflow-manifest.json").async("string"));
  assert.equal(report.files.length,2);
  for(const entry of report.files)assert.deepEqual(pngDimensions(await archive.file(entry.output).async("nodebuffer")),[120,60]);
  await launch(p,"Image Difference & Overlay");
  await p.locator('input[type="file"]').nth(0).setInputFiles(fixture("red.png",red,"image/png"));
  await p.locator('input[type="file"]').nth(1).setInputFiles(fixture("blue.png",blue,"image/png"));
  await p.getByRole("button",{name:"Compare locally"}).click();
  await p.getByText(/pixels differ \(100\.00%\)/).waitFor({timeout:15000});
  assert.deepEqual(pngDimensions(await downloaded(p,"image-diff.png",()=>p.getByRole("button",{name:"Save comparison PNG"}).click())),[120,60]);
 }finally{await close(s,"image-operations.png");}
});