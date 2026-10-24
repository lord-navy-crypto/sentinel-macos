"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{PDFDocument}=require("pdf-lib"),JSZip=require("jszip");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","office-pdf-preflight");fs.mkdirSync(dir,{recursive:true});
async function makePdf(name,count,base){
 const doc=await PDFDocument.create();
 for(let i=0;i<count;i++)doc.addPage([base+i,500]);
 return {name,mimeType:"application/pdf",buffer:Buffer.from(await doc.save())};
}
test("Actual PDF desk preflights every selected file and downloads a verified real merged PDF",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("PDF Preview & Tools");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator("#pdf-picker").waitFor();
  const inputs=[await makePdf("part-one.pdf",2,300),await makePdf("part-two.pdf",1,700),
   await makePdf("unneeded-appendix.pdf",1,900)];
  await page.locator("#pdf-picker").setInputFiles(inputs);
  await page.locator('[data-testid="pdf-merge-preflight"]').waitFor();
  const text=await page.locator('[data-testid="pdf-merge-preflight"]').innerText();
  assert.match(text,/4 total pages/);
  assert.ok(text.indexOf("part-one.pdf")<text.indexOf("part-two.pdf"),"Selected order must be visible");
  assert.equal(await page.locator('[data-testid="pdf-merge-row"]').count(),3);
  await page.getByRole("button",{name:"Exclude file 3 from merge"}).click();
  assert.equal(await page.locator('[data-testid="pdf-merge-row"]').count(),2);
  assert.match(await page.locator('[data-testid="pdf-merge-preflight"]').innerText(),/3 total pages/);
  assert.doesNotMatch(await page.locator('[data-testid="pdf-merge-preflight"]').innerText(),/unneeded-appendix.pdf/);
  assert.match(await page.locator("p[role=status]").last().innerText(),/not changed/);
  assert.equal(await page.locator('[data-testid="pdf-merge-row"]').count(),2);
  assert.equal(await page.getByRole("button",{name:"Move file 1 up"}).isDisabled(),true);
  assert.equal(await page.getByRole("button",{name:"Move file 2 down"}).isDisabled(),true);
  await page.getByRole("button",{name:"Move file 1 down"}).click();
  let rows=await page.locator('[data-testid="pdf-merge-row"]').allInnerTexts();
  assert.match(rows[0],/part-two.pdf/);
  assert.match(rows[1],/part-one.pdf/);
  await page.getByRole("button",{name:"Move file 2 up"}).click();
  rows=await page.locator('[data-testid="pdf-merge-row"]').allInnerTexts();
  assert.match(rows[0],/part-one.pdf/);
  assert.match(rows[1],/part-two.pdf/);
  await page.getByRole("button",{name:"Move file 1 down"}).click();
  const planned=await page.locator('[data-testid="pdf-merge-preflight"]').innerText();
  assert.ok(planned.indexOf("part-two.pdf")<planned.indexOf("part-one.pdf"),"Save order must match preview order");
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"Process & save PDF"}).click();
  const dl=await pending;assert.equal(dl.suggestedFilename(),"merged.pdf");
  const fp=path.join(dir,"merged.pdf");await dl.saveAs(fp);
  const bytes=fs.readFileSync(fp);
  assert.equal(bytes.subarray(0,4).toString("utf8"),"%PDF");
  const doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),3);
  assert.equal(doc.getPage(0).getWidth(),700);
  assert.equal(doc.getPage(1).getWidth(),300);
  assert.equal(doc.getPage(2).getWidth(),301);
  assert.match(await page.locator("p[role=status]").last().innerText(),/Verified 3 pages/);
  await page.screenshot({path:path.join(dir,"merge-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("PDF organize previews old-to-new page order and verifies actual saved page sequence",{timeout:95000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("PDF Preview & Tools");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.getByRole("group",{name:"PDF operation"}).getByRole("button",{name:"Organize"}).click();
  const pdf=await makePdf("ordering.pdf",4,300);
  await page.locator("#pdf-picker").setInputFiles(pdf);
  await page.locator('[data-testid="pdf-order-preflight"]').waitFor();
  await page.locator("#pdf-pages").fill("3,1");
  const plan=await page.locator('[data-testid="pdf-order-preflight"]').innerText();
  assert.match(plan,/4 original pages → 2 output pages/);
  assert.match(plan,/2 omitted/);
  assert.match(plan,/1 ← 3/);
  assert.match(plan,/2 ← 1/);
  await page.locator("#pdf-pages").fill("3,3");
  assert.match(await page.locator('[data-testid="pdf-order-error"]').innerText(),/more than once/);
  assert.equal(await page.getByRole("button",{name:"Process & save PDF"}).isDisabled(),true);
  await page.locator("#pdf-pages").fill("3,1");
  assert.equal(await page.getByRole("button",{name:"Process & save PDF"}).isEnabled(),true);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"Process & save PDF"}).click();
  const dl=await pending;
  assert.equal(dl.suggestedFilename(),"ordering-organized.pdf");
  const out=path.join(dir,"ordering-organized.pdf");await dl.saveAs(out);
  const parsed=await PDFDocument.load(fs.readFileSync(out));
  assert.equal(parsed.getPageCount(),2);
  assert.equal(parsed.getPage(0).getWidth(),302);
  assert.equal(parsed.getPage(1).getWidth(),300);
  assert.match(await page.locator("p[role=status]").last().innerText(),/Saved and verified 2 reordered pages/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Split PDF ZIP contains independently readable one-page copies in chosen range",{timeout:95000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("PDF Preview & Tools");
  await page.locator(".catalog-open").click();
  await page.getByRole("group",{name:"PDF operation"}).getByRole("button",{name:"Split"}).click();
  await page.locator("#pdf-picker").setInputFiles(await makePdf("invoices.pdf",3,450));
  await page.locator("#pdf-pages").fill("2-3");
  await page.getByRole("checkbox",{name:/Export each selected page/}).check();
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"Process & save PDF"}).click();
  const dl=await pending;
  assert.equal(dl.suggestedFilename(),"invoices-individual-pages.zip");
  const out=path.join(dir,"invoices-split.zip");await dl.saveAs(out);
  const archive=await JSZip.loadAsync(fs.readFileSync(out),{checkCRC32:true});
  const names=Object.keys(archive.files).sort();
  assert.deepEqual(names,["invoices-page-002.pdf","invoices-page-003.pdf"]);
  for(const [i,name] of names.entries()){
   const doc=await PDFDocument.load(await archive.file(name).async("nodebuffer"));
   assert.equal(doc.getPageCount(),1);
   assert.equal(doc.getPage(0).getWidth(),451+i);
  }
  assert.match(await page.locator("p[role=status]").last().innerText(),/Saved 2 one-page PDFs/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
