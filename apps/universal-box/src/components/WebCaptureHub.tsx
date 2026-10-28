import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {createOfflineCompanionBundle,WEB_CAPTURE_VERSION} from "../lib/webCaptureBundle";
import {parseWebTableHandoff,type WebTableHandoff} from "../lib/webCaptureHandoff";
import {createWebCaptureReviewBundle} from "../lib/webCaptureReviewBundle";
import {
 cleanWorkspaceCsv,inspectWorkspaceCsv,DEFAULT_CSV_CLEANUP,type CsvCleanupOptions,
} from "../lib/csvCleanroom";

const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const EXAMPLE_CSV="Name,Department,Score\nAda,Physics,95\nBob,Engineering,89\nAda,Physics,95\n,,\n";
export default function WebCaptureHub({onOpenTool}:{onOpenTool:(view:string,module?:string)=>void}){
 const [source,setSource]=useState(EXAMPLE_CSV);
 const [filename,setFilename]=useState("captured-data.csv");
 const [settings,setSettings]=useState<CsvCleanupOptions>(DEFAULT_CSV_CLEANUP);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [previewAccepted,setPreviewAccepted]=useState(false);
 const [handoff,setHandoff]=useState<WebTableHandoff|null>(null);
 const report=useMemo(()=>{
  try{return {value:inspectWorkspaceCsv(source),error:""};}
  catch(e){return {value:null,error:errorText(e)};}
 },[source]);
 const cleaned=useMemo(()=>{
  try{return {value:cleanWorkspaceCsv(source,settings),error:""};}
  catch(e){return {value:null,error:errorText(e)};}
 },[source,settings]);
 async function exportCompanion(){
  if(busy)return;
  setBusy(true);setStatus("");
  try{
   const bytes=await createOfflineCompanionBundle();
   const saved=await exportFile("UniversalBox-WebCapture-"+WEB_CAPTURE_VERSION+"-Chromium.zip",bytes);
   setStatus(saved?"Web Capture 浏览器扩展已保存为 ZIP。解压后用 Chromium 的“加载已解压的扩展程序”安装。":"已取消保存；未修改浏览器。");
  }catch(e){setStatus("扩展打包失败："+errorText(e));}
  finally{setBusy(false);}
 }
 async function importTableHandoff(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(!file)return;
  setStatus("");setPreviewAccepted(false);
  try{
   if(file.size>800_000)throw Error("交接 JSON 超过 800 KB。");
   const record=parseWebTableHandoff(await file.text());
   inspectWorkspaceCsv(record.table.csv);
   setSource(record.table.csv);
   setFilename("web-capture-table.csv");
   setHandoff(record);
   setStatus("已从用户选择的 JSON 导入表格；请确认来源和行列后再导出。");
  }catch(error){setStatus("无法导入网页交接文件："+errorText(error));}
 }
 async function importCsv(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";
  if(!file)return;
  setStatus("");setPreviewAccepted(false);
  try{
   if(file.size>2_000_000)throw Error("CSV 超过 2 MB；请分批导入。");
   const text=await file.text();
   inspectWorkspaceCsv(text);
   setSource(text);setFilename(file.name);setHandoff(null);
   setStatus("本地读取 CSV 成功，请检查统计信息并决定是否导出处理结果。");
  }catch(error){setStatus("无法读取 CSV："+errorText(error));}
 }
 async function pasteClipboard(){
  try{
   const text=await navigator.clipboard.readText();
   inspectWorkspaceCsv(text);
   setSource(text);setFilename("web-capture.csv");setHandoff(null);setStatus("已读取本机剪贴板。没有向网络发送内容。");
   setPreviewAccepted(false);
  }catch(error){setStatus("无法从剪贴板导入："+errorText(error)+"。可以手动粘贴到文本框。");}
 }
 async function saveProvenanceBundle(){
  if(!handoff||!cleaned.value||busy||!previewAccepted)return;
  setBusy(true);setStatus("");
  try{
   const bundle=await createWebCaptureReviewBundle({
    handoff,workingCsv:source,cleanedCsv:cleaned.value.csv,
    cleanupOptions:settings,removedRows:cleaned.value.removedRows,
   });
   const saved=await exportFile("sentinel-box-web-capture-review.zip",bundle);
   setStatus(saved?"已保存带来源的 ZIP：包含捕获原件、修改稿、清理结果及来源记录。":"已取消保存；所有源文件保持不变。");
  }catch(e){setStatus("保存带来源的 ZIP 失败："+errorText(e));}
  finally{setBusy(false);}
 }
 async function saveCleaned(){
  if(!cleaned.value||busy||!previewAccepted)return;
  setBusy(true);setStatus("");
  try{
   const bytes=new TextEncoder().encode("\ufeff"+cleaned.value.csv);
   const normalized=filename.replace(/\.csv$/i,"").replace(/[^a-z0-9._\-\u4e00-\u9fff]/gi,"-").slice(0,80)||"captured-data";
   const saved=await exportFile(normalized+"-cleaned.csv",bytes);
   setStatus(saved?"处理后的 CSV 已保存，本地源文件未改变。":"保存已取消，源文件未改变。");
  }catch(e){setStatus("CSV 导出失败："+errorText(e));}
  finally{setBusy(false);}
 }
 const update=<K extends keyof CsvCleanupOptions>(key:K,value:CsvCleanupOptions[K])=>{
  setSettings(old=>({...old,[key]:value}));setPreviewAccepted(false);
 };
 return <section className="panel ub-companion" aria-label="Web Capture and offline CSV workshop">
  <p className="eyebrow">SENTINEL BOX · WEB CAPTURE · FREE OFFICE WORKFLOW</p>
  <h2>Web Capture 与免费 CSV 工作台</h2>
  <p className="subtle">浏览器扩展已经打包在 Sentinel Box 桌面程序中。无需在线账户或额外付费服务。为遵守浏览器安全边界，桌面应用不会偷偷读取网页；只有主动安装扩展并点击捕获时才读取当前网页。不会跟踪浏览历史，也不会后台采集。</p>
  <div className="ub-companion-grid">
   <div className="ub-companion-pane">
    <h3>① 安装浏览器捕获助手</h3>
    <p>Web Capture v{WEB_CAPTURE_VERSION} · Chromium 扩展。支持网页研究摘录、选中文字、RIS 引用、图片清单、表格质量检查，以及指定表格 CSV/Markdown/JSON 导出。</p>
    <button type="button" className="primary-button" disabled={busy} onClick={()=>void exportCompanion()} data-testid="export-companion">
     {busy?"正在准备 ZIP…":"从 Sentinel Box 导出浏览器扩展 ZIP"}
    </button>
    <p className="subtle">安装：解压 ZIP → Chrome / Edge 等 Chromium 扩展页面 → 开发者模式 → 加载已解压的扩展程序 → 选择含 manifest.json 的文件夹。Safari 尚未打包。</p>
    <p className="subtle">扩展与应用同源打包、默认离线；没有自动连接浏览器或跨应用静默传输。</p>
   </div>
   <div className="ub-companion-pane">
    <h3>② 处理捕获后的 CSV / 网页表格 JSON</h3>
    <p>导入网页 CSV 或含来源的 Web Capture JSON。检查、清理后可另存 CSV，或导出包含原始捕获、处理结果及来源记录的 ZIP。</p>
    <div className="actions">
     <label className="ub-companion-file">选择 CSV 文件
      <input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={e=>void importCsv(e)}/>
     </label>
     <label className="ub-companion-file">导入网页表格 JSON
      <input type="file" accept=".json,application/json" aria-label="Import Web Capture table JSON" data-testid="import-web-table" onChange={e=>void importTableHandoff(e)}/>
     </label>
     <button type="button" className="secondary-button" onClick={()=>void pasteClipboard()}>导入本机剪贴板</button>
    </div>
    <div className="actions">
     <button className="secondary-button" type="button" onClick={()=>onOpenTool("tables")}>打开数据表格工具 →</button>
     <button className="secondary-button" type="button" onClick={()=>onOpenTool("pdf-mini")}>打开 PDF 编辑 →</button>
    </div>
   </div>
  </div>
  <h3>CSV 本地检查与处理</h3>
  {handoff&&<p className="subtle" data-testid="web-capture-source">网页来源：{handoff.source.title||"未命名网页"} · {new URL(handoff.source.url).hostname} · 采集于 {handoff.source.capturedAt.slice(0,10)}。{source!==handoff.table.csv?"本地内容已修改，ZIP 将分别保留网页捕获原件和修改稿。":"捕获原件尚未手动改动。"}来源由网页提供，尚未经独立验证。</p>}
  <label className="field-label" htmlFor="csv-workshop-source">CSV 内容（在此编辑不会修改原始文件）</label>
  <textarea id="csv-workshop-source" className="field text-editor" data-testid="csv-source" rows={6} maxLength={2000000} value={source} onChange={e=>{setSource(e.target.value);setPreviewAccepted(false);setStatus("");}}/>
  {report.value?<div className="ub-companion-metrics" aria-label="CSV file review">
    <span><strong>{report.value.inputRows}</strong> 数据行</span>
    <span><strong>{report.value.columns}</strong> 列</span>
    <span><strong>{report.value.duplicateRows}</strong> 重复行</span>
    <span><strong>{report.value.blankRows}</strong> 空行</span>
   </div>:<p className="subtle" role="alert">CSV 检查失败：{report.error}</p>}
  <div className="ub-companion-options" role="group" aria-label="CSV cleanup options">
   {([
    ["trimCells","去除单元格首尾空格"],
    ["removeBlankRows","移除空行"],
    ["removeDuplicateRows","合并完全重复的行"],
    ["protectFormulas","阻止 CSV 公式注入"],
   ] as const).map(([key,label])=><label key={key}>
    <input type="checkbox" checked={settings[key]} onChange={e=>update(key,e.target.checked)}/> {label}
   </label>)}
  </div>
  {cleaned.value?<div className="ub-companion-output">
    <p className="subtle">预览：保留 {cleaned.value.keptRows} 个数据行；移除 {cleaned.value.removedRows} 个数据行。操作只是新建导出文件，不会覆盖源文件。</p>
    <pre data-testid="csv-preview">{cleaned.value.csv.slice(0,1600)}{cleaned.value.csv.length>1600?"\n…仅预览前 1600 字符":""}</pre>
    <label className="ub-companion-confirm">
      <input type="checkbox" checked={previewAccepted} onChange={e=>setPreviewAccepted(e.target.checked)}/> 已检查预览，同意导出新 CSV
    </label>
    <button type="button" className="primary-button" data-testid="save-cleaned" disabled={busy||!previewAccepted} onClick={()=>void saveCleaned()}>
      导出清理后的 CSV（保留原件）
    </button>
    {handoff&&<button type="button" className="secondary-button" data-testid="save-web-review-zip" disabled={busy||!previewAccepted} onClick={()=>void saveProvenanceBundle()}>
      导出 CSV + 来源记录 ZIP
    </button>}
   </div>:<p className="subtle" role="alert">无法处理：{cleaned.error}</p>}
  {status&&<p role="status" className="ub-companion-status">{status}</p>}
  <p className="subtle">隐私与限制：CSV 最多 2 百万个字符 / 1 万行 / 100 列。对于真实身份证号、财务信息或其他敏感数据，请确认在自己的设备上处理，并核对导出前后的内容。当前不是高保真 XLSX 编辑器，也不支持 Safari 扩展自动安装。</p>
 </section>;
}
