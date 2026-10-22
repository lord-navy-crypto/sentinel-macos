import JSZip from "jszip";

/** Local unencrypted EPUB 2/3 inspection: no remote resources and no DRM bypass. */
export const EPUB_MAX_INPUT=12_000_000;
export const EPUB_MAX_UNPACKED=55_000_000;
export const EPUB_MAX_ITEMS=800;
export const EPUB_MAX_CHAPTERS=120;
export const EPUB_MAX_CHAPTER_BYTES=1_200_000;
export type EpubChapter={path:string;title:string;text:string;characters:number};
export type EpubBook={title:string;chapters:EpubChapter[];totalCharacters:number};

function xmlAttr(tag:string,field:string):string{
 const r=new RegExp("(?:^|\\s)"+field+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')","iu");
 const found=r.exec(tag);return found?.[1]??found?.[2]??"";
}
function xmlEntities(value:string):string{
 const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
 return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu,(_,s:string)=>{
  if(s[0]==="#"){
   const hex=s[1]?.toLowerCase()==="x";
   const n=Number.parseInt(s.slice(hex?2:1),hex?16:10);
   return n>=1&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):"�";
  }
  return named[s.toLowerCase()]??"&"+s+";";
 });
}
function safeEntry(path:string):string{
 if(!path||path.length>1000||path.startsWith("/")||path.includes("\\")||
    path.includes("\u0000")||/^[a-z]+:/iu.test(path))
    throw Error("EPUB contains an unsafe archive path.");
 const components=path.split("/");
 if(components.some(x=>x===""||x===".."||x==="."))throw Error("EPUB path traversal is not allowed.");
 return components.join("/");
}
function resolveEntry(base:string,href:string):string{
 let ref=href.split("#")[0].split("?")[0];
 try{ref=decodeURIComponent(ref);}catch{throw Error("EPUB has an invalid encoded chapter path.");}
 if(!ref||ref.startsWith("/")||/^[a-z]+:/iu.test(ref)||ref.includes("\\"))
  throw Error("EPUB chapters must be local archive entries.");
 const current=base.split("/");current.pop();
 for(const item of ref.split("/")){
  if(item===""||item===".")continue;
  if(item===".."){if(!current.length)throw Error("EPUB chapter path escapes archive root.");current.pop();}
  else current.push(item);
 }
 return safeEntry(current.join("/"));
}
function textFromXhtml(source:string):string{
 if(/<!DOCTYPE|<!ENTITY/iu.test(source))throw Error("EPUB chapters with document type/entity declarations are unsupported.");
 const clean=source
  .replace(/<\s*(script|style|head|svg)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/giu,"")
  .replace(/<\s*br\b[^>]*\/?>/giu,"\n")
  .replace(/<\/\s*(?:p|div|section|h[1-6]|li|tr|blockquote)\s*>/giu,"\n")
  .replace(/<[^>]*>/gu,"");
 return xmlEntities(clean).replace(/\r\n?/gu,"\n")
  .replace(/[\t \u00a0]+/gu," ").replace(/\n[ \t]+/gu,"\n")
  .replace(/\n{3,}/gu,"\n\n").trim();
}
function tagValue(source:string,tag:string):string{
 const m=new RegExp("<(?:[\\w-]+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?"+tag+"\\s*>","iu").exec(source);
 return m?xmlEntities(m[1].replace(/<[^>]*>/gu,"")).trim():"";
}
function detectTitle(html:string,fallback:string):string{
 const h=/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/iu.exec(html);
 const candidate=h?textFromXhtml(h[1]):tagValue(html,"title");
 return (candidate||fallback).slice(0,150);
}
export async function inspectEpub(file:Pick<File,"name"|"size"|"arrayBuffer">):Promise<EpubBook>{
 if(!/\.epub$/iu.test(file.name)||file.size<100||file.size>EPUB_MAX_INPUT)
  throw Error("Select one EPUB file between 100 bytes and 12 MB.");
 const zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});
 const all=Object.values(zip.files).filter(x=>!x.dir);
 if(all.length<3||all.length>EPUB_MAX_ITEMS)throw Error("EPUB must contain 3–800 archive entries.");
 let unpacked=0;
 for(const entry of all){
  safeEntry(entry.name);
  const bytes=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
  if(bytes===undefined||!Number.isSafeInteger(bytes)||bytes<0)
   throw Error("EPUB has unknown or invalid decompressed size.");
  unpacked+=bytes;
  if(unpacked>EPUB_MAX_UNPACKED)throw Error("EPUB expands beyond the 55 MB safety limit.");
 }
 const mimetype=zip.file("mimetype");
 if(!mimetype||(await mimetype.async("string")).trim()!=="application/epub+zip")
  throw Error("Not a valid EPUB 2/3 archive (missing mimetype).");
 if(zip.file("META-INF/encryption.xml"))
  throw Error("Encrypted/DRM-protected EPUB is not supported; no decryption is performed.");
 const container=zip.file("META-INF/container.xml");
 if(!container)throw Error("EPUB container.xml is missing.");
 const containerText=await container.async("string");
 if(/<!DOCTYPE|<!ENTITY/iu.test(containerText))throw Error("EPUB XML declarations are unsafe.");
 const root=/<rootfile\b[^>]*>/giu.exec(containerText)?.[0];
 const opfName=root?xmlAttr(root,"full-path"):"";
 const opfPath=safeEntry(opfName);
 const opf=zip.file(opfPath);
 if(!opf)throw Error("EPUB package manifest is missing.");
 const opfText=await opf.async("string");
 if(opfText.length>1_000_000||/<!DOCTYPE|<!ENTITY/iu.test(opfText))
  throw Error("EPUB metadata is oversized or uses external entities.");
 const bookTitle=(tagValue(opfText,"title")||file.name.replace(/\.epub$/iu,"")).slice(0,150);
 const manifest=new Map<string,{href:string;mediaType:string}>();
 for(const match of opfText.matchAll(/<item\b[^>]*>/giu)){
  const id=xmlAttr(match[0],"id"),href=xmlAttr(match[0],"href"),mediaType=xmlAttr(match[0],"media-type");
  if(id&&href){if(manifest.has(id))throw Error("Duplicate EPUB manifest identifier.");manifest.set(id,{href,mediaType});}
 }
 const spine=/<spine\b[^>]*>([\s\S]*?)<\/spine\s*>/iu.exec(opfText)?.[1]??"";
 if(!spine)throw Error("EPUB reading order is missing.");
 const refs=[...spine.matchAll(/<itemref\b[^>]*>/giu)];
 if(!refs.length||refs.length>EPUB_MAX_CHAPTERS)throw Error("EPUB chapter count must be 1–120.");
 const chapters:EpubChapter[]=[];
 let totalCharacters=0;
 for(const ref of refs){
  const id=xmlAttr(ref[0],"idref"),item=manifest.get(id);
  if(!item)throw Error("EPUB spine references an unknown document.");
  if(!["application/xhtml+xml","text/html"].includes(item.mediaType))
   throw Error("EPUB reading order contains a non-HTML resource.");
  const path=resolveEntry(opfPath,item.href),entry=zip.file(path);
  if(!entry)throw Error("EPUB chapter not found: "+path);
  const inflated=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0;
  if(inflated>EPUB_MAX_CHAPTER_BYTES)throw Error("EPUB chapter exceeds the 1.2 MB safety limit.");
  const html=await entry.async("string");
  if(html.length>EPUB_MAX_CHAPTER_BYTES)throw Error("EPUB chapter is too long to process.");
  const title=detectTitle(html,"Chapter "+(chapters.length+1));
  const text=textFromXhtml(html);
  totalCharacters+=text.length;
  if(totalCharacters>2_000_000)throw Error("EPUB text exceeds 2 million characters.");
  chapters.push({path,title,text,characters:text.length});
 }
 return {title:bookTitle,chapters,totalCharacters};
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function epubChapterCsv(book:EpubBook):string{
 const rows=book.chapters.map((chapter,index)=>
  [String(index+1),csvCell(chapter.title),csvCell(chapter.path),String(chapter.characters)].join(","));
 return "\uFEFFindex,title,relative_path,characters\r\n"+rows.join("\r\n")+"\r\n";
}
export function epubChapterTxt(book:EpubBook,index:number):string{
 if(!Number.isSafeInteger(index)||index<0||index>=book.chapters.length)
  throw Error("Select a valid EPUB chapter.");
 const chapter=book.chapters[index];
 return book.title+"\n"+chapter.title+"\n\n"+chapter.text+"\n";
}
