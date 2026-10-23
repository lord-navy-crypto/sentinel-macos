"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const target=path.join(__dirname,"browser-test-results","graph-csv-tools");
fs.mkdirSync(target,{recursive:true});
async function launchTool(page,query){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(query);
 const matches=page.locator(".catalog-open");
 assert.equal(await matches.count(),1);
 await matches.click();
}
async function save(page,button,name){
 const pending=page.waitForEvent("download",{timeout:30000});
 await button.click();
 const dl=await pending;
 assert.equal(dl.suggestedFilename(),name);
 const to=path.join(target,name);await dl.saveAs(to);return fs.readFileSync(to,"utf8");
}
test("Real graph exports finite numeric CSV and calculator saves a verified function table",{timeout:80000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await launchTool(page,"Advanced Graph / 高级绘图");
  await page.locator("#advanced-graph-svg").waitFor();
  await page.locator("#advanced-graph-svg").hover({position:{x:390,y:235}});
  await page.locator('[data-testid="graph-trace-reading"]').waitFor();
  assert.match(await page.locator('[data-testid="graph-trace-reading"]').innerText(),/Curve \d+|Move near/);
  const graphCsv=await save(page,page.locator('[data-testid="graph-export-csv"]'),"daily-desk-graph-points.csv");
  assert.match(graphCsv,/^curve,mode,segment,x,y\r\n1,cartesian,1,/u);
  assert.match(graphCsv,/\r\n2,cartesian,/u);
  assert.equal(graphCsv.includes("=HYPERLINK("),false);
  await launchTool(page,"BASE-N, Equations, Statistics, Matrix");
  await page.getByRole("button",{name:"Function table"}).click();
  const exportBtn=page.locator('[data-testid="function-table-export"]');
  assert.equal(await exportBtn.isDisabled(),true);
  await page.getByRole("button",{name:"Calculate",exact:true}).click();
  assert.equal(await exportBtn.isEnabled(),true);
  const table=await save(page,exportBtn,"daily-desk-function-table.csv");
  assert.match(table,/^x,f\(x\)\r\n-5,25\r\n-4,16\r\n/u);
  await page.getByLabel("Rows (2–50)").fill("8");
  assert.equal(await exportBtn.isDisabled(),true,"Edited inputs require recalculation");
  await page.screenshot({path:path.join(target,"grapher-and-table.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
