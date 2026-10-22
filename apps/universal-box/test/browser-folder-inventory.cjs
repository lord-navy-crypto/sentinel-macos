"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {chromium}=require("playwright");
const base=process.env.UNIVERSAL_BOX_UI_URL||"http://127.0.0.1:1420/";
const output=path.join(__dirname,"browser-test-results","folder-inventory");
fs.mkdirSync(output,{recursive:true});

test("Select a real local folder and export a true Markdown tree plus CSV without reading file contents",{
 timeout:80000,
},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sentinel-folder-tree-"));
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1360,height:900},acceptDownloads:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  fs.mkdirSync(path.join(dir,"src"),{recursive:true});
  fs.mkdirSync(path.join(dir,"receipts"),{recursive:true});
  fs.writeFileSync(path.join(dir,"readme.md"),"# Test folder\n");
  fs.writeFileSync(path.join(dir,"src","program.ts"),"const value=42;\n");
  fs.writeFileSync(path.join(dir,"receipts","=SUM(1).csv"),"date,amount\n");
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator(".app-shell").waitFor();
  await page.locator('.sidebar button.nav-item[aria-label^="All tools"]').click();
  await page.locator("#all-tools-search").fill("Folder Tree & Inventory");
  assert.equal(await page.locator(".catalog-open").count(),1);
  await page.locator(".catalog-open").click();
  await page.locator('[data-testid="folder-inventory-desk"]').waitFor();
  await page.locator('[data-testid="folder-pick-directory"]').setInputFiles(dir);
  await page.getByRole("status").filter({hasText:"没有读取文件内容"}).waitFor();
  assert.match(await page.locator('[data-testid="folder-inventory-stats"]').innerText(),/文件：3/);
  assert.match(await page.locator('[data-testid="folder-inventory-stats"]').innerText(),/子文件夹：2/);

  const tree=await page.locator('[data-testid="folder-tree-preview"]').inputValue();
  assert.match(tree,/readme\.md/);
  assert.match(tree,/src\/\n\s+- program\.ts/);
  assert.match(tree,/receipts\/\n\s+- =SUM\(1\)\.csv/);

  await page.locator('[data-testid="folder-search"]').fill(".md");
  assert.equal(await page.locator('[data-testid="folder-file-preview"] .task-row').count(),1);
  // Filter changes only visible rows, never the exported full inventory.
  const treeRequest=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="folder-export-markdown"]').click();
  const treeDownload=await treeRequest;
  assert.equal(treeDownload.suggestedFilename(),"sentinel-folder-tree.md");
  const mdFile=path.join(output,"folder-tree.md");await treeDownload.saveAs(mdFile);
  const exportedTree=fs.readFileSync(mdFile,"utf8");
  assert.equal(exportedTree,tree);
  assert.match(exportedTree,/program.ts/);
  assert.match(exportedTree,/=SUM/);

  const csvRequest=page.waitForEvent("download",{timeout:25000});
  await page.locator('[data-testid="folder-export-csv"]').click();
  const csvDownload=await csvRequest;
  assert.equal(csvDownload.suggestedFilename(),"sentinel-folder-inventory.csv");
  const csvFile=path.join(output,"folder-list.csv");await csvDownload.saveAs(csvFile);
  const csv=fs.readFileSync(csvFile,"utf8");
  assert.match(csv,/index,relative_path,file_name,extension,size_bytes,modified_utc/);
  assert.match(csv,/program.ts/);
  assert.match(csv,/readme.md/);
  assert.match(csv,/'=SUM\(1\)\.csv/,"Unsafe formula-like filename should be escaped");
  assert.equal(csv.trim().split("\r\n").length,4);

  // A bad/duplicate multi-file selection does not erase a previously valid tree.
  await page.locator('[data-testid="folder-pick-files"]').setInputFiles([
   {name:"duplicate.txt",mimeType:"text/plain",buffer:Buffer.from("a")},
   {name:"duplicate.txt",mimeType:"text/plain",buffer:Buffer.from("b")},
  ]);
  await page.getByRole("status").filter({hasText:"之前的清单已保留"}).waitFor();
  assert.match(await page.locator('[data-testid="folder-inventory-stats"]').innerText(),/文件：3/);
  await page.locator('[data-testid="folder-clear"]').click();
  assert.equal(await page.locator('[data-testid="folder-inventory-stats"]').count(),0);
  assert.equal(await page.locator('[data-testid="folder-export-csv"]').count(),0);
  await page.screenshot({path:path.join(output,"folder-clean.png"),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{
  await page.close();await browser.close();fs.rmSync(dir,{recursive:true,force:true});
 }
});
