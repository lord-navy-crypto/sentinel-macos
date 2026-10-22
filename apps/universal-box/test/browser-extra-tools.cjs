"use strict";
/** Playwright operation-level regression for offline Office import, diagrams and video frame extraction. */
const {test}=require("node:test"),assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
const {chromium}=require("playwright"),JSZip=require("jszip");
const ROOT=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","extra-tools");
fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(ROOT,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function navigate(page,name){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(name);
 const hit=page.locator(".catalog-open");
 assert.equal(await hit.count(),1,"Unexpected tool match count for "+name);
 await hit.click();
}
async function download(page,selector,fileName){
 const pending=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();const file=await pending;
 const target=path.join(dir,fileName);await file.saveAs(target);
 return fs.readFileSync(target);
}
async function close(s,screenshot){
 try{await s.page.screenshot({path:path.join(dir,screenshot),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
test("real DOCX: browser creates → imports → extracts TXT without cloud",{timeout:75000},async()=>{
 const s=await setup();
 try{
  await navigate(s.page,"Word DOCX Templates");
  await s.page.locator('[data-testid="creative-word-title"]').fill("Reusable Letter");
  const doc=await download(s.page,'[data-testid="creative-word-export"]',"create-word.docx");
  await navigate(s.page,"Word DOCX Inspector");
  await s.page.locator('[data-testid="extra-office-file"]').setInputFiles({
   name:"letter.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:doc
  });
  await s.page.locator('[data-testid="extra-office-report"]').waitFor();
  assert.match(await s.page.locator('[data-testid="extra-office-report"]').innerText(),/Reusable Letter/);
  const text=(await download(s.page,'[data-testid="extra-office-text"]',"roundtrip-word.txt")).toString("utf8");
  assert.match(text,/Reusable Letter/);assert.match(text,/李同学/);
 }finally{await close(s,"office-word.png");}
});
test("real PPTX: create deck → reopen → slide-by-slide text export",{timeout:75000},async()=>{
 const s=await setup();
 try{
  await navigate(s.page,"PowerPoint PPTX Creator");
  await s.page.locator('[data-testid="creative-slide-title"]').fill("Real Presentation");
  await s.page.locator('[data-testid="creative-slide-outline"]').fill("## Research\n- First idea\n## Development\n- Next idea");
  const deck=await download(s.page,'[data-testid="creative-pptx-export"]',"create-deck.pptx");
  await navigate(s.page,"PowerPoint PPTX Reader");
  await s.page.locator('[data-testid="extra-office-file"]').setInputFiles({
   name:"project.pptx",mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation",buffer:deck
  });
  await s.page.locator('[data-testid="extra-office-report"]').waitFor();
  const view=await s.page.locator('[data-testid="extra-office-report"]').innerText();
  assert.match(view,/3 段\/页/);
  assert.match(view,/Research/);
  const text=(await download(s.page,'[data-testid="extra-office-text"]',"roundtrip-deck.txt")).toString("utf8");
  assert.match(text,/# Slide 1/);assert.match(text,/First idea/);assert.match(text,/Next idea/);
 }finally{await close(s,"office-ppt.png");}
});
test("real mind map and milestone timeline SVG exports",{timeout:75000},async()=>{
 const s=await setup();
 try{
  await navigate(s.page,"Mind Map Generator");
  await s.page.locator('[data-testid="extra-diagram-title"]').fill("Project & Steps");
  await s.page.locator('[data-testid="extra-diagram-items"]').fill("Explore | Find needs\nDesign | Create\nReview | Refine");
  let svg=(await download(s.page,'[data-testid="extra-diagram-export"]',"mind-map.svg")).toString("utf8");
  assert.match(svg,/Project &amp; Steps/);
  assert.match(svg,/<path d="M /);
  await s.page.locator('[data-testid="extra-diagram-kind"]').selectOption("timeline");
  svg=(await download(s.page,'[data-testid="extra-diagram-export"]',"timeline.svg")).toString("utf8");
  assert.match(svg,/M 190 175 V/);
  assert.match(svg,/Explore/);
 }finally{await close(s,"mindmap.png");}
});
test("real video WebM upload and extracted PNG frame in Chromium",{timeout:90000},async()=>{
 const s=await setup();
 try{
  const videoData=await s.page.evaluate(async()=>{
   const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;
   const ctx=canvas.getContext("2d");ctx.fillStyle="#4c81ae";ctx.fillRect(0,0,320,180);
   const stream=canvas.captureStream(12);
   if(!("MediaRecorder" in window)||!MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
    return null;
   const recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});
   const chunks=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   const done=new Promise(resolve=>recorder.onstop=resolve);
   recorder.start();await new Promise(r=>setTimeout(r,1050));
   recorder.stop();await done;stream.getTracks().forEach(x=>x.stop());
   return [...new Uint8Array(await new Blob(chunks,{type:"video/webm"}).arrayBuffer())];
  });
  // CI supports VP8 in Chromium; if a browser build lacks it we do not falsely claim coverage.
  assert.ok(videoData&&videoData.length>100,"Chromium build lacks VP8 MediaRecorder");
  await navigate(s.page,"Video Frame Extractor");
  await s.page.locator('[data-testid="extra-video-file"]').setInputFiles({
   name:"generated.webm",mimeType:"video/webm",buffer:Buffer.from(videoData)
  });
  await s.page.locator('[data-testid="extra-video-frame"]').waitFor({state:"visible"});
  await s.page.locator('[data-testid="extra-video-frame"]').evaluate(el=>new Promise((resolve,reject)=>{
   const started=Date.now();const loop=()=>{if(!el.disabled)resolve();else if(Date.now()-started>12000)reject(Error("video metadata not decoded"));else setTimeout(loop,100);};loop();
  }));
  const png=await download(s.page,'[data-testid="extra-video-frame"]',"actual-video-frame.png");
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.ok(png.length>200);
 }finally{await close(s,"video-frame.png");}
});


test("Batch rename: safe extension preview, validation before export and exact ZIP contents",{
 timeout:75000,
},async()=>{
 const s=await setup();
 try{
  await navigate(s.page,"Batch Rename Copies");
  const first=Buffer.from("notes alpha","utf8"),second=Buffer.from("picture beta","utf8");
  await s.page.locator("#rename-files").setInputFiles([
   {name:"draft.txt",mimeType:"text/plain",buffer:first},
   {name:"a".repeat(180)+".JPG",mimeType:"image/jpeg",buffer:second},
  ]);
  await s.page.locator('[data-testid="rename-plan-status"]').waitFor();
  await s.page.getByLabel("Find text").fill("draft");
  await s.page.getByLabel("Replace").fill("final");
  assert.equal(await s.page.locator('[data-testid="rename-preview"] .task-row').count(),2);
  let preview=await s.page.locator('[data-testid="rename-preview"]').innerText();
  assert.match(preview,/study-final-01\.txt/);
  assert.match(preview,/-02\.JPG/);

  // Deliberately invalid naming rule must block download before reading file bytes.
  await s.page.getByLabel("Prefix").fill("x".repeat(101));
  await s.page.locator('[data-testid="rename-plan-error"]').waitFor();
  assert.equal(await s.page.getByRole("button",{name:"Save all renamed copies as ZIP"}).isDisabled(),true);
  await s.page.getByLabel("Prefix").fill("daily-");
  assert.equal(await s.page.locator('[data-testid="rename-plan-error"]').count(),0);
  preview=await s.page.locator('[data-testid="rename-preview"]').innerText();
  assert.match(preview,/daily-final-01\.txt/);
  assert.match(preview,/-02\.JPG/);
  const mapCsv=(await download(s.page,'[data-testid="rename-export-map"]',"rename-map.csv")).toString("utf8");
  assert.match(mapCsv,/index,original_name,new_name,size_bytes/);
  assert.match(mapCsv,/draft.txt/);
  assert.match(mapCsv,/daily-final-01.txt/);
  const archive=await JSZip.loadAsync(await download(s.page,
   'button:has-text("Save all renamed copies as ZIP")',"renamed-preflight.zip"),{checkCRC32:true});
  const names=Object.keys(archive.files).filter(name=>!archive.files[name].dir&&!name.startsWith("reports/"));
  assert.equal(names.length,2);
  const embedded=await archive.file("reports/rename-map.csv").async("string");
  assert.equal(embedded,mapCsv,"ZIP mapping must match explicitly downloaded CSV");
  const provenance=JSON.parse(await archive.file("reports/rename-manifest.json").async("string"));
  assert.deepEqual(provenance.files.map(x=>x.originalName),["draft.txt","a".repeat(180)+".JPG"]);
  assert.deepEqual(provenance.files.map(x=>x.newName),names);
  assert.ok(names.includes("daily-final-01.txt"));
  assert.ok(names.some(name=>name.endsWith("-02.JPG")&&name.length<=130));
  assert.deepEqual(Buffer.from(await archive.file("daily-final-01.txt").async("uint8array")),first);
  const jpgName=names.find(name=>name.endsWith("-02.JPG"));
  assert.deepEqual(Buffer.from(await archive.file(jpgName).async("uint8array")),second);
 }finally{await close(s,"safe-rename-preview.png");}
});
