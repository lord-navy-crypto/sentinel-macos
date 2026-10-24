"use strict";
/** Chromium smoke of actual Vite/React app (not native WKWebView).
 * UI catalog coverage != deep verification of every individual operation.
 */
const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const JSZip=require("jszip");
const {chromium}=require("playwright");

const ROOT=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const reportPath=path.join(__dirname,"browser-test-results");
fs.mkdirSync(reportPath,{recursive:true});
async function openApp(browser){
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 await page.goto(ROOT,{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator(".app-shell").waitFor({timeout:15000});
 return page;
}
async function allTools(page){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator(".catalog-card").first().waitFor();
}
test("Universal Box loads and every catalog entry routes to a mounted workspace", {timeout:180000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await allTools(page);
  const count=await page.locator(".catalog-open").count();
  assert.ok(count>=85,"unexpectedly short tool catalog: "+count);
  const checked=[];
  for(let i=0;i<count;i++){
   const name=(await page.locator(".catalog-open").nth(i).innerText()).split("\n")[0];
   await page.locator(".catalog-open").nth(i).click();
   await page.locator("#main-content").waitFor({state:"visible"});
   const text=(await page.locator("#main-content").innerText()).trim();
   assert.ok(text.length>35,"tool workspace blank: "+name);
   checked.push(name);
   await allTools(page);
  }
  fs.writeFileSync(path.join(reportPath,"navigation-smoke.json"),JSON.stringify({
   total:checked.length,checked,uncaughtErrors:errors,
   note:"Mount/navigation smoke; not full operation-level tests for each catalog item."
  },null,2));
  await page.screenshot({path:path.join(reportPath,"tool-catalog.png"),fullPage:true});
  assert.deepEqual(errors,[],"Some workspaces threw uncaught errors: "+errors.join(" | "));
  console.log("PASS: "+checked.length+" catalog entries route to rendered workspaces.");
 }finally{await page?.close();await browser.close();}
});
test("integrated Web Capture ZIP contains working original manifest and files", {timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  await page.locator('.sidebar button.nav-item[aria-label^="Web Capture"]').click();
  await page.locator('[data-testid="export-companion"]').waitFor();
  const download=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="export-companion"]').click();
  const object=await download;
  const zipFile=path.join(reportPath,"UniversalBox-WebCapture-browser-export.zip");
  await object.saveAs(zipFile);
  const archive=await JSZip.loadAsync(fs.readFileSync(zipFile));
  assert.deepEqual(Object.keys(archive.files).sort(),["manifest.json","popup.html","popup.js"].sort());
  const manifest=JSON.parse(await archive.file("manifest.json").async("string"));
  assert.equal(manifest.version,"0.3.1");
  assert.deepEqual(manifest.permissions,["activeTab","scripting","clipboardWrite"]);
  assert.equal(manifest.background,undefined);
  assert.equal(manifest.host_permissions,undefined);
  await page.screenshot({path:path.join(reportPath,"web-capture-companion.png"),fullPage:true});
 }finally{await page?.close();await browser.close();}
});
test("CSV cleanup removes duplicate/blank rows, requires user approval and exports safe CSV", {timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 let page;
 try{
  page=await openApp(browser);
  await page.locator('.sidebar button.nav-item[aria-label^="Web Capture"]').click();
  const source=page.locator('[data-testid="csv-source"]');
  await source.fill("Name,Score\n Ada , =1+1\n Ada , =1+1\n,\n");
  const text=await page.locator(".ub-companion-metrics").innerText();
  assert.match(text,/3\s*数据行/);
  assert.match(text,/1\s*重复行/);
  assert.match(text,/1\s*空行/);
  const result=page.locator('[data-testid="csv-preview"]');
  assert.match(await result.innerText(),/"Ada","'=1\+1"/);
  const btn=page.locator('[data-testid="save-cleaned"]');
  assert.equal(await btn.isDisabled(),true);
  await page.locator(".ub-companion-confirm input").check();
  const download=page.waitForEvent("download",{timeout:15000});
  await btn.click();
  const file=await download;
  const target=path.join(reportPath,"csv-cleanroom-export.csv");
  await file.saveAs(target);
  const content=fs.readFileSync(target,"utf8");
  assert.match(content,/"Ada","'=1\+1"/);
  assert.doesNotMatch(content,/^\s*,\s*$/m);
  assert.equal((content.match(/"Ada"/g)||[]).length,1);
  await page.screenshot({path:path.join(reportPath,"csv-review.png"),fullPage:true});
 }finally{await page?.close();await browser.close();}
});

test("File Intake lets users exclude mistaken source files before SHA-256 scan without deleting anything",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await allTools(page);
  await page.locator("#all-tools-search").fill("File Intake");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  const target=page.locator('input[aria-label="选择文件进行本地格式与哈希检查"]');
  const pdf=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  await target.setInputFiles([
   {name:"报告.pdf",mimeType:"application/pdf",buffer:pdf},
   {name:"报告.pdf",mimeType:"application/pdf",buffer:Buffer.from(pdf)},
   {name:"图表.png",mimeType:"image/png",buffer:png}
  ]);
  const stage=page.locator('[data-testid="intake-staged-list"]');
  await stage.waitFor();
  assert.equal(await stage.locator('[data-testid="intake-staged-row"]').count(),3);
  assert.match(await page.locator('[aria-label="Scan review"]').innerText(),/3 个文件/);
  assert.match(await page.locator('[aria-label="Scan review"]').innerText(),/同名文件/);
  await page.getByRole("button",{name:"从本次扫描排除第 2 个文件：报告.pdf"}).click();
  assert.equal(await stage.locator('[data-testid="intake-staged-row"]').count(),2);
  const review=await page.locator('[aria-label="Scan review"]').innerText();
  assert.match(review,/2 个文件/);
  assert.doesNotMatch(review,/同名文件/);
  assert.match(await page.locator('p[role="status"]').last().innerText(),/磁盘上的原文件没有改变/);
  await page.getByRole("button",{name:"开始本机扫描"}).click();
  await page.waitForFunction(()=>{
   const summary=document.querySelector('[aria-label="Inspection summary"]');
   return (summary?.textContent??"").includes("检查文件2");
  },null,{timeout:20000});
  const summary=await page.locator('[aria-label="Inspection summary"]').innerText();
  assert.match(summary,/检查文件\s*2/);
  const inspected=await page.locator('[aria-label="Inspected files"] [role="listitem"]').allInnerTexts();
  assert.equal(inspected.length,2);
  assert.ok(inspected.some(x=>x.includes("报告.pdf")));
  assert.ok(inspected.some(x=>x.includes("图表.png")));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(reportPath,"file-intake-exclusion.png"),fullPage:true});
 }finally{await page.close();await browser.close();}
});

test("Commons UI separates offline room, explicit LAN steps and opt-in public diagnosis",{timeout:85000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.locator('.sidebar button.nav-item[aria-label^="Universal Commons"]').click();
  const section=page.locator('section[aria-label="Universal Commons offline teams"]');
  await section.waitFor();
  assert.equal(await page.locator('[data-testid="commons-lan-workflow"]').count(),1);
  assert.equal(await page.locator('[data-testid="commons-public-research"]').count(),0);
  assert.equal(await page.getByRole("group",{name:"LAN transfer direction"}).getByRole("button",{name:/接收/}).getAttribute("aria-pressed"),"true");
  assert.equal(await page.getByRole("button",{name:/刷新附近设备/}).isDisabled(),true,"Browser must not promise native Bonjour");
  assert.doesNotMatch(await section.innerText(),/自动通过 Bonjour\/mDNS 搜索/);
  const fullInvite=page.locator('input[aria-label="LAN invitation to receive"]');
  assert.equal(await fullInvite.getAttribute("type"),"password","Private invite must start masked");
  const receive=page.getByRole("button",{name:"接收并校验加密团队包"});
  assert.equal(await receive.isDisabled(),true);
  await fullInvite.fill("uboxlan://8.8.8.8:6000/"+"A".repeat(43));
  assert.equal(await receive.isDisabled(),true,"Must not receive from a public address");
  await fullInvite.fill("uboxlan://192.168.1.20:49152/"+"A".repeat(43));
  assert.equal(await receive.isDisabled(),true,"Browser must not offer native LAN receiving");
  await page.getByTestId("commons-show-invitation").check();
  assert.equal(await fullInvite.getAttribute("type"),"text","Reveal must be intentional");
  await page.getByTestId("commons-show-invitation").uncheck();
  assert.equal(await fullInvite.getAttribute("type"),"password");
  await page.getByRole("group",{name:"LAN transfer direction"}).getByRole("button",{name:/发送/}).click();
  assert.match(await section.innerText(),/先创建或导入一个团队空间/);
  await page.getByRole("group",{name:"Communication transport"}).getByRole("button",{name:/公网 · 直连实验/}).click();
  assert.equal(await page.locator('[data-testid="commons-lan-workflow"]').count(),0);
  assert.equal(await page.locator('[data-testid="commons-public-research"]').count(),1);
  assert.equal(await page.getByRole("button",{name:/STUN 映射对比/}).isDisabled(),true);
  assert.match(await page.locator('[data-testid="commons-public-research"]').innerText(),/不会开放公网 TCP 监听/);
  await page.getByRole("group",{name:"Communication transport"}).getByRole("button",{name:/局域网发送与接收/}).click();
  assert.equal(await page.locator('[data-testid="commons-lan-workflow"]').count(),1);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Commons LAN group chat has safe native-only Create and Join controls with distinct offline messages",{timeout:80000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.locator('.sidebar button.nav-item[aria-label^="Universal Commons"]').click();
  const panel=page.getByRole("region",{name:"Live LAN group chat"});
  await panel.waitFor();
  assert.equal(await panel.isVisible(),true);
  assert.match(await panel.innerText(),/不是持久化聊天记录/);
  assert.match(await panel.innerText(),/群聊主机/);
  const create=page.getByTestId("chat-create"),join=page.getByTestId("chat-join");
  assert.equal(await create.isDisabled(),true,"Browser preview cannot open native TCP chat host");
  assert.equal(await join.isDisabled(),true,"Browser preview cannot connect to native group chat");
  await page.getByTestId("chat-nickname").fill("同事 A");
  await page.getByTestId("chat-room-name").fill("项目会议");
  assert.equal(await create.isDisabled(),true);
  await page.getByTestId("chat-join-invite").fill("uboxchat://8.8.8.8:45678/"+"A".repeat(43));
  assert.equal(await join.isDisabled(),true,"A public-IP URL cannot be accepted as a LAN invite");
  await page.getByTestId("chat-join-invite").fill("uboxchat://192.168.1.33:45678/"+"A".repeat(43));
  assert.equal(await join.isDisabled(),true,"A syntactically valid invite must still need native execution");
  await page.getByRole("group",{name:"Communication transport"}).getByRole("button",{name:/公网 · 直连实验/}).click();
  assert.equal(await panel.isVisible(),false,"Group chat should be hidden on the separate public research screen");
  await page.getByRole("group",{name:"Communication transport"}).getByRole("button",{name:/局域网发送与接收/}).click();
  assert.equal(await panel.isVisible(),true);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Public Internet WebRTC direct UI requires deliberate signaling and explicit STUN consent",{timeout:75000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.locator('.sidebar button.nav-item[aria-label^="Universal Commons"]').click();
  await page.getByRole("group",{name:"Communication transport"}).getByRole("button",{name:/公网 · 直连实验/}).click();
  const direct=page.getByRole("region",{name:"Experimental internet direct chat"});
  await direct.waitFor();
  assert.equal(await direct.getByTestId("p2p-stun-opt-in").isChecked(),false,"No public STUN contact without opt-in");
  assert.match(await direct.innerText(),/没有 TURN 中继/);
  assert.equal(await direct.getByTestId("p2p-offer").isDisabled(),true);
  await direct.getByTestId("p2p-nickname").fill("测试用户");
  assert.equal(await direct.getByTestId("p2p-offer").isDisabled(),false);
  assert.equal(await direct.getByTestId("p2p-answer").isDisabled(),true);
  await direct.getByTestId("p2p-remote-description").fill("unsafe URL");
  assert.equal(await direct.getByTestId("p2p-answer").isDisabled(),false,"SDP parse errors should be shown on deliberate click");
  await direct.getByTestId("p2p-answer").click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="p2p-status"]')?.textContent?.includes("无法应答连接"));
  assert.match(await direct.getByTestId("p2p-status").innerText(),/Connection description size is invalid|完整 JSON/);
  assert.equal(await direct.getByTestId("p2p-local-description").count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});

test("Two actual browser WebRTC DataChannel peers exchange encrypted text without any STUN server",{timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await openApp(browser);
 try{
  const result=await page.evaluate(async()=>{
   if(typeof RTCPeerConnection==="undefined")throw Error("WebRTC unavailable in installed Chromium");
   const a=new RTCPeerConnection({iceServers:[]}),b=new RTCPeerConnection({iceServers:[]});
   try{
    const offered=a.createDataChannel("sentinel-p2p-text");
    let receivedChannel;
    const incoming=new Promise(resolve=>{
     b.ondatachannel=evt=>{
      receivedChannel=evt.channel;
      evt.channel.onmessage=message=>resolve(message.data);
     };
    });
    const gathered=peer=>new Promise((resolve,reject)=>{
     if(peer.iceGatheringState==="complete"){resolve();return;}
     const timer=setTimeout(()=>reject(Error("ICE gathering timeout")),18000);
     peer.addEventListener("icegatheringstatechange",()=>{
      if(peer.iceGatheringState==="complete"){clearTimeout(timer);resolve();}
     });
    });
    await a.setLocalDescription(await a.createOffer());
    await gathered(a);
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());
    await gathered(b);
    await a.setRemoteDescription(b.localDescription);
    if(offered.readyState!=="open")await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error("Direct WebRTC connection timeout")),18000);
     offered.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
    });
    offered.send("公网消息协议测试 · WebRTC DTLS");
    const text=await Promise.race([
     incoming,new Promise((_,reject)=>setTimeout(()=>reject(Error("DataChannel delivery timeout")),18000))
    ]);
    return {text,connection:a.connectionState,remote:receivedChannel.readyState};
   }finally{a.close();b.close();}
  });
  assert.equal(result.text,"公网消息协议测试 · WebRTC DTLS");
  assert.equal(result.connection,"connected");
  assert.equal(result.remote,"open");
 }finally{await page.close();await browser.close();}
});
