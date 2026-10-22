"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","speech-portable");fs.mkdirSync(dir,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 await page.context().grantPermissions(["microphone"],{origin:new URL(base).origin});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function openTool(page,name){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(name);
 const button=page.locator(".catalog-open");assert.equal(await button.count(),1,"Expected one catalog match "+name);
 await button.click();await page.locator('[data-testid="speech-portable-panel"]').waitFor();
}
async function download(page,selector,name){
 const pending=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();const file=await pending;
 const target=path.join(dir,name);await file.saveAs(target);
 const bytes=fs.readFileSync(target);assert.ok(bytes.length>60);
 return bytes;
}
async function done(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
function makeWav(){
 const frames=8000,buf=Buffer.alloc(44+frames*2);
 for(const [i,t]of [[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]])buf.write(t,i);
 buf.writeUInt32LE(buf.length-8,4);buf.writeUInt32LE(16,16);
 buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(8000,24);
 buf.writeUInt32LE(16000,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)buf.writeInt16LE(Math.round(6000*Math.sin(i*Math.PI*2*350/8000)),44+i*2);
 return buf;
}
test("actual WAV file import -> browser audio resampling -> usable PCM16 WAV export, no fake transcript",{timeout:65000},async()=>{
 const s=await open();try{
  await openTool(s.page,"Local Speech to Text");
  await s.page.locator('[data-testid="speech-native-only"]').waitFor();
  await s.page.locator('[data-testid="speech-audio-file"]').setInputFiles({
   name:"recorded-8k.wav",mimeType:"audio/wav",buffer:makeWav()});
  await s.page.locator('[data-testid="speech-audio-ready"]').waitFor({timeout:15000});
  assert.equal(await s.page.locator('[data-testid="speech-transcribe"]').isDisabled(),true);
  assert.equal(await s.page.locator('[data-testid="speech-transcript"]').count(),0);
  const wav=await download(s.page,'[data-testid="speech-save-wav"]',"normalized-16khz.wav");
  assert.equal(wav.toString("ascii",0,4),"RIFF");
  assert.equal(wav.readUInt32LE(24),16000);
  assert.equal(wav.readUInt16LE(22),1);
  assert.equal(wav.readUInt16LE(34),16);
  assert.ok(Math.abs((wav.length-44)/2-16000)<20);
 }finally{await done(s,"audio-import.png");}
});
test("fake-permission browser microphone really records and exports valid WAV, without speech cloud API",{timeout:75000},async()=>{
 const s=await open();try{
  await openTool(s.page,"Local Speech to Text");
  await s.page.locator('[data-testid="speech-record-start"]').click();
  await s.page.locator('[data-testid="speech-recording-active"]').waitFor({timeout:12000});
  await s.page.waitForTimeout(1300);
  await s.page.locator('[data-testid="speech-record-stop"]').click();
  await s.page.locator('[data-testid="speech-audio-ready"]').waitFor({timeout:17000});
  const wav=await download(s.page,'[data-testid="speech-save-wav"]',"recorded-microphone.wav");
  assert.equal(wav.toString("ascii",0,4),"RIFF");
  assert.equal(wav.readUInt32LE(24),16000);
  assert.ok(wav.readUInt32LE(40)>2000);
 }finally{await done(s,"microphone-recorded.png");}
});
test("real screenshot-like PNG is recompressed into independently decodable JPEG with actual byte report",{timeout:65000},async()=>{
 const s=await open();try{
  await openTool(s.page,"Target Size Photo Compression");
  const png=await s.page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=800;c.height=550;
   const g=c.getContext("2d");
   for(let y=0;y<550;y+=5)for(let x=0;x<800;x+=5){
    g.fillStyle="rgb("+((x*13+y*7)%256)+","+((x*5+y*11)%256)+","+((x*3+y*23)%256)+")";
    g.fillRect(x,y,5,5);
   }
   return c.toDataURL("image/png").split(",")[1];
  });
  await s.page.locator('[data-testid="photo-files"]').setInputFiles({
   name:"large-image.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await s.page.locator('[data-testid="photo-max-size"]').selectOption("512");
  await s.page.locator('[data-testid="photo-target-kb"]').fill("80");
  // One picture now downloads as an actual JPEG; batch photo tests still verify ZIP manifests.
  const jpeg=await download(s.page,'[data-testid="photo-save"]',"compressed-single-photo.jpg");
  assert.deepEqual([...jpeg.subarray(0,3)],[255,216,255]);
  assert.deepEqual([...jpeg.subarray(-2)],[255,217]);
  const report=await s.page.locator('[data-testid="photo-report"]').innerText();
  assert.ok(report.includes(jpeg.length.toLocaleString("en-US")),"Actual JPEG byte count must appear in the report");
  const dimension=await s.page.evaluate(async raw=>{
   const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src="data:image/jpeg;base64,"+raw;});
   return [img.naturalWidth,img.naturalHeight];
  },Buffer.from(jpeg).toString("base64"));
  assert.ok(dimension[0]<=512&&dimension[1]<=512);
  assert.equal(await s.page.locator('[data-testid="photo-report"]').count(),1);
 }finally{await done(s,"photo-target.png");}
});
test("Windows UTF16LE BOM text becomes UTF8 BOM LF portable file with Chinese and correct ZIP report",{timeout:65000},async()=>{
 const s=await open();try{
  await openTool(s.page,"Windows ↔ macOS Text Encoding");
  const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from("Hello\r\n你好\r\n","utf16le")]);
  await s.page.locator('[data-testid="portable-files"]').setInputFiles({
   name:"windows.txt",mimeType:"text/plain",buffer:utf16});
  await s.page.locator('[data-testid="portable-target"]').selectOption("utf-8-bom");
  await s.page.locator('[data-testid="portable-lines"]').selectOption("lf");
  const zip=await JSZip.loadAsync(await download(s.page,'[data-testid="portable-save"]',"windows-mac-text.zip"),{checkCRC32:true});
  const converted=await zip.file("converted/001-windows.txt").async("uint8array");
  assert.deepEqual([...converted.slice(0,3)],[239,187,191]);
  assert.equal(Buffer.from(converted).toString("utf8").replace(/^\uFEFF/,""),"Hello\n你好\n");
  const meta=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(meta.files[0].encoding,"utf-16le");
  assert.equal(await s.page.locator('[data-testid="portable-report"]').count(),1);
 }finally{await done(s,"cross-os-encoding.png");}
});