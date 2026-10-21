"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip"),{PDFDocument}=require("pdf-lib");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const output=path.join(__dirname,"browser-test-results","business-billing");
fs.mkdirSync(output,{recursive:true});
test("Business CSV rows group into actual PDF/Word ZIP with correct totals, malformed inputs blocked",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:940}});
 const exceptions=[];page.on("pageerror",error=>exceptions.push(error.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Business Invoices & Quotes");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="business-billing-desk"]').waitFor();
  assert.match(await page.locator('[data-testid="billing-plan"]').innerText(),/3 项.*2 份/u);
  assert.match(await page.locator('[data-testid="billing-total-INV-001"]').innerText(),/EUR 325.50/u);
  assert.match(await page.locator('[data-testid="billing-total-QT-002"]').innerText(),/EUR 240.00/u);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="billing-export"]').click();
  const file=await pending,download=path.join(output,"business-documents.zip");
  await file.saveAs(download);
  const archive=await JSZip.loadAsync(fs.readFileSync(download),{checkCRC32:true});
  for(const name of ["invoices/INV-001.docx","invoices/INV-001.pdf","quotes/QT-002.docx","quotes/QT-002.pdf",
   "reports/billing-summary.csv","reports/manifest.json"]){
   assert.ok(archive.file(name),"Missing export "+name);
  }
  const invoicePdf=await PDFDocument.load(await archive.file("invoices/INV-001.pdf").async("uint8array"));
  assert.ok(invoicePdf.getPageCount()>=1);
  const word=await JSZip.loadAsync(await archive.file("invoices/INV-001.docx").async("uint8array"));
  assert.match(await word.file("word/document.xml").async("string"),/Northwind Studio/);
  assert.match(await archive.file("reports/billing-summary.csv").async("string"),/325.50/);
  await page.locator('[data-testid="billing-csv"]').fill(
   "document_id,kind,client,client_address,issue_date,due_date,currency,po,description,quantity,unit_price,tax_rate\n"+
   "CN-01,invoice,中文客户,北京市,2026-10-21,2026-11-01,CNY,,开发服务,2,85.00,0");
  assert.match(await page.locator('[data-testid="billing-plan"]').innerText(),/1 项.*1 份/u);
  assert.match(await page.locator('[data-testid="billing-preview"]').innerText(),/中文客户/);
  const pendingChinese=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="billing-export"]').click();
  const cnZip=await JSZip.loadAsync(await (await pendingChinese).createReadStream().then(async stream=>{
   const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks);
  }));
  assert.ok(cnZip.file("invoices/CN-01.docx"));
  assert.equal(cnZip.file("invoices/CN-01.pdf"),null,"Do not export unreadable PDF with missing CJK glyphs");
  await page.locator('[data-testid="billing-csv"]').fill("not,a,valid,billing,csv\nwrong,row");
  await page.locator('[data-testid="billing-error"]').waitFor();
  assert.equal(await page.locator('[data-testid="billing-export"]').count(),0);
  await page.screenshot({path:path.join(output,"billing-workflow.png"),fullPage:true});
  assert.deepEqual(exceptions,[]);
 }finally{await page.close();await browser.close();}
});
