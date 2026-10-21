/** Check Markdown links only against explicitly selected local paths; never fetch network URLs. */
import {mergedCsvExport} from "./csvMerge";
export type LocalLinkFile={path:string;markdown?:string};
export type LinkCheck={source:string;line:number;target:string;resolved:string;status:"ok"|"missing"|"external"|"anchor"|"unsafe"};
export type MarkdownAudit={files:number;markdownFiles:number;references:LinkCheck[];broken:number;unsafe:number};
function cleanPath(path:string):string{
 const chunks=path.replace(/\\/gu,"/").split("/"),result:string[]=[];
 for(const part of chunks){
  if(!part||part===".")continue;
  if(part===".."){if(!result.length)throw Error("Path traverses outside explicitly selected files.");result.pop();continue;}
  if(/[\u0000-\u001f\u007f]/u.test(part))throw Error("Unsupported control character in file path.");
  result.push(part);
 }
 if(!result.length||result.join("/").length>600)throw Error("Empty or excessive selected file path.");
 return result.join("/");
}
function markdownContent(source:string):{line:number;text:string}[]{
 const result:{line:number;text:string}[]=[];
 let fenced=false;
 source.replace(/\r\n?/gu,"\n").split("\n").forEach((line,i)=>{
  if(/^\s*(```|~~~)/u.test(line)){fenced=!fenced;return;}
  if(!fenced)result.push({line:i+1,text:line.replace(/`[^`]*`/gu,"")});
 });
 return result;
}
function urlTarget(raw:string):string{
 let value=raw.trim().replace(/^<([^<>]+)>$/u,"$1");
 const title=/^(\S+)\s+(?:"[^"]*"|'[^']*')$/u.exec(value);
 if(title)value=title[1];
 return value;
}
export function auditMarkdownLocalLinks(files:readonly LocalLinkFile[]):MarkdownAudit{
 if(files.length<1||files.length>100)throw Error("Select 1–100 Markdown / asset files.");
 const paths=new Map<string,LocalLinkFile>();let markdownFiles=0,total=0;
 for(const file of files){
  const path=cleanPath(file.path);
  if(paths.has(path))throw Error("Duplicate selected file path: "+path);
  if(file.markdown!==undefined){
   if(!/\.md(?:own)?$/iu.test(path))throw Error("Only Markdown files may supply text.");
   if(file.markdown.length>100_000)throw Error("Markdown file exceeds 100,000 characters.");
   total+=file.markdown.length;markdownFiles++;
  }
  paths.set(path,file);
 }
 if(total>400_000||!markdownFiles)throw Error("Select at least one .md file (max 400,000 characters combined).");
 const references:LinkCheck[]=[];
 for(const [source,file] of paths){
  if(file.markdown===undefined)continue;
  const lines=markdownContent(file.markdown);
  const definitions=new Map<string,string>();
  for(const {text} of lines){
   const d=/^\s{0,3}\[([^\]]{1,150})\]:\s*(\S+)/u.exec(text);
   if(d)definitions.set(d[1].toLowerCase(),urlTarget(d[2]));
  }
  for(const {line,text} of lines){
   const add=(target:string)=>{
    if(references.length>=2000)throw Error("Markdown link audit supports up to 2,000 references.");
    const raw=target.trim();let resolved="",status:LinkCheck["status"]="unsafe";
    if(raw){
     if(raw.startsWith("#")){status="anchor";resolved=source;}
     else if(/^(?:https?:|mailto:|tel:|ftp:|data:|\/\/)/iu.test(raw)){status="external";resolved=raw;}
     else if(!raw.startsWith("/")&&!/^[a-z][a-z0-9+.-]*:/iu.test(raw)){
      try{
       const relative=decodeURIComponent(raw.split(/[?#]/u)[0]);
       if(!relative||relative.includes("\\"))throw Error("Invalid relative link.");
       const base=source.split("/");base.pop();
       resolved=cleanPath([...base,relative].join("/"));
       status=paths.has(resolved)?"ok":"missing";
      }catch{status="unsafe";}
     }
    }
    references.push({source,line,target:raw,resolved,status});
   };
   for(const m of text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^<>]{1,1000}>|[^\s)]{1,1000}(?:\s+"[^"]{0,150}")?)\s*\)/gu)){
    add(urlTarget(m[1]));
   }
   for(const m of text.matchAll(/!?\[([^\]\n]{1,150})\]\[([^\]\n]{0,150})\]/gu)){
    const key=(m[2]||m[1]).toLowerCase(),target=definitions.get(key);
    if(target)add(target);
    else references.push({source,line,target:"["+key+"]",resolved:"",status:"missing"});
   }
  }
 }
 return {files:files.length,markdownFiles,references,
  broken:references.filter(r=>r.status==="missing").length,
  unsafe:references.filter(r=>r.status==="unsafe").length};
}
export function markdownAuditCsv(report:MarkdownAudit):string{
 return "\uFEFF"+mergedCsvExport({headers:["source","line","status","target","resolved"],rows:
  report.references.map(r=>[r.source,String(r.line),r.status,r.target,r.resolved])});
}
