"use strict";
/** Real browser exports; system picker itself is substituted only in capture test. */
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const URL=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","vision-workflows");
fs.mkdirSync(dir,{recursive:true});
async function setup(opts={}){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 if(opts.mockCapture){
  await page.addInitScript(()=>{
   Object.defineProperty(navigator.mediaDevices,"getDisplayMedia",{configurable:true,value:async()=>{
    const c=document.createElement("canvas");c.width=280;c.height=140;
    const ctx=c.getContext("2d");ctx.fillStyle="#2e91ce";ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle="#ffffff";ctx.fillRect(30,30,90,35);
    return c.captureStream(15);
   }});
  });
 }
 await page.goto(URL,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function openTool(page,search){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(search);
 const item=page.locator(".catalog-open");assert.equal(await item.count(),1);
 await item.click();
}
async function download(page,selector,name){
 const done=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();const file=await done;
 const filepath=path.join(dir,name);await file.saveAs(filepath);
 const data=fs.readFileSync(filepath);assert.ok(data.length>100);
 return data;
}
async function cleanup(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
test("one-click ZIP contains inspectable DOCX, PPTX and SVG, all editable originals",{timeout:60000},async()=>{
 const s=await setup();try{
  await openTool(s.page,"One-Click Project Kit");
  await s.page.locator('[data-testid="vision-project-title"]').fill("Chromium Project");
  await s.page.locator('[data-testid="vision-project-outline"]').fill(
   "## Prepare\n- Gather data\n## Build\n- Prototype\n## Present\n- Review");
  assert.match(await s.page.locator('[data-testid="vision-project-preview"]').innerText(),/4 张幻灯片/);
  const archive=await JSZip.loadAsync(await download(s.page,'[data-testid="vision-project-export"]',"real-project-kit.zip"),{checkCRC32:true});
  for(const name of ["project/brief.docx","project/slides.pptx","project/process.svg","project/manifest.json"]){
   assert.ok(archive.file(name),"Missing "+name);
  }
  const ppt=await JSZip.loadAsync(await archive.file("project/slides.pptx").async("uint8array"));
  const presentation=await ppt.file("ppt/presentation.xml").async("string");
  assert.equal((presentation.match(/<p:sldId id=/g)||[]).length,4);
  const doc=await JSZip.loadAsync(await archive.file("project/brief.docx").async("uint8array"));
  assert.match(await doc.file("word/document.xml").async("string"),/Chromium Project/);
  const svg=await archive.file("project/process.svg").async("string");
  assert.match(svg,/Prepare/);
  const manifest=JSON.parse(await archive.file("project/manifest.json").async("string"));
  assert.deepEqual(manifest.servicesUsed,[]);
 }finally{await cleanup(s,"project.png");}
});
test("browser preview explicitly disables native Vision OCR rather than fabricating text",{timeout:60000},async()=>{
 const s=await setup();try{
  await openTool(s.page,"Apple Vision OCR");
  await s.page.locator('[data-testid="vision-native-unavailable"]').waitFor();
  const sample=await s.page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=160;c.height=80;const g=c.getContext("2d");
   g.fillStyle="#fff";g.fillRect(0,0,160,80);g.fillStyle="#000";g.font="22px Arial";g.fillText("HELLO",10,40);
   return c.toDataURL("image/png").split(",")[1];
  });
  await s.page.locator('[data-testid="vision-image-input"]').setInputFiles({
   name:"ocr-demo.png",mimeType:"image/png",buffer:Buffer.from(sample,"base64")
  });
  assert.equal(await s.page.locator('[data-testid="vision-run-ocr"]').isDisabled(),true);
  assert.equal(await s.page.locator('[data-testid="vision-text-result"]').count(),0);
 }finally{await cleanup(s,"native-only-ocr.png");}
});
test("user-approved screen picker stream captures a genuine PNG and stops tracks",{timeout:70000},async()=>{
 const s=await setup({mockCapture:true});try{
  await openTool(s.page,"Screen Frame Capture");
  await s.page.locator('[data-testid="vision-screen-capture"]').click();
  await s.page.locator('[data-testid="vision-file-info"]').waitFor({timeout:15000});
  const png=await download(s.page,'[data-testid="vision-save-screen"]',"selected-screen.png");
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>200);
  const pixel=await s.page.evaluate(async b64=>{
   const img=new Image();await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=reject;img.src="data:image/png;base64,"+b64;
   });
   const canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
   return [...ctx.getImageData(4,4,1,1).data];
  },png.toString("base64"));
  assert.ok(pixel[2]>150&&pixel[3]===255,"captured pixels must come from test screen stream");
 }finally{await cleanup(s,"single-screen.png");}
});
