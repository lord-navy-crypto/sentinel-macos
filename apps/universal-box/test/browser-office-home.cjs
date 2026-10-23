"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
test("Office-first home leads directly to six existing working desks, without redundant routes",{timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  const shortcuts=page.locator('[data-testid="office-home-shortcuts"] button');
  assert.equal(await shortcuts.count(),6);
  assert.match(await page.locator('[data-testid="office-home-shortcuts"]').innerText(),/PDF 合并拆分/);
  const actions=[
   {id:"home-office-pdf",marker:"#pdf-picker"},
   {id:"home-office-image",marker:"#image-picker"},
   {id:"home-office-text",marker:"#quick-text-input"},
   {id:"home-office-rename",marker:"#rename-files"},
   {id:"home-office-ocr",text:"OCR"},
   {id:"home-office-word",text:"Mail Merge"},
  ];
  for(const a of actions){
   await page.getByRole("button",{name:"Sentinel Box Home"}).click();
   await page.locator('[data-testid="office-home-shortcuts"]').waitFor();
   await page.locator('[data-testid="'+a.id+'"]').click();
   if(a.marker)await page.locator(a.marker).waitFor();
   else assert.match(await page.locator("#main-content").innerText(),new RegExp(a.text,"i"));
  }
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
