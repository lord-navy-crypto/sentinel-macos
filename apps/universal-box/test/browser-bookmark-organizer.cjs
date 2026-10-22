"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","bookmarks");
fs.mkdirSync(out,{recursive:true});

test("Offline browser bookmarks: import HTML without requests, review duplicates and export real CSV / Markdown",{
 timeout:80000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1360,height:900}});
 const errors=[],unwanted=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",r=>{if(r.url().includes("forbidden-remote.example"))unwanted.push(r.url());});
 try{
  const exported=`<!DOCTYPE NETSCAPE-Bookmark-file-1>
  <DL><p><DT><H3>Resources</H3><DL><p>
  <DT><A HREF="https://example.com/docs?utm_campaign=a&amp;lang=en">Read &amp; Study</A>
  <DT><A HREF="https://example.com/docs?utm_campaign=a&amp;lang=en">Duplicate copy</A>
  <DT><A HREF="https://example.org/article">=Unsafe formula title</A>
  <DT><A HREF="javascript:alert(1)">Unsafe URL</A>
  <DT><A HREF="file:///Users/private/doc">Private file link</A>
  <IMG SRC="https://forbidden-remote.example/spy.png">
  </DL>`;
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Offline Browser Bookmarks");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="bookmark-organizer"]').waitFor();
  await page.locator('[data-testid="bookmarks-input"]').setInputFiles({
   name:"browser-bookmarks.html",mimeType:"text/html",buffer:Buffer.from(exported,"utf8")
  });
  await page.locator('[data-testid="bookmarks-stats"]').waitFor();
  const stats=await page.locator('[data-testid="bookmarks-stats"]').innerText();
  assert.match(stats,/有效书签：3/);
  assert.match(stats,/重复网址：1/);
  assert.match(stats,/跳过的非网页链接：2/);
  assert.equal(await page.locator('[data-testid="bookmarks-duplicate-groups"] .task-row').count(),1);
  assert.match(await page.locator('[data-testid="bookmarks-duplicate-groups"]').innerText(),/Duplicate copy/);
  assert.equal(unwanted.length,0,"Import must not load remote resources in exported HTML");

  await page.locator('[data-testid="bookmarks-search"]').fill("Read & Study");
  assert.equal(await page.locator('[data-testid="bookmarks-rows"] .task-row').count(),1);
  // Searching doesn't remove other bookmarks from CSV.
  const csvPending=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="bookmarks-export-csv"]').click();
  const csvDl=await csvPending;
  assert.equal(csvDl.suggestedFilename(),"sentinel-bookmarks.csv");
  const csvPath=path.join(out,"all-bookmarks.csv");await csvDl.saveAs(csvPath);
  const csv=fs.readFileSync(csvPath,"utf8");
  assert.match(csv,/Duplicate copy/);
  assert.match(csv,/'=Unsafe formula title/);
  assert.equal(csv.trim().split("\r\n").length,4);

  await page.locator('[data-testid="bookmarks-dedupe"]').check();
  assert.match(await page.locator('[data-testid="bookmarks-export-count"]').innerText(),/2 条/);
  const mdPending=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="bookmarks-export-md"]').click();
  const mdDl=await mdPending;
  assert.equal(mdDl.suggestedFilename(),"sentinel-bookmarks.md");
  const mdPath=path.join(out,"unique-bookmarks.md");await mdDl.saveAs(mdPath);
  const md=fs.readFileSync(mdPath,"utf8");
  assert.match(md,/Read & Study/);
  assert.match(md,/Unsafe formula title/);
  assert.doesNotMatch(md,/Duplicate copy/);

  // Invalid subsequent file must keep the good imported bookmarks.
  await page.locator('[data-testid="bookmarks-input"]').setInputFiles({
   name:"invalid.html",mimeType:"text/html",buffer:Buffer.from("<html>No bookmarks</html>".repeat(2),"utf8")
  });
  await page.getByRole("status").filter({hasText:"原清单已保留"}).waitFor();
  assert.match(await page.locator('[data-testid="bookmarks-stats"]').innerText(),/有效书签：3/);
  await page.locator('[data-testid="bookmarks-clear"]').click();
  assert.equal(await page.locator('[data-testid="bookmarks-stats"]').count(),0);
  await page.screenshot({path:path.join(out,"bookmarks-after-clear.png"),fullPage:true});
  assert.equal(unwanted.length,0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
