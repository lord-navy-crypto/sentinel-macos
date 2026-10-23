"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{PDFDocument}=require("pdf-lib");
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
  const inputs=[await makePdf("part-one.pdf",2,300),await makePdf("part-two.pdf",1,700)];
  await page.locator("#pdf-picker").setInputFiles(inputs);
  await page.locator('[data-testid="pdf-merge-preflight"]').waitFor();
  const text=await page.locator('[data-testid="pdf-merge-preflight"]').innerText();
  assert.match(text,/3 total pages/);
  assert.ok(text.indexOf("part-one.pdf")<text.indexOf("part-two.pdf"),"Selected order must be visible");
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:"Process & save PDF"}).click();
  const dl=await pending;assert.equal(dl.suggestedFilename(),"merged.pdf");
  const fp=path.join(dir,"merged.pdf");await dl.saveAs(fp);
  const bytes=fs.readFileSync(fp);
  assert.equal(bytes.subarray(0,4).toString("utf8"),"%PDF");
  const doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),3);
  assert.equal(doc.getPage(0).getWidth(),300);
  assert.equal(doc.getPage(2).getWidth(),700);
  assert.match(await page.locator("p[role=status]").last().innerText(),/Verified 3 pages/);
  await page.screenshot({path:path.join(dir,"merge-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
