/** Safe, local reading of a user-exported Netscape-format bookmarks HTML file. */
export type LocalBookmark={title:string;url:string;domain:string};
export type BookmarkReport={items:LocalBookmark[];skipped:number;duplicates:number};
export const BOOKMARK_MAX_HTML_CHARS=2_000_000;
export const BOOKMARK_MAX_ITEMS=5_000;

/** Minimal HTML entity conversion without a DOM and without loading linked resources. */
function entities(text:string):string{
 const named:Record<string,string>={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" ",copy:"©",mdash:"—",ndash:"–",hellip:"…"};
 return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu,(_,entity:string)=>{
  if(entity.startsWith("#")){
   const hex=/^#x/iu.test(entity),value=Number.parseInt(entity.slice(hex?2:1),hex?16:10);
   if(!Number.isInteger(value)||value<1||value>0x10ffff||(value>=0xd800&&value<=0xdfff))return "�";
   return String.fromCodePoint(value);
  }
  return named[entity.toLowerCase()]??"&"+entity+";";
 });
}
function titleText(html:string):string{
 return entities(html.replace(/<[^>]*>/gu,"").replace(/[\u0000-\u001f\u007f]/gu," "))
  .replace(/\s+/gu," ").trim().slice(0,300);
}
function parseUrl(attribute:string):string|null{
 const match=/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(attribute);
 if(!match)return null;
 const href=entities(match[1]??match[2]??match[3]??"").trim();
 if(!href||href.length>2048)return null;
 try{
  const url=new URL(href);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;
  return url.href;
 }catch{return null;}
}
export function parseBookmarkHtml(source:string):BookmarkReport{
 if(!source||source.length>BOOKMARK_MAX_HTML_CHARS)
  throw Error("Select bookmarks HTML containing 1–2,000,000 characters.");
 const items:LocalBookmark[]=[],counts=new Map<string,number>();
 let skipped=0;
 // Common Chrome, Firefox and some Safari HTML exports use HREF anchors.
 // We never parse the supplied text into an executable browser DOM.
 const links=/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/giu;
 let match:RegExpExecArray|null;
 while((match=links.exec(source))!==null){
  if(items.length>=BOOKMARK_MAX_ITEMS)throw Error("Bookmarks export exceeds 5,000 valid links.");
  const url=parseUrl(match[1]);
  if(!url){skipped++;continue;}
  const title=titleText(match[2])||url;
  const domain=new URL(url).hostname;
  items.push({title,url,domain});
  counts.set(url,(counts.get(url)||0)+1);
 }
 if(!items.length)throw Error("No HTTP(S) bookmarks found. Choose an exported bookmarks HTML file.");
 const duplicates=[...counts.values()].reduce((total,n)=>total+Math.max(0,n-1),0);
 return {items,skipped,duplicates};
}
export function bookmarkDeduplicate(items:readonly LocalBookmark[]):LocalBookmark[]{
 const seen=new Set<string>();
 return items.filter(bookmark=>!seen.has(bookmark.url)&&!!seen.add(bookmark.url));
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function bookmarksCsv(items:readonly LocalBookmark[]):string{
 if(!items.length||items.length>BOOKMARK_MAX_ITEMS)throw Error("No valid bookmarks to export.");
 return "\uFEFFindex,title,url,domain\r\n"+
  items.map((item,index)=>[String(index+1),csvCell(item.title),csvCell(item.url),csvCell(item.domain)].join(",")).join("\r\n")+"\r\n";
}
export function bookmarksMarkdown(items:readonly LocalBookmark[]):string{
 if(!items.length||items.length>BOOKMARK_MAX_ITEMS)throw Error("No valid bookmarks to export.");
 const escape=(s:string)=>s.replace(/([\\`*_{}\[\]<>])/gu,"\\$1");
 const lines=["# 本地浏览器书签清单","",...items.map(bookmark=>{
  const title=escape(bookmark.title);
  // Markdown angle URLs avoid most parentheses escaping problems.
  const url=bookmark.url.replace(/</gu,"%3C").replace(/>/gu,"%3E");
  return "- ["+title+"](<"+url+">) · "+escape(bookmark.domain);
 })];
 return lines.join("\n")+"\n";
}
export function bookmarkDomainSummary(items:readonly LocalBookmark[]):{domain:string;count:number}[]{
 const counts=new Map<string,number>();
 for(const item of items)counts.set(item.domain,(counts.get(item.domain)||0)+1);
 return [...counts].map(([domain,count])=>({domain,count}))
   .sort((a,b)=>b.count-a.count||a.domain.localeCompare(b.domain));
}
