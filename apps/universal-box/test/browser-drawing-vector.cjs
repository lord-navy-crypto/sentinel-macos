"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","drawing-vector");
fs.mkdirSync(dir,{recursive:true});
async function download(page,button,name){
 const pending=page.waitForEvent("download",{timeout:30000});
 await button.click();
 const result=await pending;
 assert.equal(result.suggestedFilename(),name);
 const fp=path.join(dir,name);await result.saveAs(fp);
 return fs.readFileSync(fp);
}
test("Drawing creates real line and rectangle strokes, undoes/redoes and downloads genuine SVG/PNG",{timeout:75000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Black Draft Board");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  const canvas=page.getByLabel("Black drawing canvas");await canvas.waitFor();
  const bounds=await canvas.boundingBox();assert.ok(bounds);
  async function stroke(from,to){
   await page.mouse.move(bounds.x+bounds.width*from[0],bounds.y+bounds.height*from[1]);
   await page.mouse.down();
   await page.mouse.move(bounds.x+bounds.width*to[0],bounds.y+bounds.height*to[1],{steps:5});
   await page.mouse.up();
  }
  await page.locator('[data-testid="drawing-tool"]').selectOption("line");
  await stroke([0.12,0.20],[0.85,0.70]);
  assert.match(await page.locator("p.subtle").filter({hasText:"saved stroke(s)"}).innerText(),/1 saved/);
  await page.locator('[data-testid="drawing-tool"]').selectOption("rectangle");
  await stroke([0.20,0.15],[0.75,0.80]);
  assert.match(await page.locator("p.subtle").filter({hasText:"saved stroke(s)"}).innerText(),/2 saved/);
  await page.locator('[data-testid="drawing-undo"]').click();
  assert.match(await page.locator("p.subtle").filter({hasText:"saved stroke(s)"}).innerText(),/1 saved/);
  assert.equal(await page.locator('[data-testid="drawing-redo"]').isEnabled(),true);
  await page.locator('[data-testid="drawing-redo"]').click();
  assert.match(await page.locator("p.subtle").filter({hasText:"saved stroke(s)"}).innerText(),/2 saved/);
  const svg=(await download(page,page.locator('[data-testid="drawing-save-svg"]'),"daily-desk-drawing.svg")).toString("utf8");
  assert.match(svg,/viewBox="0 0 1100 600"/);
  assert.equal((svg.match(/<polyline /g)||[]).length,2);
  assert.doesNotMatch(svg,/<script|<foreignObject/);
  const png=await download(page,page.getByRole("button",{name:"Save PNG"}),"daily-desk-drawing.png");
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(await page.locator('[data-testid="drawing-copy-png"]').count(),1);
  await page.screenshot({path:path.join(dir,"vector-board.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
