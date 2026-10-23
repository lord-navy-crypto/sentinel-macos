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


test("Batch TXT/CSV/Markdown edits are previewed and exported as verified ZIP copies", {timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const original=Buffer.from("\ufeff旧价,5\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"报价.csv",mimeType:"text/csv",buffer:original},
   {name:"notes.md",mimeType:"text/markdown",buffer:Buffer.from("no matches")},
  ]);
  await page.locator('[data-testid="batch-text-find"]').fill("旧价");
  await page.locator('[data-testid="batch-text-replacement"]').fill("新价");
  await page.locator('[data-testid="batch-text-preview"]').waitFor();
  const preview=await page.locator('[data-testid="batch-text-preview"]').innerText();
  assert.match(preview,/2 selected/);assert.match(preview,/1 changed/);
  assert.match(preview,/报价.csv/);assert.match(preview,/新价/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),"sentinel-box-text-file-copies.zip");
  const filename=path.join(dir,"batch-text-edits.zip");
  await download.saveAs(filename);
  const zip=await JSZip.loadAsync(fs.readFileSync(filename),{checkCRC32:true});
  const processed=await zip.file("processed/报价.csv").async("nodebuffer");
  assert.deepEqual(processed.subarray(0,3),Buffer.from([0xef,0xbb,0xbf]));
  assert.equal(processed.subarray(3).toString("utf8"),"新价,5\r\n");
  assert.equal(zip.file("processed/notes.md"),null);
  const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.deepEqual(manifest.files.map(x=>x.changed),[true,false]);
  assert.equal(manifest.files[0].matches,1);
  assert.equal(original.toString("utf8"),"\ufeff旧价,5\r\n");
  await page.locator('[data-testid="batch-text-mode"]').selectOption("remove-bom");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  await page.screenshot({path:path.join(dir,"batch-text-preview.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Batch line cleanup safely previews whitespace edits and rejects CSV for line operations",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"会议记录.md",mimeType:"text/markdown",buffer:Buffer.from("Agenda  \r\n\r\nAgenda  \r\nNotes\t\r\n")},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("trim-trailing");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  assert.match(await page.locator('[data-testid="batch-line-warning"]').innerText(),/TXT and Markdown only/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const download=await pending;
  const dest=path.join(dir,"batch-trim-line-copies.zip");
  await download.saveAs(dest);
  const zip=await JSZip.loadAsync(fs.readFileSync(dest),{checkCRC32:true});
  assert.deepEqual(await zip.file("processed/会议记录.md").async("nodebuffer"),Buffer.from("Agenda\r\n\r\nAgenda\r\nNotes\r\n"));
  await page.locator('[data-testid="batch-text-mode"]').selectOption("remove-blank");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("dedupe-lines");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"sheet.csv",mimeType:"text/csv",buffer:Buffer.from("name,age\nA,20\n")},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-status"]').innerText(),/Selected 1/);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT\/Markdown only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Batch multi-rule replacement and line-affix actions produce verified local file copies",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"报价.csv",mimeType:"text/csv",buffer:Buffer.from("\ufeffName,Year\r\nA,2025\r\n")},
   {name:"notes.md",mimeType:"text/markdown",buffer:Buffer.from("A and B\n")},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("multi-replace");
  await page.locator('[data-testid="batch-text-rules"]').fill("A\tB\nB\tC\n2025\t2026");
  assert.match(await page.locator('[data-testid="batch-rules-warning"]').innerText(),/sequentially/);
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/2 selected/);
  assert.match(await page.locator('[data-testid="batch-rule-counts"]').first().innerText(),/1: 1/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const file=await pending;const dest=path.join(dir,"multi-rule-batch.zip");
  await file.saveAs(dest);
  const zip=await JSZip.loadAsync(fs.readFileSync(dest),{checkCRC32:true});
  const csv=await zip.file("processed/报价.csv").async("nodebuffer");
  assert.deepEqual(csv.subarray(0,3),Buffer.from([239,187,191]));
  assert.equal(csv.subarray(3).toString("utf8"),"Name,Year\r\nC,2026\r\n");
  assert.equal(await zip.file("processed/notes.md").async("string"),"C and C\n");
  const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(manifest.operation,"multi-replace");
  assert.deepEqual(manifest.files[0].ruleCounts,[1,1,1]);
  assert.equal(JSON.stringify(manifest).includes("2025"),false);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("prefix-lines");
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT\/Markdown only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"memo.md",mimeType:"text/markdown",buffer:Buffer.from("One\r\n\r\nTwo\n")},
  ]);
  await page.locator('[data-testid="batch-text-affix"]').fill("• ");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const next=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const affixFile=await next;const affixPath=path.join(dir,"line-affix-batch.zip");
  await affixFile.saveAs(affixPath);
  const pack=await JSZip.loadAsync(fs.readFileSync(affixPath),{checkCRC32:true});
  assert.equal(await pack.file("processed/memo.md").async("string"),"• One\r\n\r\n• Two\n");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Office line filtering and numbering exports genuine TXT/Markdown copies and protects CSV",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const src=Buffer.from("\ufeffTODO: 甲\r\n已完成\nTODO: 乙\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"会议.md",mimeType:"text/markdown",buffer:src},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("keep-matching");
  await page.locator('[data-testid="batch-line-needle"]').fill("TODO:");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  assert.match(await page.locator('[data-testid="batch-filter-warning"]').innerText(),/case-sensitive/);
  const downloadPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const download=await downloadPending;
  const outfile=path.join(dir,"keep-matching-lines.zip");await download.saveAs(outfile);
  const zip=await JSZip.loadAsync(fs.readFileSync(outfile),{checkCRC32:true});
  const file=await zip.file("processed/会议.md").async("nodebuffer");
  assert.deepEqual(file.subarray(0,3),Buffer.from([239,187,191]));
  assert.equal(file.subarray(3).toString("utf8"),"TODO: 甲\r\nTODO: 乙\r\n");
  const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(manifest.operation,"keep-matching");assert.equal(manifest.files[0].matches,2);
  assert.equal(JSON.stringify(manifest).includes("TODO:"),false);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("drop-matching");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/已完成/);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("number-lines");
  assert.match(await page.locator('[data-testid="batch-number-warning"]').innerText(),/Numbers non-blank lines/);
  const numberedPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const numberedDownload=await numberedPending;
  const numberedPath=path.join(dir,"numbered-lines.zip");await numberedDownload.saveAs(numberedPath);
  const numbered=await JSZip.loadAsync(fs.readFileSync(numberedPath),{checkCRC32:true});
  const numberedBytes=await numbered.file("processed/会议.md").async("nodebuffer");
  assert.deepEqual(numberedBytes.subarray(0,3),Buffer.from([239,187,191]));
  assert.equal(numberedBytes.subarray(3).toString("utf8"),"1. TODO: 甲\r\n2. 已完成\n3. TODO: 乙\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"bad.csv",mimeType:"text/csv",buffer:Buffer.from("A,B\n1,2\n")},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT\/Markdown only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(src,Buffer.from("\ufeffTODO: 甲\r\n已完成\nTODO: 乙\r\n"));
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
