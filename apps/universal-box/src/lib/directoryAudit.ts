/** File metadata inventory for an explicitly user-selected directory or file set. No bytes read. */
export type DirectoryEntry={name:string;relativePath:string;size:number};
export type DirectoryGroup={path:string;bytes:number;files:number};
export type DirectoryAudit={files:number;bytes:number;folders:number;groups:DirectoryGroup[];extensions:DirectoryGroup[];largest:{name:string;size:number}[]};
function clean(path:string):string{
 if(!path||path.length>1000||/[\u0000-\u001f\u007f]/u.test(path))throw Error("Unsupported file path.");
 const pieces=path.replace(/\\/gu,"/").split("/");
 if(pieces.some(p=>!p||p==="."||p===".."))throw Error("A file path is unsafe or ambiguous.");
 return pieces.join("/");
}
export function auditDirectory(entries:readonly DirectoryEntry[]):DirectoryAudit{
 if(entries.length<1||entries.length>2500)throw Error("Select 1–2,500 files for inventory.");
 const group=new Map<string,DirectoryGroup>(),extension=new Map<string,DirectoryGroup>();
 const largest:{name:string;size:number}[]=[];let bytes=0;
 const seen=new Set<string>();
 for(const item of entries){
  if(!Number.isSafeInteger(item.size)||item.size<0||item.size>2_000_000_000_000)throw Error("Invalid or overly large file size.");
  const path=clean(item.relativePath||item.name);
  if(seen.has(path))throw Error("Repeated file path is ambiguous: "+path);
  seen.add(path);bytes+=item.size;
  if(!Number.isSafeInteger(bytes)||bytes>10_000_000_000_000)throw Error("Selection exceeds 10 TB metadata limit.");
  const segments=path.split("/");
  const folder=segments.length===1?"(selected files)":segments.slice(0,-1).join("/");
  const parts=segments[segments.length-1].split(".");
  const ext=parts.length>1&&parts.at(-1)? "."+parts.at(-1)!.toLowerCase():"(no extension)";
  for(const [map,key] of [[group,folder],[extension,ext]] as const){
   const current=map.get(key)??{path:key,bytes:0,files:0};
   current.bytes+=item.size;current.files++;map.set(key,current);
  }
  largest.push({name:path,size:item.size});
 }
 const sort=(items:Map<string,DirectoryGroup>)=>[...items.values()].sort((a,b)=>b.bytes-a.bytes||a.path.localeCompare(b.path));
 largest.sort((a,b)=>b.size-a.size||a.name.localeCompare(b.name));
 return {files:entries.length,bytes,folders:group.size,groups:sort(group),extensions:sort(extension),largest:largest.slice(0,20)};
}
function neutralize(s:string):string{return /^[\s\uFEFF]*[=+@\-]/u.test(s)?"'"+s:s;}
function csv(rows:string[][]):string{return "\uFEFF"+rows.map(r=>r.map(v=>'"'+neutralize(v).replace(/"/gu,'""')+'"').join(",")).join("\r\n")+"\r\n";}
export function directoryAuditCsv(audit:DirectoryAudit):string{
 return csv([["category","name","bytes","files"],...audit.groups.map(x=>["folder",x.path,String(x.bytes),String(x.files)]),
  ...audit.extensions.map(x=>["extension",x.path,String(x.bytes),String(x.files)])]);
}
function xml(s:string):string{return s.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;").replace(/"/gu,"&quot;");}
export function directoryAuditSvg(audit:DirectoryAudit):string{
 const groups=audit.groups.slice(0,20);const width=960,height=96+groups.length*35;
 const max=Math.max(1,...groups.map(g=>g.bytes));
 const markup=groups.map((g,i)=>{
  const y=78+i*35,w=Math.max(2,Math.round(g.bytes/max*430));
  const label=g.path.length>38?g.path.slice(0,35)+"…":g.path;
  return '<text x="20" y="'+(y+17)+'" fill="#dce8f9" font-size="13">'+xml(label)+'</text>'
   +'<rect x="345" y="'+y+'" width="'+w+'" height="20" rx="4" fill="#4da5df"/>'
   +'<text x="'+(355+w)+'" y="'+(y+16)+'" fill="#eef6ff" font-size="12">'+(g.bytes/1_000_000).toFixed(2)+' MB · '+g.files+' files</text>';
 }).join("");
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'
  +'<rect width="100%" height="100%" fill="#142238"/><text x="20" y="40" font-size="23" font-family="sans-serif" fill="#f2f8ff">Selected folder sizes (metadata only)</text>'
  +'<g font-family="sans-serif">'+markup+'</g></svg>';
}
