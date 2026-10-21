/** Import only user-selected Netscape-style browser bookmark HTML, never execute it. */
import {mergedCsvExport} from "./csvMerge";
export type Bookmark={title:string;url:string;host:string};
const decodeEntities=(value:string)=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/giu,(_,entity:string)=>{
 const key=entity.toLowerCase(),named:Record<string,string>={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "};
 if(named[key]!==undefined)return named[key];
 const num=key.startsWith("#x")?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
 return num>0&&num<=0x10ffff&&(num<0xd800||num>0xdfff)?String.fromCodePoint(num):"";
});
export function readBookmarksHtml(source:string):{entries:Bookmark[];rejected:number;duplicates:number}{
 if(!source.trim()||source.length>1_000_000)throw Error("Bookmark HTML must be 1–1,000,000 characters.");
 const re=/<a\b([^>]{0,4000})>([\s\S]{0,2000}?)<\/a\s*>/giu;
 const entries:Bookmark[]=[],seen=new Set<string>();
 let rejected=0,duplicates=0,found=0;
 for(const match of source.matchAll(re)){
  found++;if(found>4000)throw Error("Maximum 4,000 bookmark entries.");
  const href=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/iu.exec(match[1]);
  const raw=decodeEntities(href?.[1]??href?.[2]??"").trim();
  let url:URL;
  try{url=new URL(raw);}catch{rejected++;continue;}
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.href.length>3000){rejected++;continue;}
  const name=decodeEntities(match[2].replace(/<[^>]{0,500}>/gu," ")).replace(/\s+/gu," ").trim().slice(0,200)||url.hostname;
  if(seen.has(url.href)){duplicates++;continue;}
  seen.add(url.href);entries.push({title:name,url:url.href,host:url.hostname});
 }
 if(!found)throw Error("No bookmark <A HREF> entries were found. Export bookmarks as HTML in your browser.");
 if(!entries.length)throw Error("No safe HTTP(S) bookmarks remained after validation.");
 return {entries,rejected,duplicates};
}
export function bookmarksToCsv(entries:readonly Bookmark[]):string{
 if(!entries.length||entries.length>4000)throw Error("Invalid bookmark export.");
 return "\uFEFF"+mergedCsvExport({headers:["title","url","host"],rows:entries.map(e=>[e.title,e.url,e.host])});
}
export function bookmarksToMarkdown(entries:readonly Bookmark[]):string{
 if(!entries.length||entries.length>4000)throw Error("Invalid bookmark export.");
 const escaped=(s:string)=>s.replace(/\\/gu,"\\\\").replace(/([\[\]_*])/gu,"\\$1");
 return "# Imported bookmarks\n\n"+entries.map(e=>"- ["+escaped(e.title)+"]("+e.url.replace(/\(/gu,"%28").replace(/\)/gu,"%29")+")").join("\n")+"\n";
}
