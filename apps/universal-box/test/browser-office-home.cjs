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
  assert.equal(sidebarNames.length,47,"All 40 original workspaces plus six Sentinel modules and Better Terminal remain accessible exactly once");
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


test("Original Sentinel Go service is represented by six real modular workbenches while retaining a full legacy WebView button",{timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  const views=[
   ["Sentinel · 系统概览与扫描","系统概览"],
   ["Sentinel · 证据调查","证据调查"],
   ["Sentinel · 历史与变化比较","变化和信任"],
   ["Sentinel · 进程与网络","Mac 系统与网络"],
   ["Sentinel · 诊断与安全操作","安全操作与恢复"],
   ["Sentinel · 权限与运行状态","权限、运行状态与 AI"],
  ];
  for(const [nav,heading] of views){
   await page.locator("nav.sidebar-nav").getByRole("button",{name:nav,exact:true}).click();
   await page.getByRole("region",{name:"Sentinel Mac System Center"}).waitFor();
   assert.match(await page.locator("#main-content").innerText(),new RegExp(heading));
   assert.equal(await page.getByRole("button",{name:"打开完整 Sentinel 工作台",exact:true}).count(),1);
   assert.equal(await page.getByRole("button",{name:"启动内置 Sentinel Go 服务"}).count(),1);
   assert.equal(await page.getByRole("button",{name:"打开完整 Sentinel 工作台",exact:true}).isDisabled(),true,
    "Original system functions must not pretend to work in browser-only preview without the bundled Go engine");
  }
  await page.locator("nav.sidebar-nav").getByRole("button",{name:/All tools/}).click();
  await page.locator("#all-tools-search").fill("Sentinel");
  assert.ok(await page.locator(".catalog-open").count()>=13,"migrated native functions must be individually searchable");
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});


test("All original Go read surfaces are searchable and deep-link to real opt-in requests",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator("nav.sidebar-nav").getByRole("button",{name:/All tools/}).click();
  await page.locator("#all-tools-search").fill("Sentinel");
  assert.ok(await page.locator(".catalog-open").count()>=44,"13 prior and 31 newly surfaced Go tool cards must be visible");
  await page.locator("#all-tools-search").fill("高级证据关联图 v2");
  await page.locator(".catalog-open").first().click();
  await page.getByRole("region",{name:"Sentinel Mac System Center"}).waitFor();
  assert.match(await page.locator("#main-content").innerText(),/高级证据关联图 v2/);
  assert.equal(await page.getByRole("button",{name:"读取这项真实数据"}).isDisabled(),true,
   "Browser without authorized local Go engine must never fabricate results");
  assert.equal(await page.getByTestId("sentinel-legacy-complete-directory").isVisible(),true);
  assert.equal(await page.getByTestId("sentinel-advanced-entry").count(),50,
   "Every remaining original Go API endpoint must appear in the feature inventory");
  await page.getByTestId("sentinel-advanced-filter").fill("隔离");
  assert.ok(await page.getByTestId("sentinel-advanced-entry").count()>=1);
  await page.getByTestId("sentinel-advanced-filter").fill("");

  assert.equal(await page.getByTestId("sentinel-legacy-complete-directory").getByRole("button",{name:"在原 Sentinel 工作台中操作 ↗"}).count(),4);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Better Terminal is navigable and Homebrew UI cannot run in browser-only preview",{timeout:70000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1180,height:780}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.getByTestId("home-better-terminal").click();
  await page.getByTestId("better-terminal-desk").waitFor();
  assert.equal(await page.getByTestId("terminal-start").isDisabled(),true);
  assert.equal(await page.getByTestId("terminal-send").isDisabled(),true);
  assert.equal(await page.getByTestId("terminal-screen").isVisible(),true,
    "real xterm renderer should be mounted even in browser preview");
  assert.equal(await page.getByTestId("terminal-fit").isVisible(),true);
  await page.getByTestId("terminal-fit").click();
  assert.ok(await page.locator(".terminal-screen-mount .xterm").count()>=1,
    "xterm should render an interactive ANSI/VT viewport");
  await page.getByTestId("better-terminal-tab-brew").click();
  assert.equal(await page.getByTestId("terminal-brew-manager").isVisible(),true);
  await page.getByTestId("brew-software-center").waitFor();
  assert.equal(await page.getByTestId("brew-search").count(),0,"Browser preview must not expose native Homebrew execution");
  assert.equal(await page.getByTestId("brew-install-package").count(),0,"Browser preview must not pretend to install software");
  assert.equal(await page.getByText(/网页预览不能操作本机软件/).isVisible(),true);
  await page.locator("nav.sidebar-nav").getByRole("button",{name:/All tools/}).click();
  await page.locator("#all-tools-search").fill("Better Terminal");
  assert.ok(await page.locator(".catalog-open").count()>=2);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
