"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const origin=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const out=path.join(__dirname,"browser-test-results","vcf-to-csv");fs.mkdirSync(out,{recursive:true});

test("Real CSV→VCF→CSV loop: private local contact data, full CSV export and invalid import recovery",{
 timeout:90000,
},async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1410,height:920}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("CSV → vCard Contacts");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="vcf-import-desk"]').waitFor();

  // Use the existing shipped CSV -> vCard generator as the input to the new reverse converter.
  const vcfPending=page.waitForEvent("download",{timeout:25000});
  await page.getByRole("button",{name:"Save contacts.vcf"}).click();
  const vcfDownload=await vcfPending;
  assert.equal(vcfDownload.suggestedFilename(),"universal-box-contacts.vcf");
  const original=path.join(out,"original-contacts.vcf");await vcfDownload.saveAs(original);
  const source=fs.readFileSync(original);
  assert.match(source.toString("utf8"),/BEGIN:VCARD/);
  await page.locator('[data-testid="vcf-import-file"]').setInputFiles({
   name:"back-up.vcf",mimeType:"text/vcard",buffer:source,
  });
  await page.locator('[data-testid="vcf-import-stats"]').waitFor();
  assert.match(await page.locator('[data-testid="vcf-import-stats"]').innerText(),/2 contacts/);
  assert.match(await page.locator('[data-testid="vcf-import-preview"]').innerText(),/Ada Lovelace/);
  assert.match(await page.locator('[data-testid="vcf-import-preview"]').innerText(),/Grace Hopper/);

  const csvPending=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="vcf-export-csv"]').click();
  const csvDownload=await csvPending;
  assert.equal(csvDownload.suggestedFilename(),"sentinel-contacts-from-vcf.csv");
  const csvPath=path.join(out,"reconverted-contacts.csv");await csvDownload.saveAs(csvPath);
  const csv=fs.readFileSync(csvPath,"utf8");
  assert.match(csv,/Name,Phone,Email,Organization,Website,Title/);
  assert.match(csv,/Ada Lovelace/);
  assert.match(csv,/ada@example.org/);
  assert.match(csv,/Grace Hopper/);
  assert.equal(csv.split("\r\n").filter(Boolean).length,3);
  assert.deepEqual(fs.readFileSync(original),source,"The exported input VCF may not be rewritten");

  // A broken/unsupported legacy encoding must not erase the last good imported report.
  await page.locator('[data-testid="vcf-import-file"]').setInputFiles({
   name:"old.vcf",mimeType:"text/vcard",
   buffer:Buffer.from("BEGIN:VCARD\r\nVERSION:2.1\r\nFN:Old Format\r\nEND:VCARD\r\n"),
  });
  await page.locator('[data-testid="vcf-import-status"]').filter({hasText:"previously imported contacts remain"}).waitFor();
  assert.match(await page.locator('[data-testid="vcf-import-stats"]').innerText(),/2 contacts/);
  await page.locator('[data-testid="vcf-clear"]').click();
  assert.equal(await page.locator('[data-testid="vcf-import-stats"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await page.close();await browser.close();}
});
