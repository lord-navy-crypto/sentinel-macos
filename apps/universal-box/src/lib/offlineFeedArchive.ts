/** Offline RSS 2.0 / Atom 1.0 exported-file reader. No HTTP requests or HTML rendering. */
export const FEED_MAX_INPUT_BYTES=2_000_000;
export const FEED_MAX_ENTRIES=1000;
export type FeedEntry={title:string;url:string;domain:string;date:string;summary:string};
export type FeedArchive={sourceTitle:string;format:"RSS"|"Atom";entries:FeedEntry[];skipped:number;duplicates:number};

export function validateFeedUrl(raw:string):{url:string;domain:string}|null{
 if(typeof raw!=="string"||raw.length>2048||!raw.trim())return null;
 try{
  const parsed=new URL(raw.trim());
  if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)
   return null;
  return {url:parsed.href,domain:parsed.hostname.toLowerCase()};
 }catch{return null;}
}
function normalizeText(value:string,length=250):string{
 return value.replace(/[\u0000-\u001f\u007f]/gu," ").replace(/\s+/gu," ").trim().slice(0,length);
}
function children(element:Element,tag:string):Element[]{
 return Array.from(element.children).filter(node=>node.localName.toLowerCase()===tag);
}
function childText(element:Element,tag:string,length=250):string{
 const node=children(element,tag)[0];
 return normalizeText(node?.textContent??"",length);
}
function rssLink(item:Element):string{
 return childText(item,"link",2048);
}
function atomLink(item:Element):string{
 const links=children(item,"link");
 const preferred=links.find(link=>["","alternate"].includes((link.getAttribute("rel")??"").toLowerCase())
   &&["","text/html","application/xhtml+xml"].includes((link.getAttribute("type")??"").toLowerCase()));
 return (preferred??links.find(link=>!link.getAttribute("rel")))?.getAttribute("href")??"";
}
export function parseOfflineFeedXml(source:string):FeedArchive{
 if(!source||source.length>FEED_MAX_INPUT_BYTES)
  throw Error("Feed XML must contain 1–2,000,000 characters.");
 // Explicitly exclude DTDs, entities and XML stylesheet processing instructions.
 if(/<!DOCTYPE\b|<!ENTITY\b|<\?xml-stylesheet\b/iu.test(source))
  throw Error("Feed XML with DTD, entity declarations or stylesheets is not supported.");
 if(typeof DOMParser==="undefined")throw Error("Local XML parsing is unavailable in this WebView.");
 const xml=new DOMParser().parseFromString(source,"application/xml");
 if(xml.getElementsByTagName("parsererror").length)
  throw Error("Feed XML is malformed.");
 const root=xml.documentElement;
 if(!root)throw Error("Feed XML has no root element.");
 const kind=root.localName.toLowerCase();
 const format=kind==="rss"?"RSS":kind==="feed"?"Atom":null;
 if(!format)throw Error("Only local RSS 2.0 or Atom 1.0 XML exports are supported.");
 const collection=format==="RSS"?children(root,"channel")[0]:root;
 if(!collection)throw Error("RSS feed has no channel.");
 const nodes=children(collection,format==="RSS"?"item":"entry");
 if(!nodes.length||nodes.length>FEED_MAX_ENTRIES)
  throw Error("Feed must contain 1–1,000 entries.");
 const sourceTitle=childText(collection,"title",180)||"(untitled feed)";
 const entries:FeedEntry[]=[],seen=new Set<string>();
 let skipped=0,duplicates=0;
 for(const item of nodes){
  const selected=format==="RSS"?rssLink(item):atomLink(item);
  const link=validateFeedUrl(selected);
  if(!link){skipped++;continue;}
  if(seen.has(link.url))duplicates++;else seen.add(link.url);
  const title=childText(item,"title")||link.url;
  const date=format==="RSS"?childText(item,"pubDate",100):
    childText(item,"published",100)||childText(item,"updated",100);
  const summary=format==="RSS"?childText(item,"description",350):
    childText(item,"summary",350)||childText(item,"content",350);
  entries.push({title,url:link.url,domain:link.domain,date,summary});
 }
 if(!entries.length)throw Error("Feed contains no valid HTTP(S) item links.");
 return {sourceTitle,format,entries,skipped,duplicates};
}
export function uniqueFeedEntries(entries:readonly FeedEntry[]):FeedEntry[]{
 const seen=new Set<string>();
 return entries.filter(item=>!seen.has(item.url)&&!!seen.add(item.url));
}
export function filterFeedEntries(entries:readonly FeedEntry[],query:string):FeedEntry[]{
 const term=query.trim().toLocaleLowerCase();
 if(!term)return [...entries];
 return entries.filter(item=>(item.title+" "+item.domain+" "+item.url+" "+item.summary)
  .toLocaleLowerCase().includes(term));
}
export function feedDomainCounts(entries:readonly FeedEntry[]):{domain:string;count:number}[]{
 const counts=new Map<string,number>();
 for(const item of entries)counts.set(item.domain,(counts.get(item.domain)||0)+1);
 return [...counts].map(([domain,count])=>({domain,count}))
  .sort((a,b)=>b.count-a.count||a.domain.localeCompare(b.domain));
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function feedArchiveCsv(entries:readonly FeedEntry[]):string{
 if(entries.length>FEED_MAX_ENTRIES)throw Error("Cannot export more than 1,000 entries.");
 return "\uFEFFindex,title,url,domain,date,summary\r\n"+
  entries.map((e,index)=>[String(index+1),csvCell(e.title),csvCell(e.url),
   csvCell(e.domain),csvCell(e.date),csvCell(e.summary)].join(",")).join("\r\n")+
  (entries.length?"\r\n":"");
}
export function feedArchiveMarkdown(archive:FeedArchive,entries:readonly FeedEntry[]):string{
 if(entries.length>FEED_MAX_ENTRIES)throw Error("Cannot export more than 1,000 entries.");
 const esc=(value:string)=>value.replace(/([\\`*_{}\[\]<>|])/gu,"\\$1")
  .replace(/&/gu,"&amp;");
 const lines=["# "+esc(archive.sourceTitle),"","Source format: "+archive.format,"",
  ...entries.map(e=>"- ["+esc(e.title)+"](<"+e.url.replace(/</gu,"%3C").replace(/>/gu,"%3E")+
   ">)"+(e.date?" · "+esc(e.date):""))];
 return lines.join("\n")+"\n";
}
