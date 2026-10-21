"use strict";
/** Actual Chromium export -> saved DOCX/PPTX/SVG inspection, beyond navigation smoke. */
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","creative-studio");
fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {page,browser,errors};
}
async function openTool(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const hit=page.locator(".catalog-open");
 assert.equal(await hit.count(),1,"Ambiguous catalog query "+query);
 await hit.click();
}
async function save(page,selector,name){
 const download=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();
 const file=await download;
 const target=path.join(dir,name);
 await file.saveAs(target);
 const bytes=fs.readFileSync(target);
 assert.ok(bytes.length>100,"empty file: "+name);
 return bytes;
}
async function cleanup(s,name){
 try{
  await s.page.screenshot({path:path.join(dir,name),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
}
test("real DOCX template export substitutes fields as editable Word text",{timeout:60000},async()=>{
 const s=await setup();
 try{
  await openTool(s.page,"Word DOCX Templates");
  await s.page.locator('[data-testid="creative-word-title"]').fill("Hello Word");
  await s.page.locator('[data-testid="creative-word-body"]').fill("Dear {{recipient}}\n\n**{{event}}** on {{date}}.");
  assert.match(await s.page.locator('[data-testid="creative-word-preview"]').innerText(),/Dear 李同学/);
  const zip=await JSZip.loadAsync(await save(s.page,'[data-testid="creative-word-export"]',"word-template.docx"),{checkCRC32:true});
  const xml=await zip.file("word/document.xml").async("string");
  assert.match(xml,/Hello Word/);
  assert.match(xml,/李同学/);
  assert.match(xml,/创意科技分享会/);
  assert.match(xml,/2026-11-12/);
 }finally{await cleanup(s,"word-screen.png");}
});
test("real PPTX outline produces cover and multiple native editable slides",{timeout:60000},async()=>{
 const s=await setup();
 try{
  await openTool(s.page,"PowerPoint PPTX Creator");
  await s.page.locator('[data-testid="creative-slide-title"]').fill("Hello Slides");
  await s.page.locator('[data-testid="creative-slide-outline"]').fill("## First topic\n- Welcome\n- We build freely\n## Second topic\n- Real outputs");
  assert.match(await s.page.locator('[data-testid="creative-slide-count"]').innerText(),/3 张/);
  const zip=await JSZip.loadAsync(await save(s.page,'[data-testid="creative-pptx-export"]',"native-slides.pptx"),{checkCRC32:true});
  const presentation=await zip.file("ppt/presentation.xml").async("string");
  const first=await zip.file("ppt/slides/slide1.xml").async("string");
  const second=await zip.file("ppt/slides/slide2.xml").async("string");
  assert.equal((presentation.match(/<p:sldId id=/g)||[]).length,3);
  assert.match(first,/Hello Slides/);
  assert.match(second,/First topic/);
  assert.match(second,/Welcome/);
  assert.match(second,/<p:txBody>/);
  assert.ok(zip.file("ppt/slideMasters/slideMaster1.xml"));
 }finally{await cleanup(s,"pptx-screen.png");}
});
test("poster/certificate design exports safe XML SVG with layout variant",{timeout:60000},async()=>{
 const s=await setup();
 try{
  await openTool(s.page,"Free Poster & Invitation Maker");
  await s.page.locator('[data-testid="creative-design-format"]').selectOption("certificate");
  await s.page.locator('[data-testid="creative-design-title"]').fill("Achievement & Growth");
  assert.ok(await s.page.locator('[data-testid="creative-design-preview"]').isVisible());
  const svg=(await save(s.page,'[data-testid="creative-svg-export"]',"certificate.svg")).toString("utf8");
  assert.match(svg,/viewBox="0 0 900 650"/);
  assert.match(svg,/Achievement &amp; Growth/);
  assert.doesNotMatch(svg,/<script/);
  assert.match(svg,/<text /);
 }finally{await cleanup(s,"poster-screen.png");}
});

test("real flowchart steps export directional SVG shapes and escaped text",{timeout:60000},async()=>{
 const s=await setup();
 try{
  await openTool(s.page,"Flowchart Maker");
  await s.page.locator('[data-testid="creative-flow-title"]').fill("Flow & Work");
  await s.page.locator('[data-testid="creative-flow-steps"]').fill("Collect\nDesign <safe>\nPublish");
  assert.ok(await s.page.locator('[data-testid="creative-flow-preview"]').isVisible());
  const svg=(await save(s.page,'[data-testid="creative-flow-export"]',"flowchart.svg")).toString("utf8");
  assert.match(svg,/Flow &amp; Work/);
  assert.match(svg,/Design &lt;safe&gt;/);
  assert.equal((svg.match(/<rect x="170"/g)||[]).length,3);
  assert.equal((svg.match(/<path d="M 500/g)||[]).length,2);
 }finally{await cleanup(s,"flowchart-screen.png");}
});
