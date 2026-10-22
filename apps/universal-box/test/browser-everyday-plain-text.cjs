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


test("Office quick tools: lossless multi-copy clipboard basket, reorder, copy and TXT export",{
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
  await page.locator(".pill-row button").filter({hasText:"Multi-copy"}).click();
  const raw="  First clipboard text\n  Indented second line  ";
  await page.evaluate(async text=>navigator.clipboard.writeText(text),raw);
  // Explicit-only clipboard access: nothing appears until user presses the button.
  assert.equal(await page.locator("#clip-combined").inputValue(),"");
  await page.locator('[data-testid="quick-clip-read"]').click();
  await page.waitForFunction(expected=>document.querySelector("#clip-combined")?.value===expected,raw);
  assert.equal(await page.locator("#clip-combined").inputValue(),raw);

  await page.locator("#clip-draft").fill("Second snippet");
  await page.locator('[data-testid="quick-clip-add"]').click();
  assert.equal(await page.locator("#clip-combined").inputValue(),raw+"\nSecond snippet");
  await page.locator('[data-testid="quick-clip-up-1"]').click();
  const reordered="Second snippet\n"+raw;
  assert.equal(await page.locator("#clip-combined").inputValue(),reordered);
  await page.locator('[data-testid="quick-clip-copy"]').click();
  await page.waitForFunction(async expected=>(await navigator.clipboard.readText())===expected,reordered);
  await page.locator("#clip-separator").selectOption("blank");
  const expected="Second snippet\n\n"+raw;
  assert.equal(await page.locator("#clip-combined").inputValue(),expected);

  const [download]=await Promise.all([
   page.waitForEvent("download"),
   page.locator('[data-testid="quick-clip-save"]').click(),
  ]);
  assert.equal(download.suggestedFilename(),"combined-snippets.txt");
  const saved=path.join(output,"combined-snippets.txt");
  await download.saveAs(saved);
  assert.equal(fs.readFileSync(saved,"utf8"),expected);
  await page.locator('[data-testid="quick-clip-clear"]').click();
  assert.equal(await page.locator("#clip-combined").inputValue(),"");
  await page.screenshot({path:path.join(output,"clipboard-basket.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{
  await page.close();await context.close();await browser.close();
 }
});
