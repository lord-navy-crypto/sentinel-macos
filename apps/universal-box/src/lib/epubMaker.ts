/** Minimal standards-based EPUB 3 authoring from user-entered TXT/Markdown. All markup is escaped. */
import JSZip from "jszip";

export type EpubInput={title:string;author:string;language:"zh-CN"|"en";body:string;kind:"markdown"|"text"};
const escapeXml=(s:string)=>s.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;").replace(/"/gu,"&quot;").replace(/'/gu,"&apos;");
function safeXmlText(s:string,label:string,max:number):string{
 if(!s.trim()||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(s))
  throw Error(label+" is empty, too long, or contains unsupported XML characters.");
 return escapeXml(s.trim());
}
function chapters(body:string,kind:"markdown"|"text"):string{
 const lines=body.replace(/\r\n?/gu,"\n").split("\n");
 let items:string[]=[],paragraph:string[]=[],listing:string[]=[];
 const flushList=()=>{if(listing.length){items.push("<ul>"+listing.map(x=>"<li>"+escapeXml(x)+"</li>").join("")+"</ul>");listing=[];}};
 const flush=()=>{if(paragraph.length){items.push("<p>"+paragraph.map(escapeXml).join("<br/>")+"</p>");paragraph=[];}};
 for(const line of lines){
  if(!line.trim()){flush();flushList();continue;}
  if(kind==="markdown"){
   const header=/^(#{1,3})\s+(.+)$/u.exec(line);
   if(header){flush();flushList();items.push("<h"+header[1].length+">"+escapeXml(header[2])+"</h"+header[1].length+">");continue;}
   const bullet=/^\s*[-*]\s+(.+)$/u.exec(line);
   if(bullet){flush();listing.push(bullet[1]);continue;}
  }
  flushList();paragraph.push(line);
 }
 flush();flushList();
 return items.join("\n");
}
export async function makeEpub(input:EpubInput):Promise<Uint8Array>{
 const title=safeXmlText(input.title,"Book title",150),author=safeXmlText(input.author,"Author",100);
 const body=safeXmlText(input.body,"Book content",350000);
 if(!["zh-CN","en"].includes(input.language)||!["text","markdown"].includes(input.kind))throw Error("Unsupported EPUB format.");
 const content=chapters(input.body,input.kind);
 if(!content)throw Error("No readable paragraphs.");
 const id="urn:uuid:"+crypto.randomUUID();
 const date=new Date().toISOString().replace(/\.\d{3}Z$/u,"Z");
 const zip=new JSZip();
 zip.file("mimetype","application/epub+zip",{compression:"STORE"});
 zip.file("META-INF/container.xml",'<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
 zip.file("EPUB/package.opf",'<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="'+input.language+'"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:identifier id="pub-id">'+id+'</dc:identifier><dc:title>'+title+'</dc:title><dc:creator>'+author+'</dc:creator><dc:language>'+input.language+'</dc:language><meta property="dcterms:modified">'+date+'</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="chapter"/></spine></package>');
 zip.file("EPUB/nav.xhtml",'<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="'+input.language+'"><head><title>Contents</title></head><body><nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="chapter.xhtml">'+title+'</a></li></ol></nav></body></html>');
 zip.file("EPUB/chapter.xhtml",'<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="'+input.language+'"><head><title>'+title+'</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><main><h1>'+title+'</h1>'+content+'</main></body></html>');
 zip.file("EPUB/style.css","body{font-family:serif;line-height:1.65;margin:5%;overflow-wrap:anywhere}h1,h2,h3{line-height:1.3}p{margin:0 0 1em}li{margin:.25em 0}");
 const out=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(out.length>20_000_000)throw Error("EPUB output exceeds 20 MB.");
 void body;return out;
}
