import {useEffect,useRef,useState,type ChangeEvent,type DragEvent} from "react";
import {exportFile} from "../lib/output";
import {preflightFiles,excludeStagedFile} from "../lib/intakePreflight";
import {consumeFilesForIntake} from "../lib/pendingFileIntake";
import {
 compareChecksumManifest,createChecksumManifest,parseChecksumManifest,
 type ChecksumEntry,type ComparisonStatus
} from "../lib/checksumManifest";
import {
 duplicateGroups,fileKind,hexDigest,inventoryCsv,mismatchedExtension,sizeLabel,
 type FileInspection,
} from "../lib/fileIntake";

type Props={onOpenTool:(view:string,module?:string)=>void};
export default function FileIntakeDesk({onOpenTool}:Props){
 const inputRef=useRef<HTMLInputElement>(null);
 const [dragging,setDragging]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState({done:0,total:0});
 const [currentFile,setCurrentFile]=useState("");
 const [staged,setStaged]=useState<File[]>([]);
 const scanController=useRef<AbortController|null>(null);
 useEffect(()=>()=>{scanController.current?.abort();},[]);
 const [rows,setRows]=useState<FileInspection[]>([]);
 const [notice,setNotice]=useState("");
 const [filter,setFilter]=useState<"all"|"mismatch"|"duplicates">("all");
 const [search,setSearch]=useState("");
 const [sort,setSort]=useState<"name"|"size"|"kind">("name");
 const [manifest,setManifest]=useState<ChecksumEntry[]|null>(null);
 const [manifestName,setManifestName]=useState("");
 const [manifestError,setManifestError]=useState("");
 const duplicates=duplicateGroups(rows);
 const duplicateNames=new Set(duplicates.flat());
 const warnings=rows.filter(row=>row.mismatch);
 const total=rows.reduce((sum,row)=>sum+row.size,0);
 const review=preflightFiles(staged);
 const kindTotals=[...new Set(rows.map(row=>row.kind))].map(kind=>({
  kind,count:rows.filter(row=>row.kind===kind).length,
  bytes:rows.filter(row=>row.kind===kind).reduce((sum,row)=>sum+row.size,0)
 })).sort((a,b)=>b.count-a.count||a.kind.localeCompare(b.kind));
 const compare=manifest?compareChecksumManifest(manifest,rows):null;
 const compareLabels:Record<ComparisonStatus,string>={
  match:"通过",changed:"内容改变",missing:"未找到",ambiguous:"文件名重复",extra:"未在清单中"
 };
 function excludeStaged(index:number){
  if(busy||index<0||index>=staged.length)return;
  const name=staged[index].name;
  const remaining=excludeStagedFile(staged,index);
  setStaged(remaining);setProgress({done:0,total:remaining.length});
  setNotice("已从本次扫描移除「"+name+"」；磁盘上的原文件没有改变。"+
   (remaining.length?"请确认更新后的文件数量、大小与预检提醒。":"请选择需要检查的文件。"));
 }
 function stage(incoming:File[]){
  if(busy||!incoming.length)return;
  setStaged(incoming);
  setCurrentFile("");
  setProgress({done:0,total:incoming.length});
  setNotice("已准备 "+incoming.length+" 个文件。请先检查文件名与大小，然后点击开始扫描。");
 }
 // Consume an explicit home-page drop once. Never automatically scan dropped files.
 useEffect(()=>{
  const files=consumeFilesForIntake();
  if(files.length)stage(files);
 // Stage is intentionally mount-only: the user controls subsequent scan and output.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function inspect(){
  const incoming=staged;
  if(!incoming.length||busy)return;
  const preflight=preflightFiles(incoming);
  if(!preflight.accepted){setNotice("文件预检未通过。请重新选择较小的一批文件。");return;}
  if(!globalThis.crypto?.subtle){setNotice("此设备的 SHA-256 接口不可用。");return;}
  const signal=new AbortController();
  scanController.current=signal;
  setBusy(true);setNotice("");setProgress({done:0,total:incoming.length});
  try{
   const next:FileInspection[]=[];
   for(const [index,file] of incoming.entries()){
    if(signal.signal.aborted)throw new DOMException("已取消扫描。","AbortError");
    setCurrentFile(file.name);
    const magic=fileKind(new Uint8Array(await file.slice(0,16).arrayBuffer()));
    if(signal.signal.aborted)throw new DOMException("已取消扫描。","AbortError");
    // WebCrypto digest is atomic; cancellation takes effect between files.
    const sha256=hexDigest(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
    if(signal.signal.aborted)throw new DOMException("已取消扫描。","AbortError");
    const extension=file.name.includes(".")?(file.name.split(".").pop()??"").toLowerCase():"";
    next.push({name:file.name,size:file.size,kind:magic,sha256,extension,
     mismatch:mismatchedExtension(magic,file.name)});
    setProgress({done:index+1,total:incoming.length});
   }
   if(signal.signal.aborted)throw new DOMException("已取消扫描。","AbortError");
   setRows(next);setStaged([]);
   setFilter("all");
   setNotice("检查完成。文件只在本机读取用于计算哈希；没有上传或修改原文件。");
  }catch(error){
   if(signal.signal.aborted||(error instanceof Error&&error.name==="AbortError"))
    setNotice("已取消：保留原有扫描结果，尚未完成的这批文件不会加入清单。");
   else setNotice("检查未完成："+(error instanceof Error?error.message:String(error)));
  }finally{
   if(scanController.current===signal)scanController.current=null;
   setBusy(false);setCurrentFile("");
  }
 }
 function selectFiles(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  stage(selected);
 }
 function dropFiles(event:DragEvent<HTMLDivElement>){
  event.preventDefault();setDragging(false);
  stage(Array.from(event.dataTransfer.files));
 }
 async function exportManifest(){
  try{
   const encoded=createChecksumManifest(rows);
   const success=await exportFile("universal-box-sha256-manifest.json",encoded);
   setNotice(success?"校验清单已保存。可把它和文件一起交给另一台电脑进行验证。":"已取消清单导出。");
  }catch(error){setNotice("校验清单导出失败："+(error instanceof Error?error.message:String(error)));}
 }
 async function importManifest(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  setManifest(null);setManifestError("");setManifestName("");
  try{
   if(file.size>256_000)throw Error("清单超过 256 KB 上限。");
   const content=await file.text();
   const parsed=parseChecksumManifest(content);
   setManifest(parsed);setManifestName(file.name);
   setNotice("本地导入校验清单完成；此操作不会自动读取任何磁盘路径。");
  }catch(error){setManifestError(error instanceof Error?error.message:String(error));}
 }
 async function exportInventory(){
  try{
   const success=await exportFile("universal-box-file-inventory.csv",inventoryCsv(rows));
   setNotice(success?"CSV 清单已导出。原文件没有改变。":"已取消导出。");
  }catch(error){setNotice("导出失败："+(error instanceof Error?error.message:String(error)));}
 }
 const term=search.trim().toLocaleLowerCase();
 const visible=rows.filter(row=>
  (filter==="all"||(filter==="mismatch"?row.mismatch:duplicateNames.has(row)))
  &&(!term||(row.name+" "+row.kind+" "+row.sha256).toLocaleLowerCase().includes(term))
 ).sort((a,b)=>sort==="size"?b.size-a.size||a.name.localeCompare(b.name):
  sort==="kind"?a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
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
   <h3>拖入文件，先预检，再开始扫描</h3>
   <p className="subtle">只读取你选择的文件 · 最多 80 个 · 每个 ≤64 MB · 单批 ≤160 MB</p>
   <input ref={inputRef} type="file" multiple className="sr-only"
    aria-label="选择文件进行本地格式与哈希检查" onChange={selectFiles} tabIndex={-1}/>
   <button type="button" className="primary-button" disabled={busy}
    onClick={()=>inputRef.current?.click()}>选择文件</button>
  </div>
  {staged.length>0&&!busy&&<div className="ub-intake-review" aria-label="Scan review">
   <div className="ub-intake-review-heading">
    <div><p className="eyebrow">STEP 1 / 2 · 导入前确认</p>
     <h3>已选择 {review.files} 个文件 · {sizeLabel(review.totalBytes)}</h3>
     <p className="subtle">{review.accepted?"容量预检通过。请核对异常提示，确认后开始哈希扫描。":"文件数量或大小超出上限，请重新选择。"} 文件内容尚未被扫描。</p></div>
    <div className="actions">
     <button type="button" className="primary-button" disabled={!review.accepted} onClick={()=>void inspect()}>开始本机扫描 →</button>
     <button type="button" className="secondary-button" onClick={()=>{setStaged([]);setNotice("已取消本次选择，原有文件清单未改变。");}}>取消选择</button>
    </div>
   </div>
   <div className="ub-intake-stage-list" role="list" aria-label="Files pending local scan" data-testid="intake-staged-list" style={{maxHeight:360,overflowY:"auto"}}>
    {staged.map((file,index)=><div key={index} role="listitem" dir="auto"
      data-testid="intake-staged-row" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
     <span style={{flex:"1 1 180px",overflowWrap:"anywhere"}}>{file.name}</span>
     <small>{sizeLabel(file.size)}</small>
     <button type="button" className="secondary-button"
       aria-label={"从本次扫描排除第 "+(index+1)+" 个文件："+file.name}
       onClick={()=>excludeStaged(index)}>排除</button>
    </div>)}
    <p className="subtle">所有已选择文件均列出。仅从本次扫描清单中排除，不删除或更改磁盘文件。</p>
   </div>
   {review.issues.length>0&&<div className="ub-intake-review-warnings" role="status">
    <strong>请检查以下提示（并非病毒检测结果）</strong>
    {review.issues.slice(0,10).map((issue,index)=><p key={index} dir="auto">{issue.name?"「"+issue.name+"」：":""}{issue.message}</p>)}
    {review.issues.length>10&&<p>其余 {review.issues.length-10} 条提醒未展开。</p>}
   </div>}
  </div>}
  {busy&&<div className="ub-intake-progress" role="status">
   <span>STEP 2 / 2 · 计算 SHA-256：{progress.done} / {progress.total}
    {currentFile&&<small dir="auto" className="ub-intake-current">正在处理：{currentFile}</small>}
    <small className="ub-intake-current">取消会在当前文件哈希计算结束后生效。</small>
   </span>
   <progress value={progress.done} max={progress.total||1} aria-label="Local file inspection progress"/>
   <button type="button" className="secondary-button" onClick={()=>scanController.current?.abort()}>取消扫描</button>
  </div>}
  {notice&&<p className="subtle" role="status">{notice}</p>}
  <div className="ub-intake-metrics" aria-label="Inspection summary">
   <div><span>检查文件</span><strong>{rows.length}</strong></div>
   <div><span>总数据量</span><strong>{sizeLabel(total)}</strong></div>
   <div><span>重复组</span><strong>{duplicates.length}</strong></div>
   <div><span>格式提醒</span><strong>{warnings.length}</strong></div>
  </div>
  {rows.length>0&&<>
   <div className="ub-intake-types" aria-label="File types by count">
    <div className="ub-intake-types-heading"><strong>文件类型概览</strong><span className="subtle">按文件数量统计，不代表文件安全性</span></div>
    <div className="ub-intake-types-grid">
     {kindTotals.map(item=><div className="ub-intake-type" key={item.kind}>
      <div><strong>{item.kind}</strong><span>{item.count} 个 · {sizeLabel(item.bytes)}</span></div>
      <div className="ub-intake-type-track" aria-hidden="true"><span style={{width:(item.count/rows.length*100)+"%"}}/></div>
     </div>)}
    </div>
   </div>
   <div className="ub-intake-bar">
    <div className="pill-row" role="group" aria-label="File inspection filters">
     {([["all","全部"],["duplicates","重复"],["mismatch","格式提醒"]] as const).map(([key,label])=>
      <button key={key} className={filter===key?"pill active-pill":"pill"} type="button"
       aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}
    </div>
    <div className="actions">
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>void exportInventory()}>导出 CSV 清单</button>
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>void exportManifest()}>导出 SHA-256 校验清单</button>
     <button className="secondary-button" type="button" disabled={busy} onClick={()=>{setRows([]);setNotice("清单已清空，没有删除磁盘文件。");}}>清空列表</button>
    </div>
   </div>
   <div className="ub-intake-searchline">
    <label className="field-label">查找文件或 SHA-256
     <input className="field" value={search} onChange={event=>setSearch(event.target.value)}
      placeholder="文件名、类型或哈希片段" aria-label="查找文件或哈希"/>
    </label>
    <label className="field-label">排序
     <select className="field" value={sort} onChange={event=>setSort(event.target.value as "name"|"size"|"kind")}>
      <option value="name">文件名</option><option value="size">文件大小（降序）</option><option value="kind">文件类型</option>
     </select>
    </label>
   </div>
   <p className="subtle">当前显示 {visible.length} / {rows.length} 个文件</p>
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
  <div className="ub-intake-verification">
   <p className="eyebrow">VERIFY FILE TRANSFERS · 跨设备完整性校验</p>
   <h3>验证另一台电脑接收到的文件</h3>
   <p className="subtle">在原电脑导出 SHA-256 JSON 清单，把清单和文件一起传给另一台电脑。在接收电脑重新扫描文件，再导入清单：逐个核对文件名、字节数和哈希值。不会自动打开清单中写的路径。</p>
   <label className="field-label">导入 Sentinel Box SHA-256 校验清单（JSON，≤256 KB）
    <input className="field" type="file" accept=".json,application/json" onChange={event=>void importManifest(event)}/>
   </label>
   {manifestError&&<p role="alert" className="ub-intake-warning">{manifestError}</p>}
   {compare&&<>
    <div className="ub-intake-verify-summary">
     <strong>{manifestName}</strong>
     <span>通过 {compare.counts.match}</span>
     <span>内容改变 {compare.counts.changed}</span>
     <span>缺失 {compare.counts.missing}</span>
     <span>同名冲突 {compare.counts.ambiguous}</span>
     <span>清单外文件 {compare.counts.extra}</span>
    </div>
    <div className="ub-intake-verify-results" role="list" aria-label="Checksum comparison results">
     {compare.entries.map((entry,index)=><div role="listitem" key={entry.name+"-"+index} className="ub-intake-verify-row">
      <span className={"ub-intake-result "+entry.status}>{compareLabels[entry.status]}</span>
      <span title={entry.name}>{entry.name}</span>
     </div>)}
    </div>
    <p className="subtle">完整性通过不等于文件安全；此检查不包含防病毒扫描或文件来源认证。</p>
    <button className="secondary-button" type="button" onClick={()=>{setManifest(null);setManifestName("");setManifestError("");}}>清除比对结果</button>
   </>}
  </div>
  <div className="ub-intake-actions">
   <p className="eyebrow">NEXT STEP · 接下来做什么？</p>
   <div className="ub-intake-action-grid">
    <button type="button" onClick={()=>onOpenTool("pdf-mini","links")}><span>▣</span><strong>编辑 PDF 链接</strong><small>批量替换 · 区域框选</small></button>
    <button type="button" onClick={()=>onOpenTool("files","images")}><span>▧</span><strong>处理图片</strong><small>缩放 · 裁剪 · 格式转换</small></button>
    <button type="button" onClick={()=>onOpenTool("workflows","zip-selective")}><span>▤</span><strong>ZIP 文件工具</strong><small>查看 · 安全提取 · 重新打包</small></button>
    <button type="button" onClick={()=>onOpenTool("commons")}><span>⇄</span><strong>加密发送与团队协作</strong><small>局域网 · 离线空间</small></button>
    <button type="button" onClick={()=>onOpenTool("binary-compare")}><span>≠</span><strong>精确比较两个文件</strong><small>逐字节核对 · 差异分布图 · JSON 报告</small></button>
   </div>
   <p className="subtle">进入下一工具后，请在那里重新选择原文件；本工作台不会跨工具保存或传递原文件内容，以避免意外暴露。</p>
  </div>
 </section>;
}
