/** Local-only folder snapshot from browser-supplied metadata, never file contents. */
export type FolderInput = {
  name: string; size: number; lastModified: number; webkitRelativePath?: string;
};
export type FolderRecord = {
  path: string; name: string; extension: string; size: number; modified: string;
};
export type FolderSnapshot = {
  files: FolderRecord[]; folders: string[]; totalBytes: number;
};
export const FOLDER_MAX_FILES=1000;
export const FOLDER_MAX_DEPTH=25;
const maxName=255,maxPath=1024;

function checkPart(value:string):void{
  if(!value||value==="."||value===".."||value.length>maxName||
     /[\\\u0000-\u001f\u007f]/u.test(value)||
     value.startsWith("/")||value.includes(":"))
    throw Error("A selected file or folder has an invalid relative path.");
}
function safePath(file:FolderInput):string{
  const raw=file.webkitRelativePath||file.name;
  if(!raw||raw.length>maxPath||raw.startsWith("/")||raw.includes("//"))
    throw Error("A file path is empty, absolute or too long.");
  const pieces=raw.split("/");
  if(pieces.length>FOLDER_MAX_DEPTH+1)throw Error("Folder nesting exceeds 25 levels.");
  for(const part of pieces)checkPart(part);
  if(pieces[pieces.length-1]!==file.name)
    throw Error("Folder metadata does not match the selected filename.");
  return pieces.join("/");
}
export function makeFolderSnapshot(inputs:readonly FolderInput[]):FolderSnapshot{
  if(!inputs.length||inputs.length>FOLDER_MAX_FILES)
    throw Error("Choose a folder containing 1–1,000 files.");
  const seen=new Set<string>(),folders=new Set<string>(),files:FolderRecord[]=[];
  let totalBytes=0;
  for(const file of inputs){
    if(!Number.isSafeInteger(file.size)||file.size<0||
       !Number.isFinite(file.lastModified)||file.lastModified<0)
       throw Error("A selected file has invalid size or modification time.");
    const path=safePath(file);
    if(seen.has(path))throw Error("Duplicate relative file path: "+path);
    seen.add(path);
    const parts=path.split("/");
    for(let i=1;i<parts.length;i++)folders.add(parts.slice(0,i).join("/"));
    const name=parts[parts.length-1];
    const dot=name.lastIndexOf(".");
    const extension=dot>0?name.slice(dot+1).toLocaleLowerCase("en-US"):"";
    const modified=new Date(file.lastModified);
    if(Number.isNaN(modified.getTime()))throw Error("Invalid modification date.");
    files.push({path,name,extension,size:file.size,modified:modified.toISOString()});
    totalBytes+=file.size;
    if(!Number.isSafeInteger(totalBytes))throw Error("Combined file size exceeds safe integer range.");
  }
  files.sort((a,b)=>a.path.localeCompare(b.path,"en",{numeric:true}));
  return {files,folders:[...folders].sort((a,b)=>a.localeCompare(b,"en",{numeric:true})),totalBytes};
}
function escapeMd(source:string):string{
  return source.replace(/([\\`*_{}\[\]<>|])/gu,"\\$1").replace(/&/gu,"&amp;");
}
/** Tree view from paths only; does not open, hash, or decode files. */
export function folderTreeMarkdown(snapshot:FolderSnapshot):string{
  const lines=["# 本地文件夹目录清单","","文件："+snapshot.files.length+" 个 · 子目录："+countSubfolders(snapshot)+" 个 · 共 "+snapshot.totalBytes+" bytes",""];
  const nodes=[
    ...snapshot.folders.map(path=>({path,folder:true})),
    ...snapshot.files.map(file=>({path:file.path,folder:false})),
  ].sort((a,b)=>{
    const ap=a.path.split("/"),bp=b.path.split("/");
    for(let i=0;i<Math.min(ap.length,bp.length);i++){
      if(ap[i]!==bp[i])return ap[i].localeCompare(bp[i],"en",{numeric:true});
    }
    return ap.length-bp.length;
  });
  for(const node of nodes){
    const parts=node.path.split("/");
    const label=escapeMd(parts[parts.length-1]);
    const meta=node.folder?"/":" ("+snapshot.files.find(x=>x.path===node.path)!.size+" bytes)";
    lines.push("  ".repeat(parts.length-1)+"- "+label+meta);
  }
  return lines.join("\n")+"\n";
}
function csvCell(value:string):string{
  // Prefix potentially executable formulas in spreadsheet apps, including whitespace-prefixed input.
  const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/gu,'""')+'"';
}
export function folderInventoryCsv(snapshot:FolderSnapshot):string{
  const rows=snapshot.files.map((file,index)=>[
    String(index+1),csvCell(file.path),csvCell(file.name),
    csvCell(file.extension),String(file.size),csvCell(file.modified),
  ].join(","));
  return "\uFEFFindex,relative_path,file_name,extension,size_bytes,modified_utc\r\n"+
    rows.join("\r\n")+(rows.length?"\r\n":"");
}
/** Excludes the selected folder's own label; only nested directories are counted. */
export function countSubfolders(snapshot:FolderSnapshot):number{
 const first=snapshot.files[0]?.path.split("/")[0]??"";
 const selectedRoot=!!first&&snapshot.files.every(item=>item.path.startsWith(first+"/"));
 const hasRoot=selectedRoot&&snapshot.folders.includes(first);
 return snapshot.folders.length-(hasRoot?1:0);
}
export function folderExtensionSummary(snapshot:FolderSnapshot):{extension:string;count:number;bytes:number}[]{
  const counts=new Map<string,{count:number;bytes:number}>();
  for(const file of snapshot.files){
    const key=file.extension||"(no extension)";
    const prev=counts.get(key)||{count:0,bytes:0};
    counts.set(key,{count:prev.count+1,bytes:prev.bytes+file.size});
  }
  return [...counts].map(([extension,value])=>({extension,...value}))
    .sort((a,b)=>b.bytes-a.bytes||a.extension.localeCompare(b.extension));
}
