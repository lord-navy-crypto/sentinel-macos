"use strict";
/** Real Chromium workflow tests: A4 layout, native .ts output, flattened screenshot redaction. */
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const URL_BASE=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","daily-expansion");fs.mkdirSync(dir,{recursive:true});
async function open(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(URL_BASE,{waitUntil:"domcontentloaded"});
 await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function tool(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const entry=page.locator(".catalog-open");
 assert.equal(await entry.count(),1,"Could not uniquely locate "+query);
 await entry.click();
}
async function save(page,selector,file){
 const promise=page.waitForEvent("download",{timeout:30000});
 await page.locator(selector).click();const download=await promise;
 const destination=path.join(dir,file);await download.saveAs(destination);
 const bytes=fs.readFileSync(destination);assert.ok(bytes.length>90);
 return bytes;
}
async function finish(ctx,file){
 try{await ctx.page.screenshot({path:path.join(dir,file),fullPage:true});assert.deepEqual(ctx.errors,[]);}
 finally{await ctx.page.close();await ctx.browser.close();}
}
test("A4 printable card, label and ticket templates actually export SVG",{timeout:60000},async()=>{
 const ctx=await open();
 try{
  await tool(ctx.page,"Printable Study Cards A4");
  await ctx.page.locator('[data-testid="utility-print-title"]').fill("Science & Teamwork");
  await ctx.page.locator('[data-testid="utility-print-items"]').fill("Research\nDesign <safe>\nDeliver");
  let svg=(await save(ctx.page,'[data-testid="utility-print-export"]',"real-a4-cards.svg")).toString("utf8");
  assert.match(svg,/width="210mm" height="297mm"/);
  assert.match(svg,/Science &amp; Teamwork/);
  assert.match(svg,/Design &lt;safe&gt;/);
  assert.equal((svg.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="/g)||[]).length,8);
  await ctx.page.locator('[data-testid="utility-print-format"]').selectOption("labels");
  svg=(await save(ctx.page,'[data-testid="utility-print-export"]',"real-a4-labels.svg")).toString("utf8");
  assert.equal((svg.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="/g)||[]).length,24);
  await ctx.page.locator('[data-testid="utility-print-format"]').selectOption("tickets");
  svg=(await save(ctx.page,'[data-testid="utility-print-export"]',"real-a4-tickets.svg")).toString("utf8");
  assert.equal((svg.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" rx="/g)||[]).length,10);
 }finally{await finish(ctx,"print-ui.png");}
});
test("JSON to TypeScript and TSV exports preserve real paths and optional fields",{timeout:60000},async()=>{
 const ctx=await open();
 try{
  await tool(ctx.page,"JSON to TypeScript Types");
  await ctx.page.locator('[data-testid="utility-json-source"]').fill('{"team":[{"name":"Ada","role":"design"},{"name":"Lin"}],"ok":true}');
  const ts=(await save(ctx.page,'[data-testid="utility-json-export-ts"]',"types.ts")).toString("utf8");
  assert.match(ts,/export type Root =/);
  assert.match(ts,/role\?: string/);
  assert.match(ts,/ok: boolean/);
  const tsv=(await save(ctx.page,'[data-testid="utility-json-export-tsv"]',"paths.tsv")).toString("utf8");
  assert.match(tsv,/path\ttype/);
  assert.match(tsv,/\$\.team\[0\]\.name\tstring/);
 }finally{await finish(ctx,"json-ui.png");}
});
test("opaque screenshot blackout writes changed pixels into real output PNG",{timeout:60000},async()=>{
 const ctx=await open();
 try{
  const image=await ctx.page.evaluate(()=>{
   const c=document.createElement("canvas");c.width=200;c.height=120;
   const g=c.getContext("2d");g.fillStyle="#46a3ef";g.fillRect(0,0,200,120);
   return c.toDataURL("image/png").split(",")[1];
  });
  await tool(ctx.page,"Screenshot & Image Markup");
  await ctx.page.locator('[data-testid="utility-image-upload"]').setInputFiles({
   name:"source.png",mimeType:"image/png",buffer:Buffer.from(image,"base64")
  });
  await ctx.page.locator('[data-testid="annotation-export"]').waitFor({state:"visible"});
  await ctx.page.locator('[data-testid="annotation-export"]').evaluate(el=>new Promise((resolve,reject)=>{
   const began=Date.now();const check=()=>{
    if(!el.disabled)resolve();
    else if(Date.now()-began>7000)reject(Error("Input image never decoded"));
    else setTimeout(check,70);
   };check();
  }));
  await ctx.page.locator('[data-testid="annotation-tool"]').selectOption("redact");
  const canvas=ctx.page.locator('[data-testid="annotation-canvas"]');
  await canvas.scrollIntoViewIfNeeded();
  const b=await canvas.boundingBox();assert.ok(b);
  await ctx.page.mouse.move(b.x+b.width*0.25,b.y+b.height*0.2);
  await ctx.page.mouse.down();
  await ctx.page.mouse.move(b.x+b.width*0.76,b.y+b.height*0.81,{steps:5});
  await ctx.page.mouse.up();
  const png=await save(ctx.page,'[data-testid="annotation-export"]',"flattened-redaction.png");
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const pixels=await ctx.page.evaluate(async base64=>{
   const image=new Image();
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src="data:image/png;base64,"+base64;});
   const c=document.createElement("canvas");c.width=image.width;c.height=image.height;
   const g=c.getContext("2d");g.drawImage(image,0,0);
   return {redacted:[...g.getImageData(100,60,1,1).data],safe:[...g.getImageData(5,5,1,1).data]};
  },png.toString("base64"));
  assert.deepEqual(pixels.redacted,[0,0,0,255],"redacted pixels must be opaque black");
  assert.ok(pixels.safe[2]>150&&pixels.safe[0]>10,"unredacted area should preserve original pixels");
 }finally{await finish(ctx,"redaction-ui.png");}
});