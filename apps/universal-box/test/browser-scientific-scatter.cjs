"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","scientific-scatter");
fs.mkdirSync(dir,{recursive:true});
async function save(page,selector,name){
 const [download]=await Promise.all([
   page.waitForEvent("download",{timeout:30000}),
   page.locator(selector).click(),
 ]);
 assert.equal(download.suggestedFilename(),name);
 const dest=path.join(dir,name);await download.saveAs(dest);
 return fs.readFileSync(dest,"utf8");
}
test("Scientific XY scatter plots real numeric positions and exports unchanged original measurements",{timeout:70000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1420,height:900}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Data Chart Studio");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator("#chart-csv").fill("Time (s),Voltage (V)\n0.0000123000,1.2300\n0.0000123000,2.000\n-1.5e-3,-0.50");
  await page.locator('[data-testid="chart-kind"]').selectOption("scatter");
  assert.equal(await page.locator('[data-testid="chart-x-column"]').inputValue(),"0");
  assert.equal(await page.locator('[data-testid="chart-y-column"]').inputValue(),"1");
  const img=page.locator('[data-testid="chart-preview-image"]');
  await img.waitFor();
  const imageUri=await img.getAttribute("src");
  assert.ok(imageUri?.startsWith("data:image/svg+xml"));
  const plot=decodeURIComponent(imageUri.split(",")[1]);
  assert.equal((plot.match(/<circle /g)||[]).length,3,"Each observation should remain distinct");
  assert.match(plot,/0\.0000123000, 1\.2300/u);
  assert.match(plot,/Time \(s\)/u);
  const svg=await save(page,'[data-testid="chart-save-svg"]',"universal-box-data-chart.svg");
  assert.match(svg,/Scientific XY scatter/u);
  assert.equal((svg.match(/<circle /g)||[]).length,3);
  const csv=await save(page,'[data-testid="chart-save-csv"]',"universal-box-chart-data.csv");
  assert.match(csv,/0\.0000123000,1\.2300/u);
  assert.match(csv,/0\.0000123000,2\.000/u);
  assert.match(csv,/-1\.5e-3,-0\.50/u);
  await page.locator('[data-testid="chart-show-fit"]').check();
  await page.locator('[data-testid="chart-fit-details"]').waitFor();
  assert.match(await page.locator('[data-testid="chart-fit-r2"]').innerText(),/R² = .*n = 3/u);
  const fitUri=await page.locator('[data-testid="chart-preview-image"]').getAttribute("src");
  assert.ok(decodeURIComponent(fitUri.split(",")[1]).includes('data-series="least-squares"'));
  const fittedSvg=await save(page,'[data-testid="chart-save-svg"]',"universal-box-data-chart.svg");
  assert.match(fittedSvg,/data-series="least-squares"/u);
  const fitReport=await save(page,'[data-testid="chart-export-fit"]',"universal-box-linear-fit.txt");
  assert.match(fitReport,/Method: ordinary least squares \\(unweighted\\)/u);
  assert.match(fitReport,/Observations: 3/u);
  assert.match(fitReport,/R squared: /u);
  await page.locator("#chart-csv").fill("X,Y\n1,=HYPERLINK('bad')");
  assert.match(await page.getByRole("alert").last().innerText(),/requires finite decimal/i);
  assert.equal(await page.locator('[data-testid="chart-save-svg"]').count(),0,"Unsafe source has no export");
  await page.screenshot({path:path.join(dir,"scatter-plot.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
