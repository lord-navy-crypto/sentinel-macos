"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";

test("Local-only reader: refuse remote voice; speak, pause, resume and stop with explicit user action",{
 timeout:80000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>{
   const events=new EventTarget();
   const voiceState=[
    {name:"Cloud voice",lang:"en-US",voiceURI:"cloud",localService:false},
    {name:"Local English",lang:"en-US",voiceURI:"local-en",localService:true},
   ];
   window.__voiceState=voiceState;window.__spoken=[];
   window.__speechState={pause:0,resume:0,cancel:0};
   const synth={
    getVoices:()=>voiceState,
    speak:utterance=>{window.__spoken.push({text:utterance.text,rate:utterance.rate,voice:utterance.voice.voiceURI});},
    cancel:()=>{window.__speechState.cancel++;},
    pause:()=>{window.__speechState.pause++;},
    resume:()=>{window.__speechState.resume++;},
    addEventListener:(...args)=>events.addEventListener(...args),
    removeEventListener:(...args)=>events.removeEventListener(...args),
   };
   Object.defineProperty(window,"speechSynthesis",{configurable:true,value:synth});
   Object.defineProperty(window,"SpeechSynthesisUtterance",{configurable:true,
    value:class SpeechSynthesisUtterance{constructor(text){this.text=text;this.rate=1;}}});
   window.__fireVoicesChanged=()=>events.dispatchEvent(new Event("voiceschanged"));
  });
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Offline Text to Speech");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="local-text-reader"]').waitFor();
  assert.match(await page.locator('[data-testid="reader-local-voices"]').innerText(),/1 个/);
  assert.equal(await page.locator('[data-testid="reader-voice"] option').count(),1);
  assert.match(await page.locator('[data-testid="reader-voice"]').innerText(),/Local English/);
  await page.locator('[data-testid="reader-text"]').fill("  This is my own local reading text.  ");
  await page.locator('[data-testid="reader-rate"]').fill("1.2");
  await page.locator('[data-testid="reader-start"]').click();
  assert.deepEqual(await page.evaluate(()=>window.__spoken),[
   {text:"This is my own local reading text.",rate:1.2,voice:"local-en"},
  ]);
  assert.equal(await page.locator('[data-testid="reader-start"]').isDisabled(),true);
  await page.locator('[data-testid="reader-pause"]').click();
  assert.equal(await page.locator('[data-testid="reader-pause"]').innerText(),"继续");
  await page.locator('[data-testid="reader-pause"]').click();
  assert.equal(await page.locator('[data-testid="reader-pause"]').innerText(),"暂停");
  const state=await page.evaluate(()=>window.__speechState);
  assert.equal(state.pause,1);assert.equal(state.resume,1);
  await page.locator('[data-testid="reader-stop"]').click();
  assert.equal(await page.locator('[data-testid="reader-start"]').isDisabled(),false);

  await page.evaluate(()=>{
   window.__voiceState.splice(0,window.__voiceState.length,
    {name:"Remote only",lang:"en-US",voiceURI:"remote-only",localService:false});
   window.__fireVoicesChanged();
  });
  await page.locator('[data-testid="reader-local-voices"]').filter({hasText:"0 个"}).waitFor();
  assert.equal(await page.locator('[data-testid="reader-start"]').isDisabled(),true);
  assert.equal((await page.evaluate(()=>window.__spoken)).length,1,
   "No remote-voice fallback may be triggered");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Reader TXT import rejects broken encodings and keeps earlier text, without starting speech",{
 timeout:80000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Offline Text to Speech");
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="local-text-reader"]').waitFor();
  const source="你好，世界。\nA second line.";
  await page.locator('[data-testid="reader-text-file"]').setInputFiles({
   name:"study.txt",mimeType:"text/plain",buffer:Buffer.from(source)
  });
  await page.getByRole("status").filter({hasText:"尚未开始朗读"}).waitFor();
  assert.equal(await page.locator('[data-testid="reader-text"]').inputValue(),source);
  await page.locator('[data-testid="reader-text-file"]').setInputFiles({
   name:"legacy.txt",mimeType:"text/plain",buffer:Buffer.from([0xff,0xfe,0x00])
  });
  await page.getByRole("status").filter({hasText:"当前输入仍保留"}).waitFor();
  assert.equal(await page.locator('[data-testid="reader-text"]').inputValue(),source);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
