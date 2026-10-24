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
 assert.ok(bytes.length>(name.endsWith(".md")?10:100),"empty or invalid export: "+name);
 return bytes;
}
async function cleanup(s,name){
 try{
  await s.page.screenshot({path:path.join(dir,name),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
}
async function waitForEditorStatus(page,expected){
 await page.waitForFunction(fragment=>{
  const node=document.querySelector('section[aria-label="Free Creative Office Studio"] p[role="status"]');
  return !!node?.textContent?.includes(fragment);
 },expected,{timeout:12000});
 return page.locator('section[aria-label="Free Creative Office Studio"] p[role="status"]').innerText();
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
  assert.match(svg,/Achievement &amp;/);
  assert.match(svg,/>Growth<\/text>/);
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

test("Word editor imports a real UTF-8 Markdown source, exports editable DOCX and roundtrips raw draft",{timeout:80000},async()=>{
 const session=await setup();
 try{
  const {page}=session;
  await openTool(page,"Word DOCX Templates");
  const markdown="\uFEFF# 每周工作报告\r\n\r\n**本周完成**\r\n- 保持离线办公\r\n- 发送给 {{recipient}}";
  await page.getByTestId("creative-word-draft-file").setInputFiles({
   name:"office-draft.md",mimeType:"text/markdown",buffer:Buffer.from(markdown,"utf8")
  });
  await page.waitForFunction(()=>document.querySelector('[data-testid="creative-word-title"]')?.value==="每周工作报告");
  assert.equal(await page.getByTestId("creative-word-title").inputValue(),"每周工作报告");
  assert.match(await page.getByTestId("creative-word-preview").innerText(),/发送给 李同学/);
  const originalBody=await page.getByTestId("creative-word-body").inputValue();
  const doc=await JSZip.loadAsync(await save(page,'[data-testid="creative-word-export"]',"imported-word.docx"),{checkCRC32:true});
  const contents=await doc.file("word/document.xml").async("string");
  assert.match(contents,/每周工作报告/);
  assert.match(contents,/保持离线办公/);
  assert.match(contents,/李同学/);
  const raw=await save(page,'[data-testid="creative-word-export-draft"]',"imported-word-draft.md");
  assert.equal(raw.toString("utf8"),"# 每周工作报告\n\n"+originalBody);
  await page.getByTestId("creative-word-draft-file").setInputFiles({
   name:"bad.md",mimeType:"text/markdown",buffer:Buffer.from("Unknown {{sensitive}}","utf8")
  });
  assert.match(await waitForEditorStatus(page,"当前编辑内容已保留"),/当前编辑内容已保留/);
  assert.equal(await page.getByTestId("creative-word-body").inputValue(),originalBody);
 }finally{await cleanup(session,"word-import-draft.png");}
});

test("PowerPoint imports UTF-8 MD outline, keeps slide editability and blocks corrupt imports",{timeout:80000},async()=>{
 const session=await setup();
 try{
  const {page}=session;
  await openTool(page,"PowerPoint PPTX Creator");
  const source="# 项目汇报\n\n## 目标\n- 解决办公重复劳动\n- 保留原文件\n\n## 下一步\n- 真实用户反馈";
  await page.getByTestId("creative-slide-draft-file").setInputFiles({
   name:"slides.md",mimeType:"text/markdown",buffer:Buffer.from(source,"utf8")
  });
  await page.waitForFunction(()=>document.querySelector('[data-testid="creative-slide-title"]')?.value==="项目汇报");
  assert.equal(await page.getByTestId("creative-slide-title").inputValue(),"项目汇报");
  assert.match(await page.getByTestId("creative-slide-count").innerText(),/3 张/);
  const outline=await page.getByTestId("creative-slide-outline").inputValue();
  const pptx=await JSZip.loadAsync(await save(page,'[data-testid="creative-pptx-export"]',"imported-slides.pptx"),{checkCRC32:true});
  const presentation=await pptx.file("ppt/presentation.xml").async("string");
  const slide=await pptx.file("ppt/slides/slide2.xml").async("string");
  assert.equal((presentation.match(/<p:sldId id=/g)||[]).length,3);
  assert.match(slide,/解决办公重复劳动/);
  assert.match(slide,/<p:txBody>/);
  const exported=await save(page,'[data-testid="creative-slide-export-draft"]',"imported-slides-outline.md");
  assert.equal(exported.toString("utf8"),"# 项目汇报\n\n"+outline);
  await page.getByTestId("creative-slide-draft-file").setInputFiles({
   name:"bad.md",mimeType:"text/plain",buffer:Buffer.from("## One\n"+Array(9).fill("- Too many").join("\n"),"utf8")
  });
  assert.match(await waitForEditorStatus(page,"当前编辑内容已保留"),/当前编辑内容已保留/);
  assert.equal(await page.getByTestId("creative-slide-outline").inputValue(),outline);
  await page.getByTestId("creative-slide-draft-file").setInputFiles({
   name:"not-utf8.txt",mimeType:"text/plain",buffer:Buffer.from([255,254,0,65])
  });
  assert.match(await waitForEditorStatus(page,"UTF-8"),/UTF-8/);
  assert.equal(await page.getByTestId("creative-slide-outline").inputValue(),outline);
 }finally{await cleanup(session,"pptx-import-draft.png");}
});
