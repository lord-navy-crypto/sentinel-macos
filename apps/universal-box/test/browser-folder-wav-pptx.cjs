"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","research-tools");fs.mkdirSync(dir,{recursive:true});
async function boot(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function enter(page,text){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(text);
 assert.equal(await page.locator(".catalog-open").count(),1,"Catalog search should be unique: "+text);
 await page.locator(".catalog-open").click();await page.locator('[data-testid="research-tools-desk"]').waitFor();
}
async function download(page,selector,filename){
 const promise=page.waitForEvent("download",{timeout:25000});
 await page.locator(selector).click();
 const dl=await promise,to=path.join(dir,filename);await dl.saveAs(to);
 return fs.readFileSync(to);
}
async function finish(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
function wav(){
 const frames=8000,dataBytes=frames*2,buf=Buffer.alloc(44+dataBytes);
 buf.write("RIFF",0);buf.writeUInt32LE(36+dataBytes,4);buf.write("WAVE",8);buf.write("fmt ",12);
 buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(8000,24);buf.writeUInt32LE(16000,28);buf.writeUInt16LE(2,32);
 buf.writeUInt16LE(16,34);buf.write("data",36);buf.writeUInt32LE(dataBytes,40);
 for(let i=0;i<frames;i++)buf.writeInt16LE(i%2?-16384:16384,44+i*2);
 return buf;
}
async function deck(){
 const zip=new JSZip();
 zip.file("ppt/presentation.xml",'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
 zip.file("ppt/_rels/presentation.xml.rels",'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
 zip.file("ppt/slides/slide1.xml",'<p:sld><a:p><a:t>Slide visible content</a:t></a:p></p:sld>');
 zip.file("ppt/slides/_rels/slide1.xml.rels",'<Relationships><Relationship Id="n1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>');
 zip.file("ppt/notesSlides/notesSlide1.xml",'<p:notes><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Speaker says: 你好 &amp; welcome</a:t></a:r></a:p></p:txBody></p:sp></p:notes>');
 return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
}
test("Folder space UI creates real CSV and SVG from user-selected files",{timeout:65000},async()=>{
 const s=await boot();try{
  await enter(s.page,"Folder Space Inspector");
  await s.page.locator('[data-testid="folder-audit-files"]').setInputFiles([
   {name:"first.txt",mimeType:"text/plain",buffer:Buffer.from("1234567890")},
   {name:"second.png",mimeType:"image/png",buffer:Buffer.alloc(200,0)},
  ]);
  assert.match(await s.page.locator('[data-testid="folder-audit-summary"]').innerText(),/2 files/);
  const csv=(await download(s.page,'[data-testid="folder-audit-csv"]',"folders.csv")).toString("utf8");
  assert.match(csv,/\.png/);assert.match(csv,/\.txt/);
  const svg=(await download(s.page,'[data-testid="folder-audit-svg"]',"folders.svg")).toString("utf8");
  assert.match(svg,/<svg/);assert.match(svg,/Selected folder sizes/);
 }finally{await finish(s,"folder-audit.png");}
});
test("WAV user import calculates correct levels and exports actual JSON/CSV",{timeout:65000},async()=>{
 const s=await boot();try{
  await enter(s.page,"WAV Audio Levels");
  await s.page.locator('[data-testid="wav-level-file"]').setInputFiles({name:"tone.wav",mimeType:"audio/wav",buffer:wav()});
  assert.match(await s.page.locator('[data-testid="wav-level-stats"]').innerText(),/-6\.02/);
  const result=JSON.parse((await download(s.page,'[data-testid="wav-level-json"]',"wav-levels.json")).toString("utf8"));
  assert.equal(result.sampleRate,8000);assert.equal(result.clippedSamples,0);
  assert.ok(result.rmsDbfs<-5.9&&result.rmsDbfs>-6.1);
  const csv=(await download(s.page,'[data-testid="wav-level-csv"]',"wav-windows.csv")).toString("utf8");
  assert.match(csv,/peak_dbfs/);
 }finally{await finish(s,"wav-levels.png");}
});
test("PPTX speaker-note UI extracts real notes and does not substitute slide body",{timeout:65000},async()=>{
 const s=await boot();try{
  await enter(s.page,"PPTX Presenter Notes Export");
  await s.page.locator('[data-testid="pptx-notes-file"]').setInputFiles({name:"talk.pptx",mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation",buffer:await deck()});
  assert.match(await s.page.locator('[data-testid="pptx-notes-summary"]').innerText(),/1 with speaker notes/);
  const notes=(await download(s.page,'[data-testid="pptx-notes-txt"]',"notes.txt")).toString("utf8");
  assert.match(notes,/Speaker says: 你好 & welcome/);assert.doesNotMatch(notes,/Slide visible content/);
  const json=JSON.parse((await download(s.page,'[data-testid="pptx-notes-json"]',"notes.json")).toString("utf8"));
  assert.equal(json.notes[0].hasNotes,true);
 }finally{await finish(s,"pptx-notes.png");}
});
