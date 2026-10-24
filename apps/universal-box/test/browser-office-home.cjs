"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
test("Office-first homepage links ten existing working office tasks and keeps the sidebar deduplicated",{timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 async function home(){
  await page.getByRole("button",{name:"Sentinel Box Home"}).click();
  await page.locator('[data-testid="office-home-shortcuts"]').waitFor();
 }
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  const shortcuts=page.locator('[data-testid="office-first-task-grid"] button');
  const fast=page.locator('[data-testid="office-fast-actions"] button');
  assert.equal(await shortcuts.count(),6);
  assert.equal(await fast.count(),4);
  assert.match(await page.locator('[data-testid="office-home-shortcuts"]').innerText(),/PDF 合并/);
  const sidebarNames=await page.locator("nav.sidebar-nav button.nav-item").evaluateAll(items=>items.map(el=>el.getAttribute("aria-label")));
  assert.equal(sidebarNames.length,40,"All original workspace routes remain in sidebar exactly once");
  assert.equal(new Set(sidebarNames).size,sidebarNames.length,"No duplicate workspace labels");
  assert.equal(await page.getByTestId("home-file-dropzone").isVisible(),true,
   "Users can select or drop files directly into the existing, user-approved preflight");
  assert.equal(await page.getByTestId("home-favorites").isVisible(),true);
  assert.equal(await page.getByTestId("home-recents").isVisible(),true);
  const actions=[
   {id:"home-office-pdf",marker:"#pdf-picker"},
   {id:"home-office-image",marker:"#image-picker"},
   {id:"home-office-text",marker:"#quick-text-input"},
   {id:"home-office-rename",marker:"#rename-files"},
   {id:"home-office-ocr",text:"OCR"},
   {id:"home-office-word",marker:'[data-testid="creative-word-title"]'},
  ];
  for(const action of actions){
   await home();
   await page.locator('[data-testid="'+action.id+'"]').click();
   if(action.marker)await page.locator(action.marker).waitFor();
   else assert.match(await page.locator("#main-content").innerText(),new RegExp(action.text,"i"));
  }
  const direct=[
   {id:"home-fast-pdf-size",marker:"#mini-pdf-input"},
   {id:"home-fast-photo-kb",marker:'[data-testid="photo-files"]'},
   {id:"home-fast-slides",marker:'[data-testid="creative-slide-outline"]'},
   {id:"home-fast-zip",marker:"#zip-pack-files"},
  ];
  for(const task of direct){
   await home();
   await page.locator('[data-testid="'+task.id+'"]').click();
   await page.locator(task.marker).waitFor();
   if(task.id==="home-fast-pdf-size")assert.match(await page.locator('[aria-label="PDF mini editor modes"] .active-pill').innerText(),/Compress PDF/);
  }
  await home();
  assert.equal(await page.getByTestId("home-recent-exports").isVisible(),true);
  assert.equal(await page.locator(".hero-card").count(),0,
   "Old decorative hero no longer distracts from frequent office workflows");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
