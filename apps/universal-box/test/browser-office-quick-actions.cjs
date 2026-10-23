"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","office-quick-actions");
fs.mkdirSync(dir,{recursive:true});
async function openTool(page,term){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(term);
 const matches=page.locator(".catalog-open");assert.equal(await matches.count(),1);
 await matches.click();
}
test("Office rename previews original/new names and verifies real ZIP copies and manifest",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Rename Copies");
  const orig=[{name:"合同.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:Buffer.from("REAL-DOCX-BYTES")},
              {name:"Offer.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.7\nSAMPLE")}];
  await page.locator("#rename-files").setInputFiles(orig);
  assert.match(await page.locator('[data-testid="rename-preflight"]').innerText(),/Preview 2 old/);
  assert.match(await page.locator('[data-testid="rename-preview"]').innerText(),/合同.docx/);
  const zipPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="rename-save-zip"]').click();
  const dl=await zipPending;assert.equal(dl.suggestedFilename(),"daily-desk-renamed-files.zip");
  const out=path.join(dir,"renamed.zip");await dl.saveAs(out);
  const zip=await JSZip.loadAsync(fs.readFileSync(out),{checkCRC32:true});
  const manifest=JSON.parse(await zip.file("sentinel-box-rename-plan.json").async("string"));
  assert.equal(manifest.files.length,2);
  for(let i=0;i<orig.length;i++){
   assert.equal(manifest.files[i].originalName,orig[i].name);
   const content=await zip.file(manifest.files[i].renamedCopy).async("nodebuffer");
   assert.deepEqual(content,orig[i].buffer);
  }
  await page.screenshot({path:path.join(dir,"rename-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
test("Quick Text Cleaner user-click plain paste never imports formatting, copies only checked output",{timeout:75000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const context=await browser.newContext({permissions:["clipboard-read","clipboard-write"],acceptDownloads:true,viewport:{width:1400,height:900}});
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Text Cleaner");
  const source=page.locator("#quick-text-input");
  assert.equal(await source.inputValue(),"","Clipboard must not be read or prefilled automatically.");
  await page.evaluate(()=>navigator.clipboard.writeText("  合同   草稿\n第二行\n"));
  await page.locator('[data-testid="quick-paste-plain"]').click();
  await page.waitForFunction(()=>{
    const text=document.querySelector("#quick-text-input")?.value??"";
    const status=Array.from(document.querySelectorAll("p[role='status']"))
      .map(x=>x.textContent??"").join(" ");
    return text.length>0||/Plain-text paste unavailable/.test(status);
  },null,{timeout:15000});
  const pasteStatus=await page.locator('p[role="status"]').last().innerText();
  assert.doesNotMatch(pasteStatus,/Plain-text paste unavailable/);
  assert.equal(await source.inputValue(),"  合同   草稿\n第二行\n");
  assert.equal(await page.locator("#quick-result").inputValue(),"合同 草稿\n第二行\n");
  await page.locator('[data-testid="quick-copy-result"]').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),"合同 草稿\n第二行\n");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await context.close();await browser.close();}
});
