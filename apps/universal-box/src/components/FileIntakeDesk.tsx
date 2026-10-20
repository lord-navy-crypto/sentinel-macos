import {useRef,useState,type ChangeEvent,type DragEvent} from "react";
import {exportFile} from "../lib/output";
import {
 INSPECT_MAX_EACH,INSPECT_MAX_FILES,INSPECT_MAX_TOTAL,
 duplicateGroups,fileKind,hexDigest,inventoryCsv,mismatchedExtension,sizeLabel,
 type FileInspection,
} from "../lib/fileIntake";

type Props={onOpenTool:(view:string,module?:string)=>void};
export default function FileIntakeDesk({onOpenTool}:Props){
 const inputRef=useRef<HTMLInputElement>(null);
 const [dragging,setDragging]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState({done:0,total:0});
 const [rows,setRows]=useState<FileInspection[]>([]);
 const [notice,setNotice]=useState("");
 const [filter,setFilter]=useState<"all"|"mismatch"|"duplicates">("all");
 const duplicates=duplicateGroups(rows);
 const duplicateNames=new Set(duplicates.flat());
 const warnings=rows.filter(row=>row.mismatch);
 const total=rows.reduce((sum,row)=>sum+row.size,0);
 async function inspect(incoming:File[]){
  if(!incoming.length)return;
  setNotice("");setBusy(true);setProgress({done:0,total:incoming.length});
  try{
   if(incoming.length>INSPECT_MAX_FILES)throw Error("一次最多检查 "+INSPECT_MAX_FILES+" 个文件。");
   let totalSize=0;
   for(const file of incoming){
    if(file.size>INSPECT_MAX_EACH)throw Error(file.name+" 超过 64 MB 单文件检查上限。");
    totalSize+=file.size;
    if(totalSize>INSPECT_MAX_TOTAL)throw Error("本批总大小不得超过 160 MB。");
   }
   if(!crypto.subtle)throw Error("当前运行环境不提供本地 SHA-256 加密接口。");
   const next:FileInspection[]=[];
   for(const [index,file] of incoming.entries()){
    const magic=fileKind(new Uint8Array(await file.slice(0,16).arrayBuffer()));
    // Read one file at a time to avoid retaining all inputs in memory.
    const sha256=hexDigest(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
    const extension=file.name.includes(".")?(file.name.split(".").pop()??"").toLowerCase():"";
    next.push({name:file.name,size:file.size,kind:magic,sha256,extension,
     mismatch:mismatchedExtension(magic,file.name)});
    setProgress({done:index+1,total:incoming.length});
   }
   setRows(next);
   setFilter("all");
   setNotice("检查完成。文件只在本机读取用于计算哈希；没有上传或修改原文件。");
  }catch(error){setNotice("检查未完成："+(error instanceof Error?error.message:String(error)));}
  finally{setBusy(false);}
 }
 function selectFiles(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  void inspect(selected);
 }
 function dropFiles(event:DragEvent<HTMLDivElement>){
  event.preventDefault();setDragging(false);
  if(busy)return;
  void inspect(Array.from(event.dataTransfer.files));
 }
 async function exportInventory(){
  try{
   const success=await exportFile("universal-box-file-inventory.csv",inventoryCsv(rows));
   setNotice(success?"CSV 清单已导出。原文件没有改变。":"已取消导出。");
  }catch(error){setNotice("导出失败："+(error instanceof Error?error.message:String(error)));}
 }
 const visible=rows.filter(row=>filter==="all"||(filter==="mismatch"?row.mismatch:duplicateNames.has(row)));
 return <section className="panel ub-intake" aria-label="File intake and integrity dashboard">
  <div className="ub-intake-heading">
   <div><p className="eyebrow">FILES · LOCAL FIRST · UNIFIED ENTRY</p>
    <h2>文件工作台 · File Intake</h2>
    <p className="subtle">把文件拖进来，查看真实格式、大小与 SHA-256 指纹；找出重复文件，再选择下一步处理工具。无需登录，不会自动上传。</p>
   </div>
   <div className="ub-intake-lock" aria-label="This inspection works locally">⌁ 本地检查</div>
  </div>
  <div className="ub-intake-dropzone" data-dragging={dragging}
   onDragOver={event=>{event.preventDefault();setDragging(true);}}
   onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}}
   onDrop={dropFiles}>
   <div className="ub-intake-dropicon" aria-hidden="true">⇪</div>
   <h3>拖入多个文件，或从 Mac 中选择</h3>
   <p className="subtle">最多 80 个 · 每个不超过 64 MB · 单批总计不超过 160 MB</p>
   <input ref={inputRef} type="file" multiple className="sr-only"
    aria-label="选择文件进行本地格式与哈希检查" onChange={selectFiles} tabIndex={-1}/>
   <button type="button" className="primary-button" disabled={busy}
    onClick={()=>inputRef.current?.click()}>选择文件</button>
  </div>
  {busy&&<div className="ub-intake-progress" role="status">
   <span>本地计算 SHA-256：{progress.done} / {progress.total}</span>
   <progress value={progress.done} max={progress.total||1} aria-label="Local file inspection progress"/>
  </div>}
  {notice&&<p className="subtle" role="status">{notice}</p>}
  <div className="ub-intake-metrics" aria-label="Inspection summary">
   <div><span>检查文件</span><strong>{rows.length}</strong></div>
   <div><span>总数据量</span><strong>{sizeLabel(total)}</strong></div>
   <div><span>重复组</span><strong>{duplicates.length}</strong></div>
   <div><span>格式提醒</span><strong>{warnings.length}</strong></div>
  </div>
  {rows.length>0&&<>
   <div className="ub-intake-bar">
    <div className="pill-row" role="group" aria-label="File inspection filters">
     {([["all","全部"],["duplicates","重复"],["mismatch","格式提醒"]] as const).map(([key,label])=>
      <button key={key} className={filter===key?"pill active-pill":"pill"} type="button"
       aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}
    </div>
    <div className="actions">
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>void exportInventory()}>导出 CSV 清单</button>
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>{setRows([]);setNotice("清单已清空，没有删除磁盘文件。");}}>清空列表</button>
    </div>
   </div>
   {warnings.length>0&&<p className="ub-intake-warning" role="status">发现 {warnings.length} 个文件的扩展名与已识别的文件头不一致。仅用于提示，请勿单凭扩展名或文件头判断文件安全性。</p>}
   <div className="ub-intake-results" role="list" aria-label="Inspected files">
    {visible.length===0&&<p className="subtle">当前筛选下没有文件。</p>}
    {visible.map((row,i)=><div className="ub-intake-file" role="listitem" key={row.sha256+"-"+i+"-"+row.name}>
     <div className="ub-intake-file-icon" aria-hidden="true">{row.kind==="PDF"?"▣":row.kind==="ZIP container"?"▤":row.kind==="Unknown"?"◇":"▧"}</div>
     <div className="ub-intake-file-main"><strong title={row.name}>{row.name}</strong>
      <p className="subtle">{row.kind} · {sizeLabel(row.size)}{row.mismatch?" · 扩展名可能不匹配":""}
       {duplicateNames.has(row)?" · 检测到相同文件内容":""}</p>
      <code title={row.sha256}>SHA-256 {row.sha256}</code>
     </div>
     <button className="secondary-button" type="button"
      title="复制此文件的 SHA-256"
      onClick={()=>void navigator.clipboard.writeText(row.sha256).then(
       ()=>setNotice("已复制 "+row.name+" 的 SHA-256。"),
       ()=>setNotice("剪贴板不可用，请从下方 CSV 清单中复制。"))}>复制哈希</button>
    </div>)}
   </div>
  </>}
  <div className="ub-intake-actions">
   <p className="eyebrow">NEXT STEP · 接下来做什么？</p>
   <div className="ub-intake-action-grid">
    <button type="button" onClick={()=>onOpenTool("pdf-mini","links")}><span>▣</span><strong>编辑 PDF 链接</strong><small>批量替换 · 区域框选</small></button>
    <button type="button" onClick={()=>onOpenTool("files","images")}><span>▧</span><strong>处理图片</strong><small>缩放 · 裁剪 · 格式转换</small></button>
    <button type="button" onClick={()=>onOpenTool("workflows","zip-selective")}><span>▤</span><strong>ZIP 文件工具</strong><small>查看 · 安全提取 · 重新打包</small></button>
    <button type="button" onClick={()=>onOpenTool("commons")}><span>⇄</span><strong>加密发送与团队协作</strong><small>局域网 · 离线空间</small></button>
   </div>
   <p className="subtle">进入下一工具后，请在那里重新选择原文件；本工作台不会跨工具保存或传递原文件内容，以避免意外暴露。</p>
  </div>
 </section>;
}
