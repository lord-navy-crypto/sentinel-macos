"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const output=path.join(__dirname,"browser-test-results","offline-feeds");
fs.mkdirSync(output,{recursive:true});
const rss=`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>RSS &amp; Software Notes</title>
<item><title>Release &amp; Maintenance</title>
<link>https://example.org/releases?a=1&amp;b=2</link>
<pubDate>Thu, 22 Oct 2026 09:00:00 GMT</pubDate>
<description>New fixes &lt;img src="https://no-request.invalid/track.png"&gt;</description>
</item><item><title>Copied Release</title>
<link>https://example.org/releases?a=1&amp;b=2</link></item>
<item><title>=Unsafe Formula</title>
<link>https://docs.example.net/help</link></item>
<item><title>Local JS</title><link>javascript:alert(1)</link></item>
</channel></rss>`;
const atom=`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Research Feed</title>
<entry><title>中文资料更新</title><link rel="alternate" type="text/html" href="https://research.example.cn/entry"/>
<updated>2026-10-22T11:00:00Z</updated><summary>Selected offline entry</summary></entry>
<entry><title>Local file</title><link href="file:///tmp/secret"/></entry>
</feed>`;

test("Offline RSS archive: imported real XML, safe dedup, search, CSV/Markdown output, reject DTD without losing good data",{
 timeout:85000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1380,height:880}});
 const errors=[],requests=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("request",r=>{if(r.url().includes("no-request.invalid"))requests.push(r.url());});
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("RSS / Atom Offline Archive");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="offline-feed-archive"]').waitFor();

  await page.locator('[data-testid="feed-import"]').setInputFiles({
   name:"saved.rss",mimeType:"application/rss+xml",buffer:Buffer.from(rss,"utf8"),
  });
  await page.locator('[data-testid="feed-stats"]').waitFor();
  const stats=await page.locator('[data-testid="feed-stats"]').innerText();
  assert.match(stats,/RSS & Software Notes/);
  assert.match(stats,/条目：3/);assert.match(stats,/重复 URL：1/);assert.match(stats,/跳过：1/);
  assert.equal(requests.length,0);
  await page.locator('[data-testid="feed-search"]').fill("Maintenance");
  assert.equal(await page.locator('[data-testid="feed-rows"] .task-row').count(),1);

  const before=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="feed-export-csv"]').click();
  const dl=await before;assert.equal(dl.suggestedFilename(),"sentinel-feed-archive.csv");
  const file=path.join(output,"full-rss.csv");await dl.saveAs(file);
  const csv=fs.readFileSync(file,"utf8");
  assert.match(csv,/Release & Maintenance/);
  assert.match(csv,/"'=Unsafe Formula"/);
  assert.match(csv,/Copied Release/);
  assert.equal(csv.split("\r\n").filter(Boolean).length,4);

  await page.locator('[data-testid="feed-dedupe"]').check();
  assert.match(await page.locator('[data-testid="feed-export-count"]').innerText(),/2 条/);
  const requested=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="feed-export-md"]').click();
  const markdownDownload=await requested;
  const mdPath=path.join(output,"unique-rss.md");await markdownDownload.saveAs(mdPath);
  const md=fs.readFileSync(mdPath,"utf8");
  assert.match(md,/Release & Maintenance/);
  assert.doesNotMatch(md,/Copied Release/);

  await page.locator('[data-testid="feed-import"]').setInputFiles({
   name:"untrusted.xml",mimeType:"application/xml",
   buffer:Buffer.from('<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss>&xxe;</rss>'),
  });
  await page.locator('[data-testid="feed-status"]').filter({hasText:"旧档案仍可使用"}).waitFor();
  assert.match(await page.locator('[data-testid="feed-stats"]').innerText(),/条目：3/);
  assert.equal(requests.length,0);
  await page.locator('[data-testid="feed-clear"]').click();
  assert.equal(await page.locator('[data-testid="feed-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Offline Atom archive: namespaced Atom XML and HTML-only URL policy, no unsupported local links",{
 timeout:70000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1320,height:870}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("RSS / Atom Offline Archive");
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="feed-import"]').setInputFiles({
   name:"saved.atom",mimeType:"application/atom+xml",buffer:Buffer.from(atom,"utf8"),
  });
  await page.locator('[data-testid="feed-stats"]').waitFor();
  assert.match(await page.locator('[data-testid="feed-stats"]').innerText(),/Research Feed/);
  assert.match(await page.locator('[data-testid="feed-stats"]').innerText(),/Atom/);
  assert.match(await page.locator('[data-testid="feed-stats"]').innerText(),/条目：1/);
  assert.match(await page.locator('[data-testid="feed-stats"]').innerText(),/跳过：1/);
  assert.match(await page.locator('[data-testid="feed-rows"]').innerText(),/中文资料更新/);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
