"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const results=path.join(__dirname,"browser-test-results","word-counter");fs.mkdirSync(results,{recursive:true});
test("existing Word Counter supports real Unicode graphemes, selection, limit presets and text file export",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1380,height:930},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Character & Word Counter");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="unicode-text-counter"]').waitFor();
  const input=page.locator("#utility-input");
  await input.fill("Hello 👩‍👩‍👧‍👦 汉字 42!");
  assert.match(await page.locator('[data-testid="count-characters"]').innerText(),/^14 字符$/u);
  assert.match(await page.locator('[data-testid="count-letters"]').innerText(),/^7 字母$/u);
  await page.locator('[data-testid="counter-preset"]').selectOption("custom");
  await page.locator('[data-testid="counter-custom-limit"]').fill("10");
  assert.match(await page.locator('[data-testid="counter-limit-summary"]').innerText(),/超过限制 4/u);
  await input.selectText();
  assert.match(await page.locator('[data-testid="counter-selection"]').innerText(),/14 可见字符/u);
  const action=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="counter-save"]').click();
  const dl=await action,target=path.join(results,"text-count.txt");
  await dl.saveAs(target);const report=fs.readFileSync(target,"utf8");
  assert.match(report,/Unicode visible characters: 14/);
  assert.match(report,/Latin letters: 5/);
  assert.match(report,/Han characters: 2/);
  await page.locator('[data-testid="counter-import"]').setInputFiles({
   name:"notes.txt",mimeType:"text/plain",buffer:Buffer.from("A e\u0301 👩‍👩‍👧‍👦","utf8"),
  });
  assert.match(await page.locator('[data-testid="count-characters"]').innerText(),/^5 字符$/u);
  assert.equal(await input.inputValue(),"A e\u0301 👩‍👩‍👧‍👦");
  await page.screenshot({path:path.join(results,"word-counter.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
