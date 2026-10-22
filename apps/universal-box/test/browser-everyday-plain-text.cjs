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


test("Favorite-first daily quick launch opens real existing tools and reacts to stars",{
 timeout:75000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1380,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  const quick=page.locator('[data-testid="daily-quick-launch"]');
  await quick.waitFor();
  assert.equal(await quick.getByRole("button").count(),6);
  await page.locator('[data-testid="daily-shortcut-quick-clean-text"]').click();
  await page.locator("#quick-text-input").waitFor();

  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Target Size Photo Compression");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-favorite").click();
  await page.locator("#all-tools-search").fill("");
  const buttons=page.locator('[data-testid="daily-quick-launch"] button');
  assert.match(await buttons.first().innerText(),/★.*Target Size Photo Compression/);
  assert.equal(await buttons.count(),6);
  await page.locator('[data-testid="daily-shortcut-target-photo-compressor"]').click();
  await page.locator('[data-testid="photo-files"]').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("Manual copy fallback selects the actual processed result when clipboard write is denied",{
 timeout:75000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1280,height:850}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,"clipboard",{configurable:true,value:{
    readText:async()=>{throw Error("NotAllowedError: denied by user");},
    writeText:async()=>{throw Error("NotAllowedError: denied by user");},
   }});
  });
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Text Cleaner");
  await page.locator(".catalog-open").first().click();
  const value="  Confidential test paragraph\nSecond line";
  await page.locator("#quick-text-input").fill(value);
  await page.locator('[data-testid="quick-copy-cleaned"]').click();
  const result=page.locator("#quick-result");
  await page.waitForFunction(()=>document.activeElement?.id==="quick-result");
  const selected=await result.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd));
  assert.equal(selected,await result.inputValue());
  assert.match(await page.getByRole("status").last().innerText(),/已选中全部整理结果/);
  // Explicit manual copy must also work even when clipboard APIs are unavailable.
  await page.locator('[data-testid="quick-select-source"]').click();
  assert.equal(await page.locator("#quick-text-input").evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),value);
  await page.locator('[data-testid="quick-paste-plain"]').click();
  assert.equal(await page.locator("#quick-text-input").inputValue(),value,"Denied clipboard read must not replace source text");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Local text editor imports UTF-8 files and keeps original text after invalid upload/drop",{
 timeout:75000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1280,height:850}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Text Cleaner");
  await page.locator(".catalog-open").first().click();
  const raw="  你好，Sentinel Box\n    Second line  \n";
  await page.locator('[data-testid="quick-text-file"]').setInputFiles({
   name:"report.MD",mimeType:"text/markdown",buffer:Buffer.from(raw,"utf8")
  });
  await page.waitForFunction(expected=>document.querySelector("#quick-text-input")?.value===expected,raw);
  assert.equal(await page.locator("#quick-text-input").inputValue(),raw);
  await page.locator('[data-testid="quick-text-file"]').setInputFiles({
   name:"legacy.txt",mimeType:"text/plain",buffer:Buffer.from([0xff,0xfe,0x41,0x00])
  });
  await page.getByRole("status").last().filter({hasText:"UTF-8"}).waitFor();
  assert.equal(await page.locator("#quick-text-input").inputValue(),raw,"Malformed encoding must not replace current text");
  await page.evaluate(()=>{
   const data=new DataTransfer();
   data.items.add(new File(["Drag and drop\nwith exact newlines"],"dropped.txt",{type:"text/plain"}));
   document.querySelector('[data-testid="quick-text-import"]').dispatchEvent(
    new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));
  });
  await page.waitForFunction(()=>document.querySelector("#quick-text-input")?.value==="Drag and drop\nwith exact newlines");
  assert.equal(await page.locator("#quick-text-input").inputValue(),"Drag and drop\nwith exact newlines");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
