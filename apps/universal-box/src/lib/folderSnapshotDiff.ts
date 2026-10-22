import type {FolderSnapshot,FolderRecord} from "./folderInventory";

/** Metadata snapshot comparison: same metadata does not prove identical file content. */
export type SnapshotStatus="added"|"removed"|"changed"|"unchanged";
export type SnapshotChange={
 path:string;status:SnapshotStatus;reason:string;
 beforeSize:number|null;afterSize:number|null;
 beforeModified:string;afterModified:string;
};
export type SnapshotDiff={
 beforeCount:number;afterCount:number;beforeBytes:number;afterBytes:number;
 added:number;removed:number;changed:number;unchanged:number;
 changes:SnapshotChange[];
};

/** The first common ancestor of one folder chooser selection is the chosen folder label.
 * Strip it only when EVERY file includes it, so different root folder names compare correctly.
 * For ordinary multiple-file selections paths remain as provided.
 */
export function normalizeSnapshot(snapshot:FolderSnapshot):Map<string,FolderRecord>{
 if(!snapshot.files.length||snapshot.files.length>1000)
  throw Error("Each snapshot must contain 1–1,000 files.");
 const first= snapshot.files[0].path.split("/")[0];
 const allHaveRoot=snapshot.files.every(file=>file.path.startsWith(first+"/"));
 const result=new Map<string,FolderRecord>();
 for(const file of snapshot.files){
  const path=allHaveRoot?file.path.slice(first.length+1):file.path;
  if(!path||path==="."||path.startsWith("/")||path.split("/").includes("..")||result.has(path))
   throw Error("A folder snapshot has ambiguous or repeated relative paths.");
  if(!Number.isSafeInteger(file.size)||file.size<0||
     !file.modified||Number.isNaN(Date.parse(file.modified)))
   throw Error("Folder snapshot contains invalid file metadata.");
  result.set(path,{...file,path});
 }
 return result;
}
export function compareFolderSnapshots(before:FolderSnapshot,after:FolderSnapshot):SnapshotDiff{
 const old=normalizeSnapshot(before),fresh=normalizeSnapshot(after);
 const names=new Set([...old.keys(),...fresh.keys()]);
 const paths=[...names].sort((a,b)=>a.localeCompare(b,"en",{numeric:true}));
 const changes:SnapshotChange[]=[];
 let added=0,removed=0,changed=0,unchanged=0;
 for(const path of paths){
  const a=old.get(path),b=fresh.get(path);
  let status:SnapshotStatus,reason:string;
  if(!a){status="added";reason="仅新快照存在";added++;}
  else if(!b){status="removed";reason="仅旧快照存在";removed++;}
  else if(a.size!==b.size||a.modified!==b.modified){
   status="changed";changed++;
   reason=a.size!==b.size&&a.modified!==b.modified?"大小及修改时间变化":
    a.size!==b.size?"大小变化":"修改时间变化";
  }else{status="unchanged";reason="大小与修改时间相同，未验证内容";unchanged++;}
  changes.push({
   path,status,reason,beforeSize:a?.size??null,afterSize:b?.size??null,
   beforeModified:a?.modified??"",afterModified:b?.modified??"",
  });
 }
 return {beforeCount:old.size,afterCount:fresh.size,beforeBytes:before.totalBytes,
  afterBytes:after.totalBytes,added,removed,changed,unchanged,changes};
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function exportFolderDiffCsv(diff:SnapshotDiff,includeUnchanged=true):string{
 const changes=includeUnchanged?diff.changes:diff.changes.filter(x=>x.status!=="unchanged");
 if(changes.length>2000)throw Error("Too many entries to export.");
 const rows=changes.map(x=>[
  csvCell(x.status),csvCell(x.path),csvCell(x.reason),
  x.beforeSize===null?"":String(x.beforeSize),
  x.afterSize===null?"":String(x.afterSize),
  csvCell(x.beforeModified),csvCell(x.afterModified),
 ].join(","));
 return "\uFEFFstatus,relative_path,reason,before_size_bytes,after_size_bytes,before_modified_utc,after_modified_utc\r\n"+
  rows.join("\r\n")+(rows.length?"\r\n":"");
}
