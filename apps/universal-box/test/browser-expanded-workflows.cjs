"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),JSZip=require("jszip");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const dir=path.join(__dirname,"browser-test-results","expanded-workflows");fs.mkdirSync(dir,{recursive:true});
async function setup(){
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
 return {browser,page,errors};
}
async function launch(page,term){
 await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
 await page.locator("#all-tools-search").fill(term);
 const b=page.locator(".catalog-open");assert.equal(await b.count(),1,"Missing "+term);
 await b.click();await page.locator('[data-testid="sheet-clip-desk"]').waitFor();
}
async function download(page,selector,name){
 const next=page.waitForEvent("download",{timeout:30000});await page.locator(selector).click();
 const file=await next,to=path.join(dir,name);await file.saveAs(to);
 return fs.readFileSync(to);
}
async function finish(s,name){
 try{await s.page.screenshot({path:path.join(dir,name),fullPage:true});assert.deepEqual(s.errors,[]);}
 finally{await s.page.close();await s.browser.close();}
}
async function workbook(){
 const zip=new JSZip();
 zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 zip.file("_rels/.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 zip.file("xl/workbook.xml",'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Original" sheetId="1" r:id="rId1"/><sheet name="Research" sheetId="2" r:id="rId2"/></sheets></workbook>');
 zip.file("xl/_rels/workbook.xml.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
 const xml=(header,value)=>'<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>'+header+'</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>'+value+'</t></is></c></row></sheetData></worksheet>';
 zip.file("xl/worksheets/sheet1.xml",xml("Student","李华"));
 zip.file("xl/worksheets/sheet2.xml",xml("ID","001"));
 return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
}
test("selects only second actual XLSX sheet and exports formula-safe CSV via visible UI",{timeout:65000},async()=>{
 const s=await setup();try{
  await launch(s.page,"XLSX Multi-Sheet Export");
  await s.page.locator('[data-testid="sheet-select-file"]').setInputFiles({name:"two-tabs.xlsx",
    mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:await workbook()});
  await s.page.locator('[data-testid="sheet-select-count"]').waitFor();
  assert.match(await s.page.locator('[data-testid="sheet-select-count"]').innerText(),/已选择 2/);
  await s.page.locator('[data-testid="sheet-select-checkbox"]').nth(0).uncheck();
  const data=await download(s.page,'[data-testid="sheet-select-export"]',"selected-xlsx-sheets.zip");
  const zip=await JSZip.loadAsync(data,{checkCRC32:true});
  assert.equal(zip.file("worksheets/001.csv"),null);
  const csv=await zip.file("worksheets/002.csv").async("string");
  assert.match(csv,/001/);assert.match(csv,/ID/);
  const report=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.deepEqual(report.sheets.map(x=>x.name),["Research"]);
  assert.equal(report.originalWorkbookIncluded,false);
 }finally{await finish(s,"selected-xlsx.png");}
});
test("manual clip basket reorders exact Chinese/English snippets and exports full text without monitoring",{timeout:60000},async()=>{
 const s=await setup();try{
  await launch(s.page,"Multi-Clip Text Basket");
  await s.page.locator('[data-testid="clip-basket-draft"]').fill("Hello world");
  await s.page.locator('[data-testid="clip-basket-add"]').click();
  await s.page.locator('[data-testid="clip-basket-draft"]').fill("你好，世界");
  await s.page.locator('[data-testid="clip-basket-add"]').click();
  assert.equal(await s.page.locator('[data-testid="clip-basket-item"]').count(),2);
  await s.page.locator('[data-testid="clip-basket-item"]').nth(1).getByRole("button",{name:"上移"}).click();
  const bytes=await download(s.page,'[data-testid="clip-basket-save"]',"clip-basket.txt");
  assert.equal(bytes.toString("utf8"),"你好，世界\n\nHello world");
  await s.page.locator('[data-testid="clip-basket-clear"]').click();
  assert.equal(await s.page.locator('[data-testid="clip-basket-item"]').count(),0);
 }finally{await finish(s,"clip-basket.png");}
});