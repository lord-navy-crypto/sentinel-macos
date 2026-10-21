/** Extract actual presenter notes for PPTX slide order; never guess notes from slide text. */
import JSZip from "jszip";
import {inspectOffice} from "./officeInspector";
export type SlideNote={slide:number;text:string;hasNotes:boolean};
export type NotesReport={slides:number;withNotes:number;notes:SlideNote[]};
function attr(tag:string,key:string):string{
 const m=new RegExp("(?:^|\\s)"+key+'\\s*=\\s*"([^"]*)"',"u").exec(tag);
 return m?.[1]??"";
}
function xmlDecode(s:string):string{
 return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu,(_,key:string)=>{
  if(key==="amp")return "&";if(key==="lt")return "<";if(key==="gt")return ">";
  if(key==="quot")return '"';if(key==="apos")return "'";
  if(!key.startsWith("#"))return "&"+key+";";
  const n=key[1].toLowerCase()==="x"?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
  return Number.isSafeInteger(n)&&n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff)?String.fromCodePoint(n):"\uFFFD";
 });
}
const relationships=(xml:string)=>[...xml.matchAll(/<Relationship\b[^>]*\/?\s*>/gu)]
 .map(m=>m[0]);
async function xmlFile(zip:JSZip,path:string,max:number):Promise<string>{
 const file=zip.file(path);if(!file)return "";
 const expected=(file as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
 if(expected!==undefined&&expected>max)throw Error("PPTX note XML expands beyond supported size.");
 const text=await file.async("string");
 if(text.length>max||/<\s*!(?:DOCTYPE|ENTITY)/iu.test(text))throw Error("Oversized or unsafe notes XML.");
 return text;
}
export async function extractPptxSpeakerNotes(bytes:Uint8Array):Promise<NotesReport>{
 if(bytes.length<100||bytes.length>18_000_000)throw Error("PPTX must be 100 bytes–18 MB.");
 const validation=await inspectOffice("selected.pptx",bytes);
 if(validation.kind!=="pptx")throw Error("Not a PowerPoint document.");
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:false,createFolders:false});
 const presentation=await xmlFile(zip,"ppt/presentation.xml",1_000_000);
 const rels=await xmlFile(zip,"ppt/_rels/presentation.xml.rels",1_000_000);
 const slideMap=new Map<string,string>();
 for(const r of relationships(rels)){
  const id=attr(r,"Id"),target=attr(r,"Target"),type=attr(r,"Type");
  if(!id||!type.endsWith("/slide")||attr(r,"TargetMode")==="External")continue;
  const path="ppt/"+target.replace(/^\//u,"").replace(/^ppt\//u,"").replace(/^\.\//u,"");
  if(/^ppt\/slides\/slide\d+\.xml$/u.test(path))slideMap.set(id,path);
 }
 const ordered=[...presentation.matchAll(/<p:sldId\b[^>]*\/>/gu)].map(m=>slideMap.get(attr(m[0],"r:id"))??"").filter(Boolean);
 if(!ordered.length||ordered.length>200||ordered.length!==validation.sections.length)
  throw Error("PPTX slide relationships are missing or inconsistent.");
 const notes:SlideNote[]=[];
 for(let i=0;i<ordered.length;i++){
  const match=/^ppt\/slides\/(slide\d+\.xml)$/u.exec(ordered[i]);
  if(!match)throw Error("Unsupported PPTX slide path.");
  const slideRels="ppt/slides/_rels/"+match[1]+".rels";
  const relationshipXml=await xmlFile(zip,slideRels,300_000);
  let target="";
  for(const r of relationships(relationshipXml)){
   if(attr(r,"Type").endsWith("/notesSlide")&&attr(r,"TargetMode")!=="External"){
    target=attr(r,"Target");break;
   }
  }
  let text="";
  if(target){
   const filename=target.replace(/^\.\.\/notesSlides\//u,"").replace(/^\/ppt\/notesSlides\//u,"");
   if(!/^notesSlide\d+\.xml$/u.test(filename))throw Error("Unexpected notes path.");
   const raw=await xmlFile(zip,"ppt/notesSlides/"+filename,1_000_000);
   if(!raw)throw Error("PPTX notes relationship points to a missing note file.");
   const shapes=[...raw.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/gu)];
   const paragraphs:string[]=[];
   for(const shape of shapes){
    if(!/<p:ph\b[^>]*\btype="body"/u.test(shape[0]))continue;
    for(const paragraph of shape[0].matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/gu)){
     const tokens=[...paragraph[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gu)].map(m=>xmlDecode(m[1]));
     if(tokens.length)paragraphs.push(tokens.join(""));
    }
   }
   text=paragraphs.join("\n").trim();
   if(text.length>50_000)throw Error("Presenter note for a slide exceeds 50,000 characters.");
  }
  notes.push({slide:i+1,text,hasNotes:!!text});
 }
 return {slides:notes.length,withNotes:notes.filter(x=>x.hasNotes).length,notes};
}
export function notesToText(report:NotesReport):string{
 return report.notes.map(n=>"Slide "+n.slide+"\n"+(n.text||"(no presenter notes)")).join("\n\n")+"\n";
}
