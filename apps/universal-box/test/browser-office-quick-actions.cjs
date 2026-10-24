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


test("Batch office text audit previews source metrics and exports safe real CSV without modifying files",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const original=Buffer.from("\ufeff甲😀 \r\n第二行\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"=SUM(1).txt",mimeType:"text/plain",buffer:original},
   {name:"合同,报价.md",mimeType:"text/markdown",buffer:Buffer.from("内容\r\n")},
  ]);
  const totals=await page.locator('[data-testid="batch-audit-total"]').innerText();
  assert.match(totals,/2 files/);
  assert.match(totals,/3 physical lines/);
  const list=await page.locator('[data-testid="batch-audit-list"]').innerText();
  assert.match(list,/=SUM\(1\).txt/);
  assert.match(list,/合同,报价.md/);
  assert.match(list,/BOM Yes/);
  // Default replace operation has no search phrase, but read-only audit must still work.
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.equal(await page.locator('[data-testid="batch-audit-save"]').isEnabled(),true);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-audit-save"]').click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),"sentinel-box-text-file-audit.csv");
  const outfile=path.join(dir,"batch-text-source-audit.csv");await download.saveAs(outfile);
  const csv=fs.readFileSync(outfile);
  assert.deepEqual(csv.subarray(0,3),Buffer.from([239,187,191]));
  const report=csv.subarray(3).toString("utf8");
  assert.match(report,/"'=SUM\(1\).txt"/);
  assert.match(report,/"合同,报价.md"/);
  assert.match(report,/"Physical lines"/);
  assert.doesNotMatch(report,/甲😀/);
  assert.doesNotMatch(report,/第二行/);
  assert.deepEqual(original,Buffer.from("\ufeff甲😀 \r\n第二行\n"));
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("TXT blank-run cleanup and chosen tab spacing export verified real ZIP copies",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const source=Buffer.from("\ufeffAlpha\r\n\r\n\r\nBeta\tX\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"minutes.txt",mimeType:"text/plain",buffer:source},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("collapse-blank");
  assert.match(await page.locator('[data-testid="batch-whitespace-warning"]').innerText(),/TXT only/);
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const firstPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const firstDownload=await firstPending;
  const collapsedPath=path.join(dir,"collapsed-blank-lines.zip");
  await firstDownload.saveAs(collapsedPath);
  const collapsed=await JSZip.loadAsync(fs.readFileSync(collapsedPath),{checkCRC32:true});
  const collapsedBytes=await collapsed.file("processed/minutes.txt").async("nodebuffer");
  assert.deepEqual(collapsedBytes,Buffer.from("\ufeffAlpha\r\n\r\nBeta\tX\n"));
  const manifest=JSON.parse(await collapsed.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(manifest.operation,"collapse-blank");
  assert.equal(manifest.files[0].matches,1);

  await page.locator('[data-testid="batch-text-mode"]').selectOption("tabs-to-spaces");
  await page.locator('[data-testid="batch-tab-width"]').selectOption("2");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const secondPending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const secondDownload=await secondPending;
  const spacedPath=path.join(dir,"tab-spaces.zip");
  await secondDownload.saveAs(spacedPath);
  const spaced=await JSZip.loadAsync(fs.readFileSync(spacedPath),{checkCRC32:true});
  const spacedBytes=await spaced.file("processed/minutes.txt").async("nodebuffer");
  assert.deepEqual(spacedBytes,Buffer.from("\ufeffAlpha\r\n\r\n\r\nBeta  X\n"));
  assert.deepEqual(source,Buffer.from("\ufeffAlpha\r\n\r\n\r\nBeta\tX\n"));
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"sheet.csv",mimeType:"text/csv",buffer:Buffer.from('"h1\nh2",h3\nv1,v2\n')},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT-only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("TXT list natural sorting and normalized dedupe export actual verified ZIPs",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const original=Buffer.from("\ufeffitem10\r\n \t\nitem2\rItem1\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"inventory.txt",mimeType:"text/plain",buffer:original},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("sort-list-asc");
  assert.match(await page.locator('[data-testid="batch-list-warning"]').innerText(),/natural comparison/);
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const sorting=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const sortedDL=await sorting;
  const sortPath=path.join(dir,"list-sort-natural.zip");await sortedDL.saveAs(sortPath);
  const sorted=await JSZip.loadAsync(fs.readFileSync(sortPath),{checkCRC32:true});
  assert.deepEqual(await sorted.file("processed/inventory.txt").async("nodebuffer"),
    Buffer.from("\ufeffItem1\r\n \t\nitem2\ritem10\n"));
  const sortManifest=JSON.parse(await sorted.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(sortManifest.operation,"sort-list-asc");
  assert.equal(sortManifest.files[0].matches,2);

  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"contacts.txt",mimeType:"text/plain",buffer:Buffer.from("\ufeff Alice \r\nalice\nBOB\rBob\n \t\r\nALIce\t")},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("dedupe-list");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const dedupedDL=await pending;
  const dedupPath=path.join(dir,"list-near-dedupe.zip");await dedupedDL.saveAs(dedupPath);
  const deduped=await JSZip.loadAsync(fs.readFileSync(dedupPath),{checkCRC32:true});
  assert.deepEqual(await deduped.file("processed/contacts.txt").async("nodebuffer"),
    Buffer.from("\ufeff Alice \r\nBOB\r \t\r\n"));
  const dupManifest=JSON.parse(await deduped.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(dupManifest.operation,"dedupe-list");
  assert.equal(dupManifest.files[0].matches,3);

  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"table.csv",mimeType:"text/csv",buffer:Buffer.from('"one\ntwo",three\n')},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT-only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(original,Buffer.from("\ufeffitem10\r\n \t\nitem2\rItem1\n"));
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Plain TXT list marker and surrounding blank cleanup downloads verified ZIP byte copies",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const source=Buffer.from("\ufeff  1. Meeting\r\n\t- Follow-up\n2026-10-24\n• 中文😀\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
    {name:"meeting.txt",mimeType:"text/plain",buffer:source},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("strip-list-markers");
  assert.match(await page.locator('[data-testid="batch-plain-list-warning"]').innerText(),/TXT only/);
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const first=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const firstDownload=await first;
  const listFile=path.join(dir,"office-list-cleanup.zip");
  await firstDownload.saveAs(listFile);
  const listZip=await JSZip.loadAsync(fs.readFileSync(listFile),{checkCRC32:true});
  const listBytes=await listZip.file("processed/meeting.txt").async("nodebuffer");
  assert.deepEqual(listBytes,Buffer.from("\ufeff  Meeting\r\n\tFollow-up\n2026-10-24\n中文😀\r\n"));
  const listManifest=JSON.parse(await listZip.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(listManifest.operation,"strip-list-markers");
  assert.equal(listManifest.files[0].matches,3);

  const text=Buffer.from("\ufeff\r\n \t\n正文\r\n\n事项\r\n \t\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
    {name:"draft.txt",mimeType:"text/plain",buffer:text},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("trim-boundary-blank");
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const secondDownload=await pending;
  const secondFile=path.join(dir,"trim-document-boundaries.zip");await secondDownload.saveAs(secondFile);
  const trimmed=await JSZip.loadAsync(fs.readFileSync(secondFile),{checkCRC32:true});
  assert.deepEqual(await trimmed.file("processed/draft.txt").async("nodebuffer"),
    Buffer.from("\ufeff正文\r\n\n事项\r\n"));
  const trimManifest=JSON.parse(await trimmed.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(trimManifest.operation,"trim-boundary-blank");
  assert.equal(trimManifest.files[0].matches,3);

  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
    {name:"records.csv",mimeType:"text/csv",buffer:Buffer.from('"A\nB",Value\n')},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT-only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(source,Buffer.from("\ufeff  1. Meeting\r\n\t- Follow-up\n2026-10-24\n• 中文😀\r\n"));
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Copied-text hidden-space cleanup produces verified ZIP files and protects emoji joins",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Text Files");
  const source=Buffer.from("\ufeffA\u00a0B\u202fC\r\nX\u2007Y\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"copied.txt",mimeType:"text/plain",buffer:source},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("normalize-nbsp");
  assert.match(await page.locator('[data-testid="batch-invisible-warning"]').innerText(),/U\+00A0/);
  assert.match(await page.locator('[data-testid="batch-text-preview"]').innerText(),/1 changed/);
  const first=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const file=await first;const output=path.join(dir,"copied-nbsp-cleanup.zip");await file.saveAs(output);
  const zip=await JSZip.loadAsync(fs.readFileSync(output),{checkCRC32:true});
  assert.deepEqual(await zip.file("processed/copied.txt").async("nodebuffer"),
   Buffer.from("\ufeffA B C\r\nX\u2007Y\n"));
  const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json").async("string"));
  assert.equal(manifest.operation,"normalize-nbsp");
  assert.equal(manifest.files[0].matches,2);

  const joined=Buffer.from("\ufeff👩‍💻\u200bA\u00adB\r\n");
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"emoji.txt",mimeType:"text/plain",buffer:joined},
  ]);
  await page.locator('[data-testid="batch-text-mode"]').selectOption("remove-zwsp");
  const second=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const file2=await second;const output2=path.join(dir,"copied-zwsp-cleanup.zip");await file2.saveAs(output2);
  const zip2=await JSZip.loadAsync(fs.readFileSync(output2),{checkCRC32:true});
  assert.deepEqual(await zip2.file("processed/emoji.txt").async("nodebuffer"),
   Buffer.from("\ufeff👩‍💻A\u00adB\r\n"));

  await page.locator('[data-testid="batch-text-mode"]').selectOption("remove-soft-hyphen");
  const third=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="batch-text-save"]').click();
  const file3=await third;const output3=path.join(dir,"copied-soft-hyphen.zip");await file3.saveAs(output3);
  const zip3=await JSZip.loadAsync(fs.readFileSync(output3),{checkCRC32:true});
  assert.deepEqual(await zip3.file("processed/emoji.txt").async("nodebuffer"),
   Buffer.from("\ufeff👩‍💻\u200bAB\r\n"));
  await page.locator('[data-testid="batch-text-picker"]').setInputFiles([
   {name:"quoted.csv",mimeType:"text/csv",buffer:Buffer.from('"a\nb",c\n')},
  ]);
  assert.match(await page.locator('[data-testid="batch-text-error"]').innerText(),/TXT-only/);
  assert.equal(await page.locator('[data-testid="batch-text-save"]').isDisabled(),true);
  assert.deepEqual(source,Buffer.from("\ufeffA\u00a0B\u202fC\r\nX\u2007Y\n"));
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("CSV Table Desk retains optional blank rows and exports spreadsheet-safe TSV with real data",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('nav.sidebar-nav button.nav-item[aria-label="CSV Table Desk"]').click();
  const source='Name,Note,Value\r\n甲,"第一行\n第二行",=2+3\r\n\r\n乙,"literal\t""quoted""",-42\r\n';
  await page.locator("#data-text").fill(source);
  await page.getByRole("button",{name:"Load table"}).click();
  const heading=page.getByRole("heading",{name:/Table preview/});
  assert.match(await heading.innerText(),/3\s*\/\s*3 rows/);
  await page.locator('[data-testid="table-remove-empty"]').check();
  assert.match(await heading.innerText(),/2\s*\/\s*3 rows/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="table-save-tsv"]').click();
  const dl=await pending;
  assert.equal(dl.suggestedFilename(),"daily-desk-table.tsv");
  const dest=path.join(dir,"filtered-excel-table.tsv");
  await dl.saveAs(dest);
  const bytes=fs.readFileSync(dest);
  assert.deepEqual(bytes.subarray(0,3),Buffer.from([239,187,191]));
  const actual=bytes.subarray(3).toString("utf8");
  assert.equal(actual,'Name\tNote\tValue\r\n甲\t"第一行\n第二行"\t\'=2+3\r\n乙\t"literal\t""quoted"""\t-42');
  assert.equal(await page.locator("#data-text").inputValue(),source);
  await page.locator('[data-testid="table-remove-empty"]').uncheck();
  assert.match(await heading.innerText(),/3\s*\/\s*3 rows/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("unnumbered batch rename produces real files, previews collisions and protects ZIP manifest",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await openTool(page,"Batch Rename Copies");
  await page.locator("#rename-files").setInputFiles([
   {name:"Draft 合同.docx",mimeType:"application/octet-stream",buffer:Buffer.from("DOC-1")},
   {name:"memo.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.7 TEST")},
  ]);
  await page.locator('[data-testid="rename-numbered"]').uncheck();
  await page.getByTestId("rename-prefix").fill("Final-");
  await page.getByTestId("rename-find").fill("Draft");
  await page.getByTestId("rename-replace").fill("Approved");
  const preview=await page.locator('[data-testid="rename-preview"]').innerText();
  assert.match(preview,/Final-Approved 合同\.docx/);
  assert.match(preview,/Final-memo\.pdf/);
  assert.doesNotMatch(preview,/Final-memo-02/);
  const planPending=page.waitForEvent("download",{timeout:30000});
  await page.getByTestId("rename-export-plan").click();
  const planDownload=await planPending;
  assert.equal(planDownload.suggestedFilename(),"sentinel-box-rename-preview.csv");
  const planFile=path.join(dir,"renamed-preview.csv");
  await planDownload.saveAs(planFile);
  const planBytes=fs.readFileSync(planFile);
  assert.deepEqual(planBytes.subarray(0,3),Buffer.from([239,187,191]));
  const csv=planBytes.subarray(3).toString("utf8");
  assert.match(csv,/"Draft 合同.docx","Final-Approved 合同.docx","5"/);
  assert.match(csv,/"memo.pdf","Final-memo.pdf","13"/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="rename-save-zip"]').click();
  const dl=await pending,output=path.join(dir,"renamed-without-numbering.zip");
  await dl.saveAs(output);
  const zip=await JSZip.loadAsync(fs.readFileSync(output),{checkCRC32:true});
  assert.equal((await zip.file("Final-Approved 合同.docx").async("nodebuffer")).toString(),"DOC-1");
  assert.equal((await zip.file("Final-memo.pdf").async("nodebuffer")).toString(),"%PDF-1.7 TEST");
  assert.equal(JSON.parse(await zip.file("sentinel-box-rename-plan.json").async("string")).files.length,2);
  await page.locator('label:has-text("Prefix") input').fill("");
  await page.locator('label:has-text("Find text") input').fill("");
  await page.locator("#rename-files").setInputFiles([
   {name:"a.txt",mimeType:"text/plain",buffer:Buffer.from("1")},
   {name:"A.txt",mimeType:"text/plain",buffer:Buffer.from("2")},
  ]);
  assert.match(await page.locator('[data-testid="rename-error"]').innerText(),/Duplicate output filename/);
  assert.equal(await page.locator('[data-testid="rename-save-zip"]').isDisabled(),true);
  await page.locator("#rename-files").setInputFiles([
   {name:"sentinel-box-rename-plan.json",mimeType:"application/json",buffer:Buffer.from("{}")},
  ]);
  assert.match(await page.locator('[data-testid="rename-error"]').innerText(),/reserved for the ZIP manifest/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});