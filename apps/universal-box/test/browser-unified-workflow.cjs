"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const {Document,Paragraph,Packer}=require("docx");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","unified");
fs.mkdirSync(folder,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function navigate(page){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill("Unified Workflow");
 const list=page.locator(".catalog-open");
 assert.equal(await list.count(),1);
 await list.click();
 await page.locator('[data-testid="unified-workflow-panel"]').waitFor();
}
async function download(page,filename){
 const waiting=page.waitForEvent("download",{timeout:40000});
 await page.locator('[data-testid="unified-export"]').click();
 const result=await waiting,filepath=path.join(folder,filename);
 await result.saveAs(filepath);
 const bytes=fs.readFileSync(filepath);assert.ok(bytes.length>150);
 return JSZip.loadAsync(bytes,{checkCRC32:true});
}
async function screenshotAndClose(s,name){
 try{await s.page.screenshot({path:path.join(folder,name),fullPage:true});
  assert.deepEqual(s.errors,[]);
 }finally{await s.page.close();await s.browser.close();}
}
test("real mixed input: Word creation, CSV formula safety, JSON type inference, Office extraction and picture normalization",{timeout:90000},async()=>{
 const s=await open();
 try{
  await navigate(s.page);
  const imageBase64=await s.page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=420;c.height=180;
   const g=c.getContext("2d");g.fillStyle="#1558b7";g.fillRect(0,0,c.width,c.height);
   g.fillStyle="#ffffff";g.fillRect(25,25,200,90);
   return c.toDataURL("image/png").split(",")[1];
  });
  const docx=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph("Quarterly research"),new Paragraph("This Word document was generated for real browser inspection.")]}]}));
  await s.page.locator('[data-testid="unified-files"]').setInputFiles([
   {name:"lab.md",mimeType:"text/markdown",buffer:Buffer.from("# Research log\n\n- Model and measure","utf8")},
   {name:"team.csv",mimeType:"text/csv",buffer:Buffer.from("name,value\n Mia ,=2+3\n Mia ,=2+3\nLeo,4\n")},
   {name:"shape.json",mimeType:"application/json",buffer:Buffer.from('{"students":[{"name":"Alice","club":"Science"},{"name":"Bob"}]}')},
   {name:"report.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:docx},
   {name:"photo.png",mimeType:"image/png",buffer:Buffer.from(imageBase64,"base64")}
  ]);
  assert.match(await s.page.locator('[data-testid="unified-file-count"]').innerText(),/5 个文件/);
  assert.equal(await s.page.locator('[data-testid="unified-plan-row"]').count(),5);
  const zip=await download(s.page,"unified-mixed-output.zip");
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.processed,5);
  assert.equal(manifest.failed,0);
  assert.equal(manifest.generator,"Sentinel Box");
  assert.equal(manifest.files.length,5);
  assert.ok(manifest.files.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
  const word=await JSZip.loadAsync(await zip.file("processed/001-lab.docx").async("uint8array"));
  assert.match(await word.file("word/document.xml").async("string"),/Model and measure/);
  const csv=await zip.file("processed/002-team.clean.csv").async("string");
  assert.match(csv,/'=2\+3/);
  assert.doesNotMatch(csv,/ Mia /);
  assert.match(await zip.file("processed/003-shape.ts").async("string"),/club\?: string/);
  assert.match(await zip.file("processed/004-report.extracted.txt").async("string"),/Quarterly research/);
  const image=await zip.file("processed/005-photo.png").async("uint8array");
  assert.deepEqual([...image.slice(0,8)],[137,80,78,71,13,10,26,10]);
  const pixels=await s.page.evaluate(async b64=>{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src="data:image/png;base64,"+b64;});
   const canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;
   const g=canvas.getContext("2d");g.drawImage(img,0,0);
   return {width:canvas.width,height:canvas.height,pixel:[...g.getImageData(4,4,1,1).data]};
  },Buffer.from(image).toString("base64"));
  assert.equal(pixels.width,420);assert.equal(pixels.height,180);
  assert.ok(pixels.pixel[2]>100&&pixels.pixel[3]===255);
  assert.match(await s.page.locator('[data-testid="unified-status"]').innerText(),/5 processed/);
  assert.equal(await s.page.locator('[data-testid="unified-result-row"]').count(),5);
 }finally{await screenshotAndClose(s,"unified-mixed-ui.png");}
});
test("real mixed workflow reports invalid JSON, preserves explicit original and archives unsupported PDF only when selected",{timeout:60000},async()=>{
 const s=await open();
 try{
  await navigate(s.page);
  await s.page.locator('[data-testid="unified-originals"]').check();
  await s.page.locator('[data-testid="unified-files"]').setInputFiles([
   {name:"broken.json",mimeType:"application/json",buffer:Buffer.from("{invalid")},
   {name:"sample.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.5\n")}
  ]);
  const zip=await download(s.page,"unified-error-manifest.zip");
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.failed,1);
  assert.equal(manifest.archived,1);
  assert.equal(manifest.processed,0);
  assert.match(manifest.files[0].error,/JSON/);
  assert.equal(await zip.file("originals/001-broken.json").async("string"),"{invalid");
  assert.equal(await zip.file("originals/002-sample.pdf").async("string"),"%PDF-1.5\n");
  assert.equal(zip.file("processed/001-broken.ts"),null);
  assert.match(await s.page.locator('[data-testid="unified-status"]').innerText(),/1 failed/);
 }finally{await screenshotAndClose(s,"unified-errors-ui.png");}
});