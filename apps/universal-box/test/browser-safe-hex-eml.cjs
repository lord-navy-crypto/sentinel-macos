"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","legacy-phase1");
fs.mkdirSync(out,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:920},acceptDownloads:true});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function tool(page,name,testId){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(name);
 const item=page.locator(".catalog-open");
 assert.equal(await item.count(),1,"Expected exactly one catalog match");
 await item.click();await page.locator('[data-testid="'+testId+'"]').waitFor();
}
test("HEX viewer reads actual binary, searches offsets, paginates and preserves previous data on bad input",{
 timeout:90000,
},async()=>{
 const s=await open();
 try{
  await tool(s.page,"Read-Only HEX Viewer","hex-viewer");
  const bytes=Buffer.alloc(1100,0);
  bytes.set([0,255,0x41,10,127,32,90],0);
  bytes.set([0xde,0xad,0xbe,0xef],600);
  bytes.set([0xde,0xad,0xbe,0xef],1000);
  await s.page.locator('[data-testid="hex-file"]').setInputFiles({
   name:"mystery.bin",mimeType:"application/octet-stream",buffer:bytes,
  });
  await s.page.locator('[data-testid="hex-stats"]').waitFor();
  assert.match(await s.page.locator('[data-testid="hex-stats"]').innerText(),/1,100 bytes/);
  assert.match(await s.page.locator('[data-testid="hex-rows"]').innerText(),/00 FF 41 0A 7F 20 5A/);
  assert.match(await s.page.locator('[data-testid="hex-rows"]').innerText(),/00000000/);
  await s.page.locator('[data-testid="hex-pattern"]').fill("DE AD BE EF");
  await s.page.locator('[data-testid="hex-search"]').click();
  await s.page.locator('[data-testid="hex-matches"]').waitFor();
  assert.match(await s.page.locator('[data-testid="hex-matches"]').innerText(),/实际匹配总数：2/);
  assert.equal(await s.page.locator('[data-testid="hex-match"]').count(),2);
  await s.page.locator('[data-testid="hex-match"]').nth(0).click();
  assert.match(await s.page.locator('[data-testid="hex-page-info"]').innerText(),/00000200/);
  assert.match(await s.page.locator('[data-testid="hex-rows"]').innerText(),/DE AD BE EF/);
  await s.page.locator('[data-testid="hex-jump-offset"]').fill("0x400");
  await s.page.locator('[data-testid="hex-jump"]').click();
  assert.match(await s.page.locator('[data-testid="hex-page-info"]').innerText(),/00000400/);
  await s.page.locator('[data-testid="hex-jump-offset"]').fill("9999");
  await s.page.locator('[data-testid="hex-jump"]').click();
  await s.page.locator('[data-testid="hex-status"]').filter({hasText:"跳转失败"}).waitFor();
  assert.match(await s.page.locator('[data-testid="hex-page-info"]').innerText(),/00000400/);
  const download=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="hex-summary"]').click();
  const item=await download;
  assert.equal(item.suggestedFilename(),"sentinel-hex-summary.txt");
  const target=path.join(out,"hex-summary.txt");await item.saveAs(target);
  const summary=fs.readFileSync(target,"utf8");
  assert.match(summary,/mystery.bin/);assert.match(summary,/Bytes: 1100/);
  assert.match(summary,/00 FF 41 0A 7F 20 5A/);

  await s.page.locator('[data-testid="hex-file"]').setInputFiles({
   name:"bad.bin",mimeType:"application/octet-stream",buffer:Buffer.alloc(0),
  });
  await s.page.locator('[data-testid="hex-status"]').filter({hasText:"之前的查看内容未改变"}).waitFor();
  assert.match(await s.page.locator('[data-testid="hex-stats"]').innerText(),/1,100 bytes/);
  await s.page.locator('[data-testid="hex-clear"]').click();
  assert.equal(await s.page.locator('[data-testid="hex-rows"]').count(),0);
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});
test("EML archive reads real MIME text and metadata, never loads HTML, exports summary, retains previous mail on errors",{
 timeout:90000,
},async()=>{
 const s=await open();const outgoing=[];
 s.page.on("request",r=>{if(r.url().includes("no-external.invalid"))outgoing.push(r.url());});
 try{
  await tool(s.page,"Local EML Mail Archive","eml-desk");
  const mail=[
   "From: Alice <alice@example.org>",
   "To: Bob <bob@example.org>",
   "Subject: =?UTF-8?B?5rWL6K+V?= archive",
   "Date: Thu, 22 Oct 2026 09:00:00 +0000",
   'MIME-Version: 1.0',
   'Content-Type: multipart/mixed; boundary="e2e-boundary"',
   "",
   "--e2e-boundary",
   'Content-Type: text/plain; charset=UTF-8',
   "Content-Transfer-Encoding: quoted-printable",
   "",
   "Hello=20local=20world=21",
   "--e2e-boundary",
   'Content-Type: text/html; charset=UTF-8',
   "",
   '<img src="https://no-external.invalid/track.png"><script>fetch("https://no-external.invalid/run")</script>',
   "--e2e-boundary",
   'Content-Type: application/pdf; name="archive.pdf"',
   'Content-Disposition: attachment; filename="archive.pdf"',
   "Content-Transfer-Encoding: base64",
   "",
   "JVBERi0xLjQ=",
   "--e2e-boundary--",
   "",
  ].join("\r\n");
  await s.page.locator('[data-testid="eml-file"]').setInputFiles({
   name:"archived-message.eml",mimeType:"message/rfc822",buffer:Buffer.from(mail,"utf8"),
  });
  await s.page.locator('[data-testid="eml-headers"]').waitFor();
  assert.match(await s.page.locator('[data-testid="eml-headers"]').innerText(),/测试 archive/);
  assert.match(await s.page.locator('[data-testid="eml-headers"]').innerText(),/附件数：1/);
  assert.equal(await s.page.locator('[data-testid="eml-text"]').inputValue(),"Hello local world!");
  assert.match(await s.page.locator('[data-testid="eml-attachments"]').innerText(),/archive.pdf/);
  assert.equal(outgoing.length,0,"No remote assets from the original HTML should be requested.");
  const wait=s.page.waitForEvent("download",{timeout:30000});
  await s.page.locator('[data-testid="eml-export"]').click();
  const download=await wait;assert.equal(download.suggestedFilename(),"eml-text-only-summary.txt");
  const filePath=path.join(out,"eml-summary.txt");await download.saveAs(filePath);
  const txt=fs.readFileSync(filePath,"utf8");
  assert.match(txt,/Hello local world!/);assert.match(txt,/archive.pdf/);
  assert.doesNotMatch(txt,/no-external.invalid/);

  await s.page.locator('[data-testid="eml-file"]').setInputFiles({
   name:"corrupt.eml",mimeType:"message/rfc822",buffer:Buffer.from("a".repeat(64)),
  });
  await s.page.locator('[data-testid="eml-status"]').filter({hasText:"旧邮件仍可查看"}).waitFor();
  assert.match(await s.page.locator('[data-testid="eml-headers"]').innerText(),/测试 archive/);
  await s.page.locator('[data-testid="eml-clear"]').click();
  assert.equal(await s.page.locator('[data-testid="eml-headers"]').count(),0);
  assert.equal(outgoing.length,0);assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
});
