"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const {PDFDocument}=require("pdf-lib");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dest=path.join(__dirname,"browser-test-results","native-math-equations");
fs.mkdirSync(dest,{recursive:true});
test("Actual Markdown LaTeX writes editable OMML Word and printed PDF with rendered fraction",{timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Markdown / Word Editor");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator("#writing-markdown").waitFor();
  const markdown="# Math report\nValue 0.0000123000\n$$\\frac{\\alpha+1}{\\sqrt{x_2}}=\\pi^2$$";
  await page.locator("#writing-markdown").fill(markdown);
  await page.locator('[data-testid="writing-math-preview"] .katex').first().waitFor();
  assert.match(await page.locator('[data-testid="writing-math-preview"]').innerText(),/Math report/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.getByRole("button",{name:/Export Word .docx/}).click();
  const dl=await pending;
  assert.match(dl.suggestedFilename(),/\.docx$/);
  const fp=path.join(dest,"equations.docx");await dl.saveAs(fp);
  const zip=await JSZip.loadAsync(fs.readFileSync(fp),{checkCRC32:true});
  const xml=await zip.file("word/document.xml").async("string");
  assert.match(xml,/<m:oMath/u);
  assert.match(xml,/<m:f>/u);
  assert.match(xml,/<m:rad>/u);
  assert.match(xml,/<m:sSup>/u);
  assert.match(xml,/0\.0000123000/u);
  const print=await page.pdf({format:"A4",printBackground:true});
  const pdf=await PDFDocument.load(print);
  assert.ok(pdf.getPageCount()>=1);
  assert.ok(print.length>2500);
  fs.writeFileSync(path.join(dest,"math-print.pdf"),print);
  // Unsupported commands may preview as KaTeX errors but must never silently corrupt Word math.
  await page.locator("#writing-markdown").fill("$$\\begin{matrix}1&2\\end{matrix}$$");
  await page.getByRole("button",{name:/Export Word .docx/}).click();
  assert.match(await page.locator('p[role="status"]').last().innerText(),/Unsupported|invalid LaTeX/i);
  await page.screenshot({path:path.join(dest,"math-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
