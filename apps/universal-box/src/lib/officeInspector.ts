/** Offline, read-only inspection for DOCX and PPTX. Does not execute macros or open links. */
import JSZip from "jszip";
export type OfficeKind="docx"|"pptx";
export type OfficeReport={kind:OfficeKind;sections:{heading:string;text:string}[];plainText:string;images:{name:string;path:string;size:number}[];files:number};
const MAX_INPUT=18_000_000,MAX_ITEMS=1100,MAX_TEXT=400_000,MAX_IMAGE=6_000_000,MAX_IMAGES=30;
const decodeXml=(raw:string)=>raw.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/giu,(_,key:string)=>{
 if(key==="amp")return "&";if(key==="lt")return "<";if(key==="gt")return ">";if(key==="quot")return '"';if(key==="apos")return "'";
 if(key[0]!=="#")return "&"+key+";";
 const n=key[1].toLowerCase()==="x"?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
 return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):"\uFFFD";
});
const TEXT_TOKEN=/<(?:w:t|a:t)\b[^>]*>([\s\S]*?)<\/(?:w:t|a:t)>|<w:tab\s*\/>|<w:br\b[^>]*\/>/gu;
function runs(xml:string):string{
 let text="",last=0;for(const m of xml.matchAll(TEXT_TOKEN)){
  if(m.index>last&&text.length>MAX_TEXT)break;
  text+=m[1]!==undefined?decodeXml(m[1]):m[0].startsWith("<w:tab")?"\t":"\n";
  last=m.index+m[0].length;
  if(text.length>MAX_TEXT)throw Error("Extracted text exceeds safety limit.");
 }return text;
}
const extractDocx=(xml:string)=>{
 const sections:{heading:string;text:string}[]=[];
 for(const match of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu)){
  const content=runs(match[0]);
  if(content.trim())sections.push({heading:"Paragraph "+(sections.length+1),text:content});
  if(sections.length>=3000)throw Error("Document has too many paragraphs.");
 }return sections;
};
const getAttr=(tag:string,attr:string):string|undefined=>{
 const m=new RegExp("(?:^|\\s)"+attr.replace(":","\\:")+'="([^"]*)"',"u").exec(tag);
 return m?.[1];
};
function pptxOrderedPaths(zip:JSZip,xml:string,rels:string):string[]{
 const lookup=new Map<string,string>();
 for(const m of rels.matchAll(/<Relationship\b[^>]*\/>/gu)){
  const id=getAttr(m[0],"Id"),target=getAttr(m[0],"Target"),type=getAttr(m[0],"Type");
  if(!id||!target||!type?.endsWith("/slide")||getAttr(m[0],"TargetMode")==="External")continue;
  const canonical=target.replace(/^\//u,"").replace(/^ppt\//u,"").replace(/^\.\//u,"");
  const path="ppt/"+canonical;
  if(/^ppt\/slides\/slide[0-9]+\.xml$/u.test(path))lookup.set(id,path);
 }
 const paths:string[]=[];
 for(const m of xml.matchAll(/<p:sldId\b[^>]*\/>/gu)){
  const id=getAttr(m[0],"r:id");const path=id?lookup.get(id):undefined;
  if(path&&zip.file(path))paths.push(path);
 }
 return paths;
}
function previewImage(path:string,bytes:Uint8Array):boolean{
 const e=path.toLowerCase().split(".").pop();
 const at=(...values:number[])=>values.every((v,i)=>bytes[i]===v);
 if(e==="png")return at(137,80,78,71,13,10,26,10);
 if(e==="jpg"||e==="jpeg")return at(255,216,255);
 if(e==="gif")return at(71,73,70,56);
 if(e==="webp")return at(82,73,70,70)&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 return false;
}
/** Validation limits incoming ZIP bytes, file count, total returned text, and extracted binary. */
export async function inspectOffice(filename:string,data:Uint8Array):Promise<OfficeReport>{
 const ext=filename.toLowerCase().split(".").pop();
 if(ext!=="docx"&&ext!=="pptx")throw Error("Choose a .docx or .pptx document (not macro-enabled).");
 if(data.length===0||data.length>MAX_INPUT)throw Error("Office file must be between 1 byte and 18 MB.");
 const zip=await JSZip.loadAsync(data,{checkCRC32:false,createFolders:false});
 const files=Object.values(zip.files).filter(f=>!f.dir);
 if(files.length>MAX_ITEMS)throw Error("Office package contains too many items.");
 let sections:{heading:string;text:string}[]=[];
 if(ext==="docx"){
  const member=zip.file("word/document.xml");
  if(!member)throw Error("The DOCX package is missing word/document.xml.");
  const xml=await member.async("string");
  if(xml.length>5_000_000)throw Error("Document XML too large.");
  sections=extractDocx(xml);
 }else{
  const pres=zip.file("ppt/presentation.xml"),rel=zip.file("ppt/_rels/presentation.xml.rels");
  if(!pres||!rel)throw Error("The PPTX package is missing presentation relationships.");
  const [p,r]=await Promise.all([pres.async("string"),rel.async("string")]);
  if(p.length>1_000_000||r.length>1_000_000)throw Error("Presentation XML too large.");
  const paths=pptxOrderedPaths(zip,p,r);
  if(!paths.length)throw Error("No valid slide relationships were found.");
  if(paths.length>200)throw Error("Too many slides.");
  for(const path of paths){
   const xml=await zip.file(path)!.async("string");
   if(xml.length>2_000_000)throw Error("Slide XML too large.");
   const paragraphs=[...xml.matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/gu)].map(m=>runs(m[0])).filter(s=>s.trim());
   // Extract only actual text, not style attributes or hidden XML.
   const line=paragraphs.join("\n");
   sections.push({heading:"Slide "+(sections.length+1),text:line});
  }
 }
 const plainText=sections.map(s=>ext==="pptx"?"# "+s.heading+"\n"+s.text:s.text).join("\n\n");
 if(plainText.length>MAX_TEXT)throw Error("Extracted text exceeds safety limit.");
 const prefix=ext==="docx"?"word/media/":"ppt/media/";
 const images:{name:string;path:string;size:number}[]=[];
 for(const f of files){
  if(!f.name.startsWith(prefix)||!/(\.png|\.jpe?g|\.gif|\.webp)$/iu.test(f.name))continue;
  if(images.length>=MAX_IMAGES)break;
  // Byte verification happens at export, not here. This display records path and estimated size only.
  images.push({name:f.name.slice(prefix.length),path:f.name,size:0});
 }
 return {kind:ext,sections,plainText,images,files:files.length};
}
export async function extractOfficeMedia(filename:string,data:Uint8Array):Promise<Uint8Array>{
 const info=await inspectOffice(filename,data);
 if(!info.images.length)throw Error("No supported PNG/JPEG/GIF/WebP images found.");
 const source=await JSZip.loadAsync(data);
 const output=new JSZip();let total=0,kept=0;
 for(const image of info.images){
  const member=source.file(image.path);if(!member)continue;
  const bytes=await member.async("uint8array");
  if(bytes.length>MAX_IMAGE)throw Error("A media item exceeds the 6 MB limit.");
  total+=bytes.length;
  if(total>16_000_000)throw Error("Extracted media exceeds the 16 MB limit.");
  if(!previewImage(image.path,bytes))continue;
  const ext=image.name.split(".").pop()!.toLowerCase();
  output.file("media/image-"+String(++kept).padStart(3,"0")+"."+ext,bytes);
 }
 if(!kept)throw Error("No valid image data; unsupported images were skipped.");
 output.file("README.txt","Extracted locally from "+info.kind.toUpperCase()+"; "+kept+" valid images.\nNo macros or embedded scripts were executed.");
 return output.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:4}});
}
