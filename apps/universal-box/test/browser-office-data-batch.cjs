"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","office-data-batch");
fs.mkdirSync(folder,{recursive:true});
async function start(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function nav(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const target=page.locator(".catalog-open");
 assert.equal(await target.count(),1,"Search did not isolate "+query);
 await target.click();
 await page.locator('[data-testid="office-data-batch"]').waitFor();
}
async function save(page,selector,filename){
 const download=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();
 const d=await download,dest=path.join(folder,filename);
 await d.saveAs(dest);return JSZip.loadAsync(fs.readFileSync(dest),{checkCRC32:true});
}
async function finish(ctx,name){
 try{await ctx.page.screenshot({path:path.join(folder,name),fullPage:true});assert.deepEqual(ctx.errors,[]);}
 finally{await ctx.page.close();await ctx.browser.close();}
}
test("CSV mail merge creates two distinct editable DOCX files with substituted data",{timeout:70000},async()=>{
 const ctx=await start();try{
  await nav(ctx.page,"CSV Mail Merge");
  await ctx.page.locator('[data-testid="batch-mail-csv"]').fill("Name,Project\n小明,生态学\nGrace,Mathematics");
  await ctx.page.locator('[data-testid="batch-mail-template"]').fill("# Dear {{Name}}\n\nWelcome to {{Project}}.\n\n- Please participate");
  assert.match(await ctx.page.locator('[data-testid="batch-mail-plan"]').innerText(),/2 个 Word/);
  const zip=await save(ctx.page,'[data-testid="batch-mail-export"]',"real-mail-merge.zip");
  const a=await JSZip.loadAsync(await zip.file("documents/001-letter.docx").async("uint8array"));
  const b=await JSZip.loadAsync(await zip.file("documents/002-letter.docx").async("uint8array"));
  assert.match(await a.file("word/document.xml").async("string"),/小明/);
  assert.match(await b.file("word/document.xml").async("string"),/Mathematics/);
  const report=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(report.rows,2);assert.equal(report.sourceDataIncluded,false);
 }finally{await finish(ctx,"mail-merge.png");}
});
test("two CSVs join by ID with preserved leading zeros, original columns and proper CSV escaping",{timeout:70000},async()=>{
 const ctx=await start();try{
  await nav(ctx.page,"CSV Key Join");
  await ctx.page.locator('[data-testid="batch-join-left"]').fill("ID,Name\n001,Ada\n002,Lin");
  await ctx.page.locator('[data-testid="batch-join-right"]').fill("ID,Score\n001,=2+3\n003,98");
  await ctx.page.locator('[data-testid="batch-join-mode"]').selectOption("full");
  assert.match(await ctx.page.locator('[data-testid="batch-join-stats"]').innerText(),/3 输出行/);
  const zip=await save(ctx.page,'[data-testid="batch-join-export"]',"real-key-join.zip");
  const csv=await zip.file("joined/joined.csv").async("string");
  assert.match(csv,/"001"/);assert.match(csv,/"'=2\+3"/);
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.matches,1);assert.equal(manifest.unmatchedRight,1);
 }finally{await finish(ctx,"csv-key-join.png");}
});
test("batch text replacement only emits changed files, with accurate audit and untouched sources",{timeout:70000},async()=>{
 const ctx=await start();try{
  await nav(ctx.page,"Multi-file Text Replace");
  await ctx.page.locator('[data-testid="batch-text-files"]').setInputFiles([
   {name:"draft.md",mimeType:"text/markdown",buffer:Buffer.from("draft\nAnother draft")},
   {name:"final.txt",mimeType:"text/plain",buffer:Buffer.from("already final")},
  ]);
  await ctx.page.locator('[data-testid="batch-text-find"]').fill("draft");
  await ctx.page.locator('[data-testid="batch-text-with"]').fill("approved");
  assert.match(await ctx.page.locator('[data-testid="batch-text-count"]').innerText(),/2 个文件/);
  const zip=await save(ctx.page,'[data-testid="batch-text-export"]',"real-batch-text.zip");
  assert.equal(await zip.file("replaced/001-draft.md").async("string"),"approved\nAnother approved");
  assert.equal(zip.file("replaced/002-final.txt"),null);
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.changed,1);assert.equal(manifest.unchanged,1);
  assert.equal(await ctx.page.locator('[data-testid="batch-text-report"]').count(),2);
 }finally{await finish(ctx,"text-replace.png");}
});