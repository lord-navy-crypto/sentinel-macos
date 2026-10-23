"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const url=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dest=path.join(__dirname,"browser-test-results","typography-conversion");
fs.mkdirSync(dest,{recursive:true});
async function downloadAs(page,button,filename){
 const pending=page.waitForEvent("download",{timeout:30000});
 await page.locator('[data-testid="'+button+'"]').click();
 const download=await pending;
 assert.equal(download.suggestedFilename(),filename);
 const output=path.join(dest,filename);
 await download.saveAs(output);
 return fs.readFileSync(output);
}
test("Real font, symbol and safe text formats create inspectable DOCX/HTML/TXT",{timeout:100000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 try{
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Font & Symbol Converter");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="typography-desk"]').waitFor();
  assert.equal(await page.locator('[data-testid="typography-save-docx"]').count(),0,
   "No export before real content is entered");
  const raw='“Hello” — © × 2\n<script>alert("no")</script>\n中文 ① 🚀';
  const normalized='"Hello" -- (c) x 2\n<script>alert("no")</script>\n中文 ① 🚀';
  await page.locator('[data-testid="typography-input"]').fill(raw);
  await page.locator('[data-testid="typography-font"]').selectOption("Georgia");
  await page.locator('[data-testid="typography-size"]').selectOption("16");
  await page.locator('[data-testid="typography-align"]').selectOption("center");
  await page.locator('[data-testid="typography-bold"]').check();
  await page.locator('[data-testid="typography-italic"]').check();
  await page.locator('[data-testid="typography-underline"]').check();
  await page.locator('[data-testid="typography-ascii"]').check();
  assert.equal(await page.locator('[data-testid="typography-output"]').inputValue(),normalized);
  assert.match(await page.locator('[data-testid="typography-preview"]').innerText(),/中文 ① 🚀/u);
  const html=(await downloadAs(page,"typography-save-html","formatted-text.html")).toString("utf8");
  assert.match(html,/<meta charset="utf-8">/u);
  assert.match(html,/font-family:"Georgia",sans-serif/u);
  assert.match(html,/font-size:16pt/u);
  assert.match(html,/text-align:center/u);
  assert.match(html,/&lt;script&gt;alert\(&quot;no&quot;\)&lt;\/script&gt;/u);
  assert.equal(html.includes('<script>alert("no")</script>'),false);
  // Reopen only our own safe HTML export; raw markup remains inert literal text.
  await page.locator('[data-testid="typography-file"]').setInputFiles({
    name:"roundtrip.html",mimeType:"text/html",buffer:Buffer.from(html,"utf8"),
  });
  // HTML stores the explicitly selected, already-converted characters; the original
  // curly quotes and math symbols cannot be reconstructed from exported HTML.
  await page.waitForFunction(expected=>
    document.querySelector('[data-testid="typography-input"]')?.value===expected,
  normalized,{timeout:15000});
  assert.equal(await page.locator('[data-testid="typography-input"]').inputValue(),normalized);
  assert.match(await page.locator('[data-testid="typography-status"]').innerText(),
    /Reopened Sentinel Box HTML/);
  await page.locator('[data-testid="typography-copy-rich"]').click();
  await page.waitForFunction(()=>{
    const text=document.querySelector('[data-testid="typography-status"]')?.textContent??"";
    return /Copied formatted|Formatted copy unavailable/u.test(text);
  },null,{timeout:15000});
  const copiedStatus=await page.locator('[data-testid="typography-status"]').innerText();
  assert.match(copiedStatus,/Copied formatted|Formatted copy unavailable/);
  const docx=await downloadAs(page,"typography-save-docx","formatted-text.docx");
  const zip=await JSZip.loadAsync(docx,{checkCRC32:true});
  const xml=await zip.file("word/document.xml").async("string");
  assert.match(xml,/w:ascii="Georgia"/u);
  assert.match(xml,/w:sz w:val="32"/u);
  assert.match(xml,/w:jc w:val="center"/u);
  assert.match(xml,/中文 ① 🚀/u);
  assert.match(xml,/&lt;script&gt;alert\((?:&quot;|")no(?:&quot;|")\)&lt;\/script&gt;/u);
  const txt=await downloadAs(page,"typography-save-txt","formatted-text.txt");
  assert.equal(txt.toString("utf8"),normalized);
  // User-imported UTF-8 content is never interpreted as HTML or downloaded automatically.
  await page.locator('[data-testid="typography-file"]').setInputFiles({
   name:"import.txt",mimeType:"text/plain",buffer:Buffer.from("Imported 世界\nliteral <b>hi</b>","utf8")
  });
  assert.equal(await page.locator('[data-testid="typography-input"]').inputValue(),
   "Imported 世界\nliteral <b>hi</b>");
  await page.screenshot({path:path.join(dest,"typography-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
