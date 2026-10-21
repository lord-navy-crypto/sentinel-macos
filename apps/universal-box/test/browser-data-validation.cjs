"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const url=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const artifacts=path.join(__dirname,"browser-test-results","data-validation");
fs.mkdirSync(artifacts,{recursive:true});
async function start(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function select(page,name){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(name);
 assert.equal(await page.locator(".catalog-open").count(),1,"tool entry should be unique: "+name);
 await page.locator(".catalog-open").click();
 await page.locator('[data-testid="data-lab-desk"]').waitFor();
}
async function output(page,testId,name){
 const promise=page.waitForEvent("download",{timeout:30000});
 await page.locator('[data-testid="'+testId+'"]').click();
 const d=await promise;const file=path.join(artifacts,name);await d.saveAs(file);
 return fs.readFileSync(file).toString("utf8");
}
async function finish(session,name){
 try{await session.page.screenshot({path:path.join(artifacts,name),fullPage:true});assert.deepEqual(session.errors,[]);}
 finally{await session.page.close();await session.browser.close();}
}
test("NDJSON audit uses actual text input and protects CSV data",{timeout:65000},async()=>{
 const s=await start();
 try{
  await select(s.page,"NDJSON JSONL Validator");
  await s.page.locator('[data-testid="ndjson-source"]').fill('{"name":"物理","cmd":"=2+3"}\n{"name":"Biology"}');
  assert.match(await s.page.locator('[data-testid="ndjson-summary"]').innerText(),/2 valid records · 0 invalid records/);
  const csv=await output(s.page,"ndjson-csv","ndjson.csv");
  assert.match(csv,/物理/);assert.match(csv,/'=2\+3/);
  await s.page.locator('[data-testid="ndjson-source"]').fill('{"ok":1}\nBROKEN');
  assert.match(await s.page.locator('[data-testid="ndjson-summary"]').innerText(),/1 invalid records/);
  assert.equal(await s.page.locator('[data-testid="ndjson-csv"]').isDisabled(),true);
  const json=JSON.parse(await output(s.page,"ndjson-report","ndjson-error.json"));
  assert.equal(json.issues[0].line,2);
 }finally{await finish(s,"ndjson.png");}
});
test("Markdown checks explicitly uploaded local files and saves CSV findings",{timeout:65000},async()=>{
 const s=await start();
 try{
  await select(s.page,"Markdown Relative Link Checker");
  await s.page.locator('[data-testid="markdown-files"]').setInputFiles([
   {name:"README.md",mimeType:"text/markdown",buffer:Buffer.from("# Docs\n[found](guide.md)\n[not found](missing.md)\n[site](https://example.org)")},
   {name:"guide.md",mimeType:"text/markdown",buffer:Buffer.from("# Guide")},
  ]);
  assert.match(await s.page.locator('[data-testid="markdown-summary"]').innerText(),/1 missing/);
  const csv=await output(s.page,"markdown-csv","markdown-links.csv");
  assert.match(csv,/missing.md/);assert.match(csv,/guide.md/);
 }finally{await finish(s,"markdown.png");}
});
test("CSV profile imports real file and exports numeric and missingness evidence",{timeout:65000},async()=>{
 const s=await start();
 try{
  await select(s.page,"CSV Column Profiler");
  await s.page.locator('[data-testid="csv-profile-file"]').setInputFiles({
   name:"subjects.csv",mimeType:"text/csv",
   buffer:Buffer.from("id,score,label\n1,90,Physics\n2,100,Chemistry\n3,,Biology"),
  });
  assert.match(await s.page.locator('[data-testid="csv-profile-summary"]').innerText(),/3 rows · 3 columns/);
  const result=JSON.parse(await output(s.page,"csv-profile-json","profile.json"));
  const score=result.columns.find(x=>x.name==="score");
  assert.equal(score.missing,1);assert.equal(score.min,90);assert.equal(score.max,100);
  const csv=await output(s.page,"csv-profile-report","profile.csv");
  assert.match(csv,/score/);
 }finally{await finish(s,"csv-profile.png");}
});
