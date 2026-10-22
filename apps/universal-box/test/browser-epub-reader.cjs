"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const JSZip=require("jszip"),{chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","epub");fs.mkdirSync(out,{recursive:true});
async function makeBook(encrypted=false){
 const zip=new JSZip();
 zip.file("mimetype","application/epub+zip");
 zip.file("META-INF/container.xml",'<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
 zip.file("OEBPS/content.opf",'<package><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Offline Reader</dc:title></metadata><manifest><item id="a" href="Text/a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="Text/b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
 zip.file("OEBPS/Text/a.xhtml",'<html><body><h1>Chapter A</h1><p>Safe hello</p><img src="https://no-fetch.invalid/track.png"/></body></html>');
 zip.file("OEBPS/Text/b.xhtml",'<html><body><h1>第二章</h1><p>World text</p><script>fetch("https://no-fetch.invalid/run")</script></body></html>');
 if(encrypted)zip.file("META-INF/encryption.xml","<encryption/>");
 return Buffer.from(await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}));
}
test("Real local EPUB: chapter selection, exported TXT and CSV, DRM rejection, no remote requests",{
 timeout:90000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:880},acceptDownloads:true});
 const errors=[],badRequests=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",req=>{if(req.url().includes("no-fetch.invalid"))badRequests.push(req.url());});
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("EPUB Chapter Reader");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="epub-desk"]').waitFor();
  const book=await makeBook();
  await page.locator('[data-testid="epub-file"]').setInputFiles({
   name:"reading.epub",mimeType:"application/epub+zip",buffer:book
  });
  await page.locator('[data-testid="epub-stats"]').waitFor();
  assert.match(await page.locator('[data-testid="epub-stats"]').innerText(),/Offline Reader/);
  assert.match(await page.locator('[data-testid="epub-stats"]').innerText(),/章节：2/);
  assert.match(await page.locator('[data-testid="epub-text"]').inputValue(),/Safe hello/);
  await page.locator('[data-testid="epub-chapter"]').selectOption("1");
  assert.match(await page.locator('[data-testid="epub-text"]').inputValue(),/World text/);
  assert.doesNotMatch(await page.locator('[data-testid="epub-text"]').inputValue(),/fetch\(/);

  const p1=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="epub-export-txt"]').click();
  const d1=await p1;assert.equal(d1.suggestedFilename(),"epub-selected-chapter.txt");
  const t=path.join(out,"chapter.txt");await d1.saveAs(t);
  assert.match(fs.readFileSync(t,"utf8"),/第二章/);
  assert.match(fs.readFileSync(t,"utf8"),/World text/);

  const p2=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="epub-export-index"]').click();
  const d2=await p2;assert.equal(d2.suggestedFilename(),"epub-chapters-index.csv");
  const c=path.join(out,"toc.csv");await d2.saveAs(c);
  const csv=fs.readFileSync(c,"utf8");assert.match(csv,/Chapter A/);assert.match(csv,/第二章/);
  assert.match(csv,/OEBPS\/Text\/b.xhtml/);

  await page.locator('[data-testid="epub-file"]').setInputFiles({
   name:"encrypted.epub",mimeType:"application/epub+zip",buffer:await makeBook(true)
  });
  await page.locator('[data-testid="epub-status"]').filter({hasText:"旧书籍与章节预览已保留"}).waitFor();
  assert.match(await page.locator('[data-testid="epub-stats"]').innerText(),/章节：2/);
  assert.equal(badRequests.length,0,"Book markup must not load external resources");
  await page.locator('[data-testid="epub-clear"]').click();
  assert.equal(await page.locator('[data-testid="epub-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
