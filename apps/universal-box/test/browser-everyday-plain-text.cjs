"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const output=path.join(__dirname,"browser-test-results","everyday-plain-text");
fs.mkdirSync(output,{recursive:true});

test("Office quick tools: explicit clipboard read, preserved original and opt-in PDF line reflow",{
 timeout:75000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const context=await browser.newContext({
  viewport:{width:1440,height:940},acceptDownloads:true,
  permissions:["clipboard-read","clipboard-write"],
 });
 const page=await context.newPage(),errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Text Cleaner");
  await page.locator(".catalog-open").first().click();
  await page.locator("#quick-text-input").waitFor();

  const raw="Report   heading\nContinues on the next line.\n\n项目说明\n第二行";
  await page.evaluate(async text=>navigator.clipboard.writeText(text),raw);
  // No implicit passive clipboard reading or clipboard monitoring.
  assert.notEqual(await page.locator("#quick-text-input").inputValue(),raw);
  await page.locator('[data-testid="quick-paste-plain"]').click();
  try{
   await page.waitForFunction(text=>
    document.querySelector("#quick-text-input")?.value===text,raw,{timeout:10000});
  }catch{
   const info=(await page.locator('p[role="status"]').allTextContents()).join(" | ");
   throw Error("Clipboard import did not populate input: "+info);
  }
  assert.equal(await page.locator("#quick-text-input").inputValue(),raw);

  // Plain-copy preserves original line breaks/spaces; this is not the cleanup action.
  await page.locator('[data-testid="quick-copy-source-plain"]').click();
  await page.waitForFunction(async expected=>(await navigator.clipboard.readText())===expected,raw,{timeout:10000});
  await page.locator('[data-testid="quick-reflow-soft"]').check();
  const expected="Report heading Continues on the next line.\n\n项目说明第二行";
  assert.equal(await page.locator("#quick-result").inputValue(),expected);
  await page.locator('[data-testid="quick-copy-cleaned"]').click();
  await page.waitForFunction(async value=>(await navigator.clipboard.readText())===value,expected,{timeout:10000});

  // The user can toggle the optional transformation off and preserve intentional line breaks.
  await page.locator('[data-testid="quick-reflow-soft"]').uncheck();
  assert.equal(await page.locator("#quick-result").inputValue(),
   "Report heading\nContinues on the next line.\n\n项目说明\n第二行");
  await page.screenshot({path:path.join(output,"plain-text-reflow.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{
  await page.close();await context.close();await browser.close();
 }
});
