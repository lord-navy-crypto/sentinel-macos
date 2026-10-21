"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","advanced-free");
fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function launch(page,name){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(name);
 const match=page.locator(".catalog-open");
 assert.equal(await match.count(),1,"Missing registered tool "+name);
 await match.click();
 await page.locator('[data-testid="advanced-free-desk"]').waitFor();
}
async function download(page,id,name){
 const promise=page.waitForEvent("download",{timeout:30000});
 await page.locator(id).click();
 const actual=await promise,local=path.join(dir,name);await actual.saveAs(local);
 return fs.readFileSync(local);
}
async function end(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
test("generates navigable real EPUB 3 from multilingual user input via GUI",{timeout:60000},async()=>{
 const s=await setup();try{
  await launch(s.page,"EPUB 3 eBook Creator");
  await s.page.locator('[data-testid="epub-title"]').fill("Physics & 物理");
  await s.page.locator('[data-testid="epub-author"]').fill("Student");
  await s.page.locator('[data-testid="epub-body"]').fill("# Alpha\n\n<b>Unsafe markup</b>\n\n# 中文\n\n第二章内容。");
  const bytes=await download(s.page,'[data-testid="epub-export"]',"actual-book.epub");
  assert.equal(bytes.subarray(0,2).toString("utf8"),"PK");
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  assert.equal(await zip.file("mimetype").async("string"),"application/epub+zip");
  const opf=await zip.file("OEBPS/package.opf").async("string");
  assert.match(opf,/Physics &amp; 物理/);
  assert.match(await zip.file("OEBPS/chapter1.xhtml").async("string"),/&lt;b&gt;Unsafe markup&lt;\/b&gt;/);
  assert.match(await zip.file("OEBPS/nav.xhtml").async("string"),/中文/);
 }finally{await end(s,"epub.png");}
});
test("hashes two real selected files then verifies matching SHA-256 manifest",{timeout:60000},async()=>{
 const s=await setup();try{
  await launch(s.page,"File SHA-256 Verify");
  const files=[{name:"first.txt",mimeType:"text/plain",buffer:Buffer.from("abc")},
   {name:"第二.txt",mimeType:"text/plain",buffer:Buffer.from("中文")}];
  await s.page.locator('[data-testid="integrity-files"]').setInputFiles(files);
  assert.match(await s.page.locator('[data-testid="integrity-count"]').innerText(),/2/);
  const saved=await download(s.page,'[data-testid="integrity-export"]',"sha256-manifest.json");
  const manifest=JSON.parse(saved.toString("utf8"));
  assert.equal(manifest.files.length,2);
  assert.equal(manifest.files[0].sha256,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  await s.page.locator('[data-testid="integrity-manifest-file"]').setInputFiles({
   name:"sha256-manifest.json",mimeType:"application/json",buffer:saved,
  });
  const report=JSON.parse((await download(s.page,'[data-testid="integrity-verify"]',"verification.json")).toString("utf8"));
  assert.deepEqual(report.matches,["first.txt","第二.txt"]);
  assert.deepEqual(report.modified,[]);
 }finally{await end(s,"integrity.png");}
});
test("compares CSV snapshots by true ID and exports changed cell and row records",{timeout:60000},async()=>{
 const s=await setup();try{
  await launch(s.page,"CSV Version Diff");
  await s.page.locator('[data-testid="csv-diff-old"]').fill("ID,Value\n001,42\n002,old");
  await s.page.locator('[data-testid="csv-diff-new"]').fill("ID,Value\n001,=1+2\n003,new");
  assert.match(await s.page.locator('[data-testid="csv-diff-summary"]').innerText(),/新增 1 行/);
  const zip=await JSZip.loadAsync(await download(s.page,'[data-testid="csv-diff-export"]',"snapshot.zip"),{checkCRC32:true});
  const report=JSON.parse(await zip.file("csv-diff/report.json").async("string"));
  assert.equal(report.changedRows,1);assert.equal(report.removedRows,1);assert.equal(report.addedRows,1);
  const csv=await zip.file("csv-diff/changes.csv").async("string");
  assert.match(csv,/'=1\+2/);
  assert.match(csv,/001/);
 }finally{await end(s,"csv-diff.png");}
});
