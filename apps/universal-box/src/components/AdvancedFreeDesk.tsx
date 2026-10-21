import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {createTextEpub,createIntegrityManifest,parseIntegrityManifest,verifyIntegrityManifest,
 compareCsvSnapshots,exportCsvSnapshotDiff,type IntegrityFile} from "../lib/advancedFreeWorkflows";
export type AdvancedFreeMode="epub-writer"|"integrity-manifest"|"csv-snapshot-diff";
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
async function readText(file:File,limit:number):Promise<string>{
 if(file.size<1||file.size>limit)throw Error("File size exceeds the allowed limit.");
 return new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/u,"");
}
export default function AdvancedFreeDesk({mode}:{mode:AdvancedFreeMode}){
 const [title,setTitle]=useState("My Notebook"),[author,setAuthor]=useState(""),
  [book,setBook]=useState("# Chapter One\n\nA first paragraph.\n\n# 第二章\n\n你好，世界。"),
  [integrityFiles,setIntegrityFiles]=useState<File[]>([]),[manifestText,setManifestText]=useState(""),
  [before,setBefore]=useState("ID,Name,Score\n001,Alice,95\n002,Bob,90"),
  [after,setAfter]=useState("ID,Name,Score\n001,Alice,97\n003,张三,88"),
  [keyName,setKeyName]=useState("ID"),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const comparison=useMemo(()=>{
  try{return {value:compareCsvSnapshots(before,after,keyName),error:""};}
  catch(e){return {value:null,error:message(e)};}
 },[before,after,keyName]);
 async function loadBook(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  try{
   if(!/\.(txt|md)$/iu.test(f.name))throw Error("Choose .txt or .md.");
   setBook(await readText(f,500_000));setStatus("Imported UTF-8 text locally. Only # headings and paragraphs are interpreted.");
  }catch(err){setStatus("Import failed: "+message(err));}
 }
 async function exportEpub(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const bytes=await createTextEpub(book,title,author);
   const saved=await exportFile("sentinel-box-book.epub",bytes);
   setStatus(saved?"Saved a new valid EPUB 3 ZIP with navigable XHTML chapters. Original text unchanged.":"Save cancelled.");
  }catch(e){setStatus("EPUB export failed: "+message(e));}finally{setBusy(false);}
 }
 function selectIntegrityFiles(e:ChangeEvent<HTMLInputElement>){
  setIntegrityFiles([...(e.target.files??[])]);e.target.value="";setStatus("");
 }
 async function rawIntegrityFiles():Promise<IntegrityFile[]>{
  if(integrityFiles.length<1||integrityFiles.length>30)throw Error("Choose 1–30 files.");
  let sum=0;
  for(const f of integrityFiles){sum+=f.size;if(f.size>12_000_000||sum>40_000_000)throw Error("Limit: 12 MB per file, 40 MB combined.");}
  return Promise.all(integrityFiles.map(async f=>({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())})));
 }
 async function exportManifest(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const manifest=await createIntegrityManifest(await rawIntegrityFiles());
   const saved=await exportFile("sentinel-box-sha256-manifest.json",JSON.stringify(manifest,null,2));
   setStatus(saved?"Saved SHA-256 and exact byte sizes for "+manifest.files.length+" selected files; no file contents included.":"Save cancelled.");
  }catch(e){setStatus("Manifest failed: "+message(e));}finally{setBusy(false);}
 }
 async function loadManifest(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  try{
   const text=await readText(f,30_000);const parsed=parseIntegrityManifest(text);
   setManifestText(text);setStatus("Loaded manifest for "+parsed.files.length+" files. Select files to verify manually.");
  }catch(err){setManifestText("");setStatus("Import manifest failed: "+message(err));}
 }
 async function verifyManifest(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const expected=parseIntegrityManifest(manifestText);
   const report=await verifyIntegrityManifest(expected,await rawIntegrityFiles());
   const saved=await exportFile("sentinel-box-integrity-report.json",JSON.stringify({
    algorithm:"SHA-256",manifestFiles:expected.files.length,verifiedAt:new Date().toISOString(),...report,
   },null,2));
   setStatus(saved?"Verification complete: "+report.matches.length+" matched, "+report.modified.length+" modified, "+
    report.missing.length+" missing, "+report.extra.length+" extra. Saved JSON report.":"Save cancelled.");
  }catch(e){setStatus("Verify failed: "+message(e));}finally{setBusy(false);}
 }
 async function csvFile(e:ChangeEvent<HTMLInputElement>,which:"before"|"after"){
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  try{
   if(!/\.csv$/iu.test(f.name))throw Error("Choose CSV input.");
   const s=await readText(f,550_000);
   if(which==="before")setBefore(s);else setAfter(s);
   setStatus("Loaded "+f.name+" as UTF-8 locally.");
  }catch(err){setStatus("CSV import failed: "+message(err));}
 }
 async function saveCsvDiff(){
  if(busy||!comparison.value)return;setBusy(true);setStatus("");
  try{
   const bytes=await exportCsvSnapshotDiff(comparison.value);
   const saved=await exportFile("sentinel-box-csv-snapshot-diff.zip",bytes);
   setStatus(saved?"Saved row and cell changes as formula-safe CSV plus JSON. Originals untouched.":"Save cancelled.");
  }catch(e){setStatus("CSV diff export failed: "+message(e));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="advanced-free-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE-FIRST ADVANCED FREE TOOLS</p>
  {mode==="epub-writer"&&<>
   <h3>TXT / 简单 Markdown → EPUB 3 电子书</h3>
   <p className="subtle">将你主动输入的文字转换成真正的 EPUB 3 电子书，支持 # / ## 章节标题、段落、Unicode、中英文目录。不支持完整 Markdown 排版、图片嵌入、DRM 或 MOBI；导出后可用兼容的 EPUB 阅读器检查。</p>
   <label className="field-label">导入 UTF-8 TXT / MD（≤500 KB）<input data-testid="epub-source" className="field" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={e=>void loadBook(e)}/></label>
   <div className="tools-pair">
    <label className="field-label">书名<input data-testid="epub-title" className="field" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="field-label">作者（可选）<input data-testid="epub-author" className="field" maxLength={120} value={author} onChange={e=>setAuthor(e.target.value)}/></label>
   </div>
   <label className="field-label">正文（最多 300,000 字符）
    <textarea data-testid="epub-body" className="field text-editor" rows={12} maxLength={300000} value={book} onChange={e=>setBook(e.target.value)}/>
   </label>
   <button data-testid="epub-export" type="button" className="primary-button" disabled={busy||!book.trim()||!title.trim()} onClick={()=>void exportEpub()}>生成 EPUB 电子书</button>
  </>}
  {mode==="integrity-manifest"&&<>
   <h3>文件完整性校验 · SHA-256 Manifest</h3>
   <p className="subtle">手动选择最多 30 个文件，生成包含文件名、字节大小和 SHA-256 的 JSON 清单；日后导入清单并再次选择文件，即可检查匹配、损坏或缺失。仅处理选择的文件，不扫描磁盘、不自动传输。文件名需要唯一。</p>
   <label className="field-label">选择要校验的文件（单份≤12 MB／总计≤40 MB）
    <input data-testid="integrity-files" className="field" type="file" multiple onChange={selectIntegrityFiles}/>
   </label>
   <p data-testid="integrity-count" className="subtle">已选择 {integrityFiles.length} 个文件，合计 {integrityFiles.reduce((n,f)=>n+f.size,0).toLocaleString()} 字节</p>
   <button data-testid="integrity-export" type="button" className="primary-button" disabled={busy||!integrityFiles.length} onClick={()=>void exportManifest()}>生成 SHA-256 校验清单</button>
   <label className="field-label">导入先前的 JSON 清单（≤30 KB）
    <input data-testid="integrity-manifest-file" className="field" type="file" accept=".json,application/json" onChange={e=>void loadManifest(e)}/>
   </label>
   <button data-testid="integrity-verify" type="button" className="secondary-button" disabled={busy||!integrityFiles.length||!manifestText} onClick={()=>void verifyManifest()}>核对文件并导出验证报告</button>
  </>}
  {mode==="csv-snapshot-diff"&&<>
   <h3>CSV 两个版本数据差异 · 按唯一 ID 精确审计</h3>
   <p className="subtle">比较两份 UTF-8 CSV 的新增/删除记录、共有字段的单元格修改、增减列。必须提供每行唯一、非空的关键字段；不会将不同记录误认为同一行。保留 001 等文本 ID，不执行公式。</p>
   <div className="tools-pair">
    <label className="field-label">旧版 CSV <input data-testid="csv-diff-old-file" className="field" type="file" accept=".csv" onChange={e=>void csvFile(e,"before")}/></label>
    <label className="field-label">新版 CSV <input data-testid="csv-diff-new-file" className="field" type="file" accept=".csv" onChange={e=>void csvFile(e,"after")}/></label>
   </div>
   <label className="field-label">唯一 ID 列名<input data-testid="csv-diff-key" className="field" maxLength={120} value={keyName} onChange={e=>setKeyName(e.target.value)}/></label>
   <div className="tools-pair">
    <label className="field-label">旧版内容<textarea data-testid="csv-diff-old" className="field text-editor" rows={7} maxLength={550000} value={before} onChange={e=>setBefore(e.target.value)}/></label>
    <label className="field-label">新版内容<textarea data-testid="csv-diff-new" className="field text-editor" rows={7} maxLength={550000} value={after} onChange={e=>setAfter(e.target.value)}/></label>
   </div>
   {comparison.error?<p role="alert" className="subtle">{comparison.error}</p>:comparison.value&&<>
    <p className="subtle" data-testid="csv-diff-summary">新增 {comparison.value.addedRows} 行 · 删除 {comparison.value.removedRows} 行 · 修改 {comparison.value.changedRows} 行 · 未变化 {comparison.value.unchangedRows} 行 · 新列 {comparison.value.addedColumns.join(", ")||"无"} · 删除列 {comparison.value.removedColumns.join(", ")||"无"}</p>
    <pre data-testid="csv-diff-preview" style={{maxHeight:200,whiteSpace:"pre-wrap",overflow:"auto"}}>{JSON.stringify(comparison.value.changes.slice(0,15),null,2)}</pre>
   </>}
   <button data-testid="csv-diff-export" type="button" className="primary-button" disabled={busy||!comparison.value} onClick={()=>void saveCsvDiff()}>导出精确差异 ZIP</button>
  </>}
  {status&&<p role="status" data-testid="advanced-free-status" className="subtle">{status}</p>}
  <p className="subtle">所有操作均在本地启动，只读打开用户选择的文件，新结果通过“另存”导出。不应把文件哈希当作恶意软件检测，也不将浏览器模拟当作真实 Mac 兼容性验收。</p>
 </section>;
}
