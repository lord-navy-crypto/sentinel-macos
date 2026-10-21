"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip"),{Document,Paragraph,Packer}=require("docx"),{PDFDocument}=require("pdf-lib");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const folder=path.join(__dirname,"browser-test-results","quality-review");
fs.mkdirSync(folder,{recursive:true});
async function start(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function navigate(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const b=page.locator(".catalog-open");assert.equal(await b.count(),1);
 await b.click();await page.locator('[data-testid="quality-review-desk"]').waitFor();
}
async function download(page,name){
 const wait=page.waitForEvent("download",{timeout:30000});
 await page.locator('[data-testid="quality-export"]').click();
 const file=await wait,target=path.join(folder,name);
 await file.saveAs(target);return JSZip.loadAsync(fs.readFileSync(target),{checkCRC32:true});
}
async function finish(s,name){
 try{await s.page.screenshot({path:path.join(folder,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
async function word(...paragraphs){
 return Packer.toBuffer(new Document({sections:[{children:paragraphs.map(text=>new Paragraph(text))}]}));
}
test("real Word files produce review report and actual paragraph-level changes",{timeout:60000},async()=>{
 const s=await start();try{
  await navigate(s.page,"Word Paragraph Diff");
  await s.page.locator('[data-testid="quality-word-a"]').setInputFiles({
   name:"old.docx",mimeType:"application/octet-stream",buffer:await word("Intro","Keep","Old ending")});
  await s.page.locator('[data-testid="quality-word-b"]').setInputFiles({
   name:"new.docx",mimeType:"application/octet-stream",buffer:await word("Intro","Keep","New ending")});
  await s.page.locator('[data-testid="quality-review"]').click();
  assert.match(await s.page.locator('[data-testid="quality-word-stats"]').innerText(),/相同 2 段/);
  const zip=await download(s.page,"word-comparison.zip");
  const txt=await zip.file("reports/word-paragraph-diff.txt").async("string");
  assert.match(txt,/- Old ending/);assert.match(txt,/\+ New ending/);
  const json=JSON.parse(await zip.file("reports/word-paragraph-diff.json").async("string"));
  assert.equal(json.added,1);assert.equal(json.removed,1);
 }finally{await finish(s,"word-diff.png");}
});
function toneWav(){
 const frames=8000,b=Buffer.alloc(44+frames*2),tags=[[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]];
 tags.forEach(([p,t])=>b.write(t,p));b.writeUInt32LE(b.length-8,4);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.writeUInt32LE(frames*2,40);
 for(let i=1600;i<5600;i++)b.writeInt16LE(Math.round(11000*Math.sin(2*Math.PI*220*i/8000)),44+i*2);
 return b;
}
test("browser uploads actual PCM WAV, identifies silence, and exports shorter valid WAV",{timeout:60000},async()=>{
 const s=await start();try{
  await navigate(s.page,"WAV Silence Auto Trim");
  const original=toneWav();
  await s.page.locator('[data-testid="quality-wav"]').setInputFiles({
   name:"voice.wav",mimeType:"audio/wav",buffer:original});
  await s.page.locator('[data-testid="quality-pad"]').fill("0");
  await s.page.locator('[data-testid="quality-review"]').click();
  assert.match(await s.page.locator('[data-testid="quality-wav-stats"]').innerText(),/首部移除/);
  const zip=await download(s.page,"trimmed-audio.zip");
  const audio=await zip.file("audio/trimmed.wav").async("uint8array");
  assert.equal(Buffer.from(audio).toString("utf8",0,4),"RIFF");
  assert.ok(audio.length>7000&&audio.length<9000);
  const manifest=JSON.parse(await zip.file("reports/silence.json").async("string"));
  assert.ok(manifest.removedStartMs>190);
 }finally{await finish(s,"wav-silence.png");}
});
test("browser uploads actual PDFs and exports real page-geometry CSV and JSON audit",{timeout:60000},async()=>{
 const s=await start();try{
  await navigate(s.page,"PDF Batch Page Audit");
  const make=async(title)=>{
   const doc=await PDFDocument.create();doc.addPage([595,842]);doc.addPage([842,595]);doc.setTitle(title);
   return Buffer.from(await doc.save());
  };
  await s.page.locator('[data-testid="quality-pdfs"]').setInputFiles([
   {name:"biology.pdf",mimeType:"application/pdf",buffer:await make("Biology")},
   {name:"physics.pdf",mimeType:"application/pdf",buffer:await make("Physics")}
  ]);
  await s.page.locator('[data-testid="quality-review"]').click();
  assert.match(await s.page.locator('[data-testid="quality-pdf-stats"]').innerText(),/4 页/);
  const zip=await download(s.page,"pdf-page-audit.zip");
  const csv=await zip.file("reports/pdf-page-audit.csv").async("string");
  assert.match(csv,/biology.pdf/);assert.match(csv,/Physics/);
  const json=JSON.parse(await zip.file("reports/pdf-page-audit.json").async("string"));
  assert.equal(json.files.length,2);assert.equal(json.totalPages,4);
  assert.equal(json.files[0].portrait,1);
 }finally{await finish(s,"pdf-audit.png");}
});