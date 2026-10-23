"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createHash}=require("node:crypto"),{chromium}=require("playwright"),JSZip=require("jszip");
const root=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","verified-client-delivery");
fs.mkdirSync(out,{recursive:true});
test("Real selected client files are ZIP-packaged, SHA256/CRC verified and safely named",{timeout:95000},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:920}});
 const exceptions=[];page.on("pageerror",e=>exceptions.push(e.message));
 try{
  await page.goto(root,{waitUntil:"domcontentloaded"});await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Verified Client File Handoff");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="client-delivery-desk"]').waitFor();
  // No fabricated customer or delivery details on a new handoff.
  for(const name of ["project","recipient","reference","deliveryDate","note"]){
   assert.equal(await page.locator('[data-testid="delivery-'+name+'"]').inputValue(),"",name+" must start blank");
  }
  assert.equal(await page.locator('[data-testid="delivery-export"]').count(),0);
  await page.locator('[data-testid="delivery-project"]').fill("Client design delivery");
  await page.locator('[data-testid="delivery-recipient"]').fill("Northwind Ltd.");
  await page.locator('[data-testid="delivery-deliveryDate"]').fill("2026-10-21");
  await page.locator('[data-testid="delivery-note"]').fill("First approved handover.");
  const sourceFiles=[
   {name:"terms.txt",mimeType:"text/plain",buffer:Buffer.from("Terms and delivery notes","utf8")},
   {name:"sample.csv",mimeType:"text/csv",buffer:Buffer.from("id,value\n001,alpha\n","utf8")},
  ];
  await page.locator('[data-testid="delivery-files"]').setInputFiles(sourceFiles);
  assert.match(await page.locator('[data-testid="delivery-summary"]').innerText(),/文件：2/);
  assert.match(await page.locator('[data-testid="delivery-preview"]').innerText(),/files\/001-terms.txt/);
  const pending=page.waitForEvent("download",{timeout:30000});
  await page.locator('[data-testid="delivery-export"]').click();
  const dl=await pending,file=path.join(out,"verified-delivery.zip");
  await dl.saveAs(file);
  const zip=await JSZip.loadAsync(fs.readFileSync(file),{checkCRC32:true});
  const manifest=JSON.parse(await zip.file("reports/manifest.json").async("string"));
  assert.equal(manifest.fileCount,2);
  assert.equal(manifest.project,"Client design delivery");
  assert.equal(manifest.recipient,"Northwind Ltd.");
  for(let i=0;i<manifest.files.length;i++){
   const declared=manifest.files[i];
   const output=await zip.file(declared.path).async("nodebuffer");
   const original=sourceFiles[i].buffer;
   assert.deepEqual(output,original,"File content must match selected source");
   assert.equal(declared.sha256,createHash("sha256").update(output).digest("hex"));
   assert.equal(declared.bytes,original.length);
  }
  const checklist=await zip.file("README-delivery.txt").async("string");
  assert.match(checklist,/First approved handover/);
  const csv=await zip.file("reports/files.csv").async("string");
  assert.match(csv,/001-terms.txt/);
  const checksums=await zip.file("reports/checksums.sha256").async("string");
  assert.match(checksums,/[0-9a-f]{64} \*files\/001-terms.txt/);
  assert.match(await page.locator('[data-testid="delivery-progress"]').innerText(),/verification complete/i);
  await page.locator('[data-testid="delivery-recipient"]').fill("");
  await page.locator('[data-testid="delivery-error"]').waitFor();
  assert.equal(await page.locator('[data-testid="delivery-export"]').count(),0);
  await page.screenshot({path:path.join(out,"delivery-handoff.png"),fullPage:true});
  assert.deepEqual(exceptions,[]);
 }finally{await page.close();await browser.close();}
});
