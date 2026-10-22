"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","wcag-contrast");fs.mkdirSync(out,{recursive:true});
test("W3C WCAG contrast: real interface, correct unrounded threshold, accessible suggestion and export",{
 timeout:80000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:860},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("WCAG Text Contrast");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="wcag-contrast-desk"]').waitFor();
  assert.match(await page.locator('[data-testid="contrast-ratio"]').innerText(),/4\.4[0-9]:1/);
  assert.match(await page.locator('[data-testid="contrast-aa-normal"]').innerText(),/未达到/);
  assert.match(await page.locator('[data-testid="contrast-aa-large"]').innerText(),/通过/);
  await page.locator('[data-testid="contrast-foreground"]').fill("#767676");
  assert.match(await page.locator('[data-testid="contrast-aa-normal"]').innerText(),/通过/);
  await page.locator('[data-testid="contrast-foreground"]').fill("#000000");
  assert.match(await page.locator('[data-testid="contrast-ratio"]').innerText(),/21\.00:1/);
  assert.match(await page.locator('[data-testid="contrast-aaa-normal"]').innerText(),/通过/);
  const request=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="contrast-export"]').click();
  const dl=await request;
  assert.equal(dl.suggestedFilename(),"sentinel-wcag-text-contrast.txt");
  const target=path.join(out,"contrast-report.txt");await dl.saveAs(target);
  const report=fs.readFileSync(target,"utf8");
  assert.match(report,/Contrast: 21\.000:1/);
  assert.match(report,/AAA normal text \(7:1\): PASS/);
  assert.match(report,/not full document accessibility/);
  await page.locator('[data-testid="contrast-swap"]').click();
  assert.equal(await page.locator('[data-testid="contrast-foreground"]').inputValue(),"#FFFFFF");
  assert.equal(await page.locator('[data-testid="contrast-background"]').inputValue(),"#000000");
  await page.locator('[data-testid="contrast-foreground"]').fill("#777777");
  await page.locator('[data-testid="contrast-use-suggestion"]').click();
  assert.equal(await page.locator('[data-testid="contrast-foreground"]').inputValue(),"#FFFFFF");
  await page.locator('[data-testid="contrast-background"]').fill("#12345678");
  await page.locator('[data-testid="contrast-error"]').waitFor();
  assert.equal(await page.locator('[data-testid="contrast-export"]').count(),0);
  await page.locator('[data-testid="contrast-background"]').fill("#ffffff");
  await page.locator('[data-testid="contrast-ratio"]').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
