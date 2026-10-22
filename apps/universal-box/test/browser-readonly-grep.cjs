"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const output=path.join(__dirname,"browser-test-results","grep");
fs.mkdirSync(output,{recursive:true});

test("Grep: real selected UTF-8 files, literal lines, complete safe CSV, no source edits or bad-import loss",{
 timeout:90000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1420,height:890}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Read-only Multi-file Text Search");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="grep-desk"]').waitFor();

  const originals=[
   {name:"tasks.md",mimeType:"text/markdown",buffer:Buffer.from("# Plan\nTODO: one\nDone\nTODO: two\n","utf8")},
   {name:"audit.csv",mimeType:"text/csv",buffer:Buffer.from("name,owner\nTODO,李四\nDONE,Tom\n","utf8")},
   {name:"trace.log",mimeType:"text/plain",buffer:Buffer.from("WARN: todo later\nno issue\n","utf8")},
  ];
  const saved=originals.map(x=>Buffer.from(x.buffer));
  await page.locator('[data-testid="grep-files"]').setInputFiles(originals);
  await page.getByRole("status").filter({hasText:"已只读载入 3 份"}).waitFor();
  await page.locator('[data-testid="grep-query"]').fill("todo");
  await page.locator('[data-testid="grep-search"]').click();
  const count=page.locator('[data-testid="grep-count"]');await count.waitFor();
  assert.match(await count.innerText(),/匹配 4 行/);
  const displayed=await page.locator('[data-testid="grep-matches"]').innerText();
  assert.match(displayed,/tasks.md · 第 2 行/);
  assert.match(displayed,/tasks.md · 第 4 行/);
  assert.match(displayed,/audit.csv · 第 2 行/);
  assert.match(displayed,/trace.log · 第 1 行/);
  const download=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="grep-export"]').click();
  const dl=await download;
  assert.equal(dl.suggestedFilename(),"sentinel-multifile-search.csv");
  const dest=path.join(output,"grep-real-search.csv");await dl.saveAs(dest);
  const csv=fs.readFileSync(dest,"utf8");
  assert.match(csv,/TODO,李四/);assert.match(csv,/WARN: todo later/);
  assert.match(csv,/1,"tasks.md",4/);
  assert.equal(csv.trim().split("\r\n").length,5);

  await page.locator('[data-testid="grep-case"]').check();
  assert.equal(await page.locator('[data-testid="grep-export"]').isDisabled(),true,
   "Changing case rules must invalidate a stale report");
  await page.locator('[data-testid="grep-search"]').click();
  assert.match(await count.innerText(),/匹配 1 行/);

  await page.locator('[data-testid="grep-files"]').setInputFiles([
   {name:"good.txt",mimeType:"text/plain",buffer:Buffer.from("TODO one")},
   {name:"broken.txt",mimeType:"text/plain",buffer:Buffer.from([0xff,0xfe,0xfd])},
  ]);
  await page.getByRole("status").filter({hasText:"之前的文件与搜索结果仍保留"}).waitFor();
  assert.match(await page.locator('[data-testid="grep-stats"]').innerText(),/已载入 3 个文件/);
  assert.match(await count.innerText(),/匹配 1 行/);
  assert.deepEqual(originals.map(x=>Buffer.from(x.buffer)),saved);

  await page.locator('[data-testid="grep-clear"]').click();
  assert.equal(await page.locator('[data-testid="grep-count"]').count(),0);
  assert.equal(await page.locator('[data-testid="grep-export"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
