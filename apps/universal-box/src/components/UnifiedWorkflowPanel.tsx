import {useMemo,useState,type ChangeEvent,type DragEvent} from "react";
import {exportFile} from "../lib/output";
import {buildUnifiedWorkflow,normalizeImageOnCanvas,planUnifiedFiles,
 type UnifiedManifest,type UnifiedOptions} from "../lib/unifiedWorkflow";

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function UnifiedWorkflowPanel(){
 const [files,setFiles]=useState<File[]>([]),
  [settings,setSettings]=useState<UnifiedOptions>({includeOriginals:false,imageMaxDimension:1024}),
  [busy,setBusy]=useState(false),[status,setStatus]=useState(""),
  [report,setReport]=useState<UnifiedManifest|null>(null),[dragging,setDragging]=useState(false);
 const preview=useMemo(()=>{
  try{return {items:planUnifiedFiles(files),error:""};}
  catch(e){return {items:null,error:files.length?errorText(e):""};}
 },[files]);
 function selectFiles(selected:File[]){
  setFiles(selected);setReport(null);setStatus("");
 }
 function choose(event:ChangeEvent<HTMLInputElement>){
  selectFiles([...(event.target.files??[])]);event.target.value="";
 }
 function drop(event:DragEvent<HTMLElement>){
  event.preventDefault();setDragging(false);
  const selection=event.dataTransfer.files;
  if(selection.length)selectFiles([...selection]);
 }
 async function process(){
  if(!preview.items||busy)return;
  setBusy(true);setStatus("Reading user-selected files…");setReport(null);
  try{
   const result=await buildUnifiedWorkflow(files,settings,normalizeImageOnCanvas,msg=>setStatus(msg));
   const saved=await exportFile("sentinel-box-unified-results.zip",result.archive);
   setReport(result.manifest);
   if(saved)setStatus("Saved unified ZIP: "+result.manifest.processed+" processed, "+result.manifest.archived+
    " archived, "+result.manifest.failed+" failed, "+result.manifest.skipped+" skipped. Open reports/manifest.json for details.");
   else setStatus("Export cancelled. Source files untouched.");
  }catch(e){setStatus("Cannot complete unified workflow: "+errorText(e));}
  finally{setBusy(false);}
 }
 return <div data-testid="unified-workflow-panel">
  <h3>Unified Workflow · 多格式统一处理工作台</h3>
  <p className="subtle">一批文件一次处理：DOCX/PPTX → 文字，TXT/Markdown → Word，CSV → 清理，JSON → TypeScript，PNG/JPEG/WebP → 规格化 PNG，最后生成一个有来源清单、SHA-256 和逐文件状态的 ZIP。文件始终由你主动选择，不自动扫描硬盘或联网。</p>
  <section aria-label="Drop local files for unified conversion"
   style={{border:dragging?"2px solid #3682d7":"2px dashed #95adc8",padding:18,borderRadius:12,marginBottom:14}}
   onDragOver={e=>{e.preventDefault();setDragging(true);}}
   onDragLeave={e=>{e.preventDefault();setDragging(false);}}
   onDrop={drop}>
   <label className="field-label">选择文件或拖放到这里（最多 16 个、总计 16 MB、单文件 8 MB）
    <input data-testid="unified-files" className="field" type="file" multiple onChange={choose}/>
   </label>
   <p className="subtle">仅处理选中的文件；不覆盖源文件。暂不支持 PDF 页面 OCR、完整 Word/PPT 版式转换或复杂宏；其他文件可以选择只打包原件。</p>
  </section>
  <div className="tools-pair">
   <label className="field-label">图片长边上限
    <select data-testid="unified-image-dimension" className="field" value={settings.imageMaxDimension}
     onChange={e=>setSettings(s=>({...s,imageMaxDimension:Number(e.target.value) as UnifiedOptions["imageMaxDimension"]}))}>
     <option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px</option>
    </select>
   </label>
   <label className="field-label" style={{display:"flex",alignItems:"center",gap:8}}>
    <input data-testid="unified-originals" type="checkbox" checked={settings.includeOriginals}
     onChange={e=>setSettings(s=>({...s,includeOriginals:e.target.checked}))}/>
    在 ZIP 中另外保留原文件副本（会增大文件体积）
   </label>
  </div>
  {preview.error&&<p role="alert" className="subtle">{preview.error}</p>}
  {preview.items&&<>
   <h4>处理计划（执行前可核对）</h4>
   <p data-testid="unified-file-count" className="subtle">{preview.items.length} 个文件 · {preview.items.reduce((n,x)=>n+x.bytes,0).toLocaleString()} 字节。没有支持的转换时不会擅自猜测格式。</p>
   <div style={{maxHeight:290,overflow:"auto",border:"1px solid #c9d6e4",borderRadius:10,padding:12}}>
    {preview.items.map(x=><p data-testid="unified-plan-row" key={x.index} style={{margin:"6px 0",overflowWrap:"anywhere"}}>
     <strong>{String(x.index+1).padStart(2,"0")}. {x.name}</strong> → {x.label}
    </p>)}
   </div>
  </>}
  <div className="actions">
   <button type="button" className="primary-button" data-testid="unified-export" disabled={busy||!preview.items}
    onClick={()=>void process()}>{busy?"正在统一处理…":"一键运行并导出成果 ZIP"}</button>
   <button type="button" className="secondary-button" disabled={busy||!files.length}
    onClick={()=>selectFiles([])}>清空文件</button>
  </div>
  {status&&<p className="subtle" role="status" data-testid="unified-status">{status}</p>}
  {report&&<section aria-label="Per-file conversion report">
   <h4>处理结果：{report.processed} 成功转换，{report.archived} 仅归档，{report.skipped} 跳过，{report.failed} 失败</h4>
   {report.files.map(row=><p key={row.index} data-testid="unified-result-row" style={{overflowWrap:"anywhere"}}>
    <strong>{row.source}</strong> · {row.status} · {row.outputs.length} 个打包文件
    {row.error&&<> · <span role="alert">{row.error}</span></>}
    {row.notes.length>0&&<> · {row.notes.join("; ")}</>}
   </p>)}
  </section>}
  <p className="subtle">结果包含 reports/manifest.json、处理步骤、原件 SHA-256 哈希、输出路径及错误。转换并非万无一失；请核对生成的 Word、图片与表格后再使用。CSV 会防止公式注入；文档宏不会被执行。</p>
 </div>;
}
