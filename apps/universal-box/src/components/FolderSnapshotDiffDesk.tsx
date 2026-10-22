import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {makeFolderSnapshot,type FolderSnapshot} from "../lib/folderInventory";
import {compareFolderSnapshots,exportFolderDiffCsv,type SnapshotDiff, type SnapshotStatus} from "../lib/folderSnapshotDiff";

const message=(e:unknown)=>e instanceof Error?e.message:String(e);
type Slot="before"|"after";
const labels:{slot:Slot;label:string}[]=[
 {slot:"before",label:"旧快照 · Before"},
 {slot:"after",label:"新快照 · After"},
];
export default function FolderSnapshotDiffDesk(){
 const [before,setBefore]=useState<FolderSnapshot|null>(null);
 const [after,setAfter]=useState<FolderSnapshot|null>(null);
 const [beforeLabel,setBeforeLabel]=useState("");
 const [afterLabel,setAfterLabel]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [onlyChanges,setOnlyChanges]=useState(true);
 const compare=useMemo<{diff:SnapshotDiff|null;error:string}>(()=>{
  if(!before||!after)return {diff:null,error:""};
  try{return {diff:compareFolderSnapshots(before,after),error:""};}
  catch(e){return {diff:null,error:message(e)};}
 },[before,after]);
 const diff=compare.diff;
 const filtered=useMemo(()=>diff?(onlyChanges?diff.changes.filter(x=>x.status!=="unchanged"):diff.changes):[],[diff,onlyChanges]);
 const badgeText:Record<SnapshotStatus,string>={added:"新增",removed:"删除",changed:"元数据变化",unchanged:"元数据相同"};

 async function choose(event:ChangeEvent<HTMLInputElement>,slot:Slot){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";
  if(busy||!files.length)return;
  setBusy(true);setStatus("");
  try{
   // Browser folder picker provides File metadata without requiring file.arrayBuffer().
   const result=makeFolderSnapshot(files);
   const commonRoot=result.files[0]?.path.split("/")[0]||"";
   const rootPresent=!!commonRoot&&result.files.every(x=>x.path.startsWith(commonRoot+"/"));
   const label=(rootPresent?commonRoot:files.length+" selected files").slice(0,255);
   if(slot==="before"){setBefore(result);setBeforeLabel(label);}
   else{setAfter(result);setAfterLabel(label);}
   setStatus((slot==="before"?"旧":"新")+"快照记录了 "+result.files.length+
    " 份文件的路径、大小和修改时间；没有打开或复制文件正文。");
  }catch(e){
   setStatus("新快照读取失败，之前的有效快照已保留："+message(e));
  }finally{setBusy(false);}
 }
 async function save(){
  if(!diff||busy)return;
  setBusy(true);setStatus("");
  try{
   const content=exportFolderDiffCsv(diff,!onlyChanges);
   const result=await exportFile("sentinel-folder-snapshot-diff.csv",content);
   setStatus(result?"已保存 "+filtered.length+" 行元数据比较报告；两个源目录没有被修改。":"已取消保存，结果仍在。");
  }catch(e){setStatus("导出失败："+message(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="folder-snapshot-diff">
  <p className="eyebrow">SENTINEL BOX · ROADMAP PHASE 2 · FILE AUDIT</p>
  <h2>文件夹快照差异 · Folder Snapshot Diff</h2>
  <p className="subtle">分别选择<strong>整理前</strong>和<strong>整理后</strong>的文件夹，按相对路径比较新增、删除及大小/修改时间变化。可对比两个不同名称的根文件夹；只读取文件元数据，不会打开文件内容或更改源文件。</p>
  <p className="subtle">提示：这是<strong>元数据对比，不是 SHA-256 内容校验</strong>。大小和修改时间完全相同时，内容仍有可能改变；复制文件时仅修改时间变化也可能被报告。空文件夹通常不会出现在浏览器文件选择器的结果中。</p>
  <div className="tools-pair">
   {labels.map(item=><div className="panel" key={item.slot}>
    <h3>{item.label}</h3>
    <label className="field-label">选择整个文件夹（最多 1,000 个文件）
     <input className="field" type="file" multiple disabled={busy}
      data-testid={"snapshot-"+item.slot+"-folder"}
      {...{"webkitdirectory":""}} onChange={e=>void choose(e,item.slot)}/>
    </label>
    <label className="field-label">回退：多选文件（无法保留目录层级）
     <input className="field" type="file" multiple disabled={busy}
      data-testid={"snapshot-"+item.slot+"-files"} onChange={e=>void choose(e,item.slot)}/>
    </label>
    <p className="subtle" data-testid={"snapshot-"+item.slot+"-stats"}>
     {item.slot==="before"&&before?beforeLabel+" · "+before.files.length+" 文件 · "+before.totalBytes.toLocaleString()+" bytes":
      item.slot==="after"&&after?afterLabel+" · "+after.files.length+" 文件 · "+after.totalBytes.toLocaleString()+" bytes":
      "尚未选择"}
    </p>
   </div>)}
  </div>
  {compare.error&&<p role="alert">{compare.error}</p>}
  {diff&&<>
   <div data-testid="snapshot-diff-stats" className="metrics">
    <span>新增：{diff.added}</span><span>删除：{diff.removed}</span>
    <span>元数据变化：{diff.changed}</span><span>元数据相同：{diff.unchanged}</span>
   </div>
   <p className="subtle">旧快照 {diff.beforeCount} 文件 / {diff.beforeBytes.toLocaleString()} bytes · 新快照 {diff.afterCount} 文件 / {diff.afterBytes.toLocaleString()} bytes</p>
   <label className="field-label">
    <input type="checkbox" data-testid="snapshot-only-changes" checked={onlyChanges}
     onChange={e=>setOnlyChanges(e.target.checked)}/> 只显示和导出新增、删除及元数据变化（默认）
   </label>
   <div className="actions">
    <button className="primary-button" type="button" data-testid="snapshot-export"
     disabled={busy} onClick={()=>void save()}>导出当前比较 CSV</button>
    <button className="secondary-button" type="button" data-testid="snapshot-clear"
     disabled={busy} onClick={()=>{setBefore(null);setAfter(null);setBeforeLabel("");setAfterLabel("");setStatus("已清空会话快照；未删除或修改任何文件。");}}>清空两个快照</button>
   </div>
   <p className="subtle" data-testid="snapshot-showing">当前结果 {filtered.length} 条。预览最多 100 条，CSV 包含全部已筛选条目。</p>
   <div className="task-list" data-testid="snapshot-diff-rows">
    {filtered.slice(0,100).map(item=><div className="task-row" key={item.path}>
     <span className="task-copy">{badgeText[item.status]} · {item.path} · {item.reason} · {item.beforeSize??"—"} → {item.afterSize??"—"} bytes</span>
    </div>)}
    {!filtered.length&&<p className="subtle">两份快照没有发现可由文件元数据证明的差异。</p>}
   </div>
  </>}
  {status&&<p role="status" className="subtle" data-testid="snapshot-status">{status}</p>}
 </section>;
}
