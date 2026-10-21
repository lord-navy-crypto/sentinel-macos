/** Original, offline, user-owned creative outputs. No remote assets, fonts or subscriptions. */
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";

export type CreativeTheme="ocean"|"sunset"|"forest";
export type CreativeFormat="poster"|"certificate"|"social";
export type CreativeText={title:string;subtitle:string;footer:string;theme:CreativeTheme};
const PALETTES:Record<CreativeTheme,{dark:string;mid:string;accent:string;light:string}>={
 ocean:{dark:"152A4D",mid:"245FA7",accent:"F6BD60",light:"EFF6FF"},
 sunset:{dark:"432254",mid:"AE4975",accent:"FFDB73",light:"FFF1F5"},
 forest:{dark:"163A37",mid:"278475",accent:"F5CB64",light:"F0FFF9"},
};
const xml=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function value(label:string,raw:string,max:number):string{
 if(raw.length>max)throw Error(label+" cannot exceed "+max+" characters.");
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(raw))throw Error(label+" contains unsupported control characters.");
 return raw.trim();
}
function assertTheme(theme:CreativeTheme):void{
 if(!Object.prototype.hasOwnProperty.call(PALETTES,theme))throw Error("Unknown creative theme.");
}
export type WordTemplateInput={
 title:string;recipient:string;event:string;date:string;body:string;
};
/** Explicit token substitution; unknown placeholders fail rather than silently misprinting forms. */
export function fillWordTemplate(input:WordTemplateInput):string{
 const title=value("Document title",input.title,120);
 const recipient=value("Recipient",input.recipient,120);
 const event=value("Event",input.event,120);
 const date=value("Date",input.date,60);
 const template=value("Document body",input.body,12000);
 if(!title||!template)throw Error("Enter a document title and body.");
 const vars:Record<string,string>={recipient,event,date};
 const body=template.replace(/\{\{([^{}]+)\}\}/gu,(_,name:string)=>{
  if(!Object.prototype.hasOwnProperty.call(vars,name))throw Error("Unknown template field: "+name);
  return vars[name];
 });
 return "# "+title+"\n\n"+body;
}
export async function exportWordTemplate(input:WordTemplateInput):Promise<Uint8Array>{
 const markdown=fillWordTemplate(input);
 // Existing DOCX generator creates real editable Word paragraphs/list items.
 return markdownToDocx(markdown);
}

export type SlideDeckInput={title:string;subtitle:string;outline:string;theme:CreativeTheme};
export type Slide={title:string;bullets:string[]};
/** A new slide starts at each ## heading. The cover slide is produced automatically. */
export function parseSlideOutline(input:SlideDeckInput):Slide[]{
 value("Presentation title",input.title,100);
 value("Presentation subtitle",input.subtitle,180);
 value("Presentation outline",input.outline,12000);
 assertTheme(input.theme);
 if(!input.title.trim())throw Error("Presentation title is required.");
 const slides:Slide[]=[];
 let current:Slide|null=null;
 for(const raw of input.outline.replace(/\r\n?/gu,"\n").split("\n")){
  const line=raw.trim();
  if(!line)continue;
  if(line.startsWith("## ")){
   const heading=value("Slide heading",line.slice(3),100);
   if(!heading)throw Error("Slide heading cannot be empty.");
   if(slides.length===12)throw Error("Maximum 12 content slides.");
   current={title:heading,bullets:[]};slides.push(current);
  }else{
   if(!current)throw Error("Start outline with ## followed by a slide title.");
   const point=value("Bullet",line.replace(/^[-*]\s+/u,""),180);
   if(current.bullets.length===7)throw Error("Maximum 7 bullets per slide; start another heading.");
   if(point)current.bullets.push(point);
  }
 }
 if(!slides.length)throw Error("Include at least one ## content slide.");
 return slides;
}
const NS_A="http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P="http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_R="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PR="http://schemas.openxmlformats.org/package/2006/relationships";
const PREFIX='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SP_TREE='<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
 +'<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const ROOT='xmlns:a="'+NS_A+'" xmlns:r="'+NS_R+'" xmlns:p="'+NS_P+'"';
function shape(id:number,name:string,x:number,y:number,w:number,h:number,lines:string[],
 size:number,color:string,bold=false):string{
 const paragraphs=lines.map((line,i)=>'<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>'
  +'<a:r><a:rPr lang="en-US" sz="'+size+'" b="'+(bold?"1":"0")+'">'
  +'<a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr>'
  +'<a:t>'+xml(line)+'</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>').join("");
 return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="'+xml(name)+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
  +'<p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm>'
  +'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>'
  +'<p:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0"/>'
  +'<a:lstStyle/>'+paragraphs+'</p:txBody></p:sp>';
}
function slideXml(index:number,heading:string,bullets:string[],theme:CreativeTheme):string{
 const p=PALETTES[theme];const cover=index===0;
 const background='<p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+(cover?p.dark:p.light)+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
 let shapes=shape(2,"Slide title",800000,cover?1900000:510000,10400000,cover?1400000:960000,[heading],
  cover?4400:3200,cover?p.light:p.dark,true);
 if(cover){
  shapes+=shape(3,"Subtitle",820000,3550000,10000000,720000,bullets,2200,p.accent);
 }else{
  for(let i=0;i<bullets.length;i++)shapes+=shape(3+i,"Point "+(i+1),1000000,1590000+i*685000,10300000,570000,["• "+bullets[i]],2050,p.dark);
  shapes+=shape(20,"Page",10600000,6110000,1100000,250000,[String(index)],1050,p.mid);
 }
 return PREFIX+'<p:sld '+ROOT+'><p:cSld name="Slide '+(index+1)+'">'+background+SP_TREE+shapes+'</p:spTree></p:cSld>'
  +'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
function themeXml(p:typeof PALETTES.ocean):string{
 const colors=[["dk1","000000"],["lt1","FFFFFF"],["dk2",p.dark],["lt2",p.light],
  ["accent1",p.mid],["accent2",p.accent],["accent3","5783B1"],["accent4","66AFA0"],
  ["accent5","C5819F"],["accent6","E2B45F"],["hlink",p.mid],["folHlink",p.dark]];
 return PREFIX+'<a:theme xmlns:a="'+NS_A+'" name="Universal Box"><a:themeElements><a:clrScheme name="Original">'
  +colors.map(([name,rgb])=>'<a:'+name+'><a:srgbClr val="'+rgb+'"/></a:'+name+'>').join("")
  +'</a:clrScheme><a:fontScheme name="Universal Box"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont>'
  +'<a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>'
  +'<a:fmtScheme name="Simple"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst>'
  +'<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst>'
  +'<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  +'<a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst>'
  +'</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
}
function rel(id:number,type:string,target:string){
 return '<Relationship Id="rId'+id+'" Type="'+NS_R+'/'+type+'" Target="'+target+'"/>';
}
function relationships(...items:string[]):string{return PREFIX+'<Relationships xmlns="'+NS_PR+'">'+items.join("")+'</Relationships>';}
/** Generates real, editable native PowerPoint text shapes in standard OOXML; not a rendering of static screenshots. */
export async function exportSlideDeck(input:SlideDeckInput):Promise<Uint8Array>{
 const slides=parseSlideOutline(input);
 const count=slides.length+1,p=PALETTES[input.theme],zip=new JSZip();
 const overrides=['<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
  '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
  '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
  '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'];
 for(let i=1;i<=count;i++)overrides.push('<Override PartName="/ppt/slides/slide'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>');
 zip.file("[Content_Types].xml",PREFIX+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  +'<Default Extension="xml" ContentType="application/xml"/>'+overrides.join("")+'</Types>');
 zip.file("_rels/.rels",relationships(rel(1,"officeDocument","ppt/presentation.xml")));
 zip.file("ppt/theme/theme1.xml",themeXml(p));
 zip.file("ppt/slideMasters/slideMaster1.xml",PREFIX+'<p:sldMaster '+ROOT+'><p:cSld name="Universal Box">'+SP_TREE
  +'</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" tx1="dk1" tx2="dk2" hlink="hlink" folHlink="folHlink"/>'
  +'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>');
 zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels",relationships(
  rel(1,"slideLayout","../slideLayouts/slideLayout1.xml"),rel(2,"theme","../theme/theme1.xml")));
 zip.file("ppt/slideLayouts/slideLayout1.xml",PREFIX+'<p:sldLayout '+ROOT+' type="blank" preserve="1">'
  +'<p:cSld name="Blank">'+SP_TREE+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
 zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels",relationships(rel(1,"slideMaster","../slideMasters/slideMaster1.xml")));
 zip.file("ppt/presentation.xml",PREFIX+'<p:presentation '+ROOT+'>'
  +'<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
  +'<p:sldIdLst>'+Array.from({length:count},(_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join("")+'</p:sldIdLst>'
  +'<p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>');
 zip.file("ppt/_rels/presentation.xml.rels",relationships(rel(1,"slideMaster","slideMasters/slideMaster1.xml"),
  ...Array.from({length:count},(_,i)=>rel(i+2,"slide","slides/slide"+(i+1)+".xml"))));
 for(let i=0;i<count;i++){
  const s=i===0?{title:input.title,bullets:[input.subtitle]}:slides[i-1];
  zip.file("ppt/slides/slide"+(i+1)+".xml",slideXml(i,s.title,s.bullets,input.theme));
  zip.file("ppt/slides/_rels/slide"+(i+1)+".xml.rels",relationships(rel(1,"slideLayout","../slideLayouts/slideLayout1.xml")));
 }
 const result=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(result.length>8_000_000)throw Error("Generated PowerPoint file exceeds 8 MB.");
 return result;
}
export type PosterInput=CreativeText&{format:CreativeFormat};
/** No raw HTML, external links, fonts, scripts or images. SVG text is escaped. */
export function renderCreativeSvg(input:PosterInput):string{
 assertTheme(input.theme);
 const title=value("Design headline",input.title,130),subtitle=value("Design subtitle",input.subtitle,250),
  footer=value("Design footer",input.footer,100);
 if(!title)throw Error("Design headline is required.");
 if(!["poster","certificate","social"].includes(input.format))throw Error("Unknown design format.");
 const p=PALETTES[input.theme],wide=input.format==="social",certificate=input.format==="certificate";
 const width=wide?1200:900,height=wide?675:certificate?650:1200;
 const lines=(s:string,max:number)=>{const parts:string[]=[];let rest=s;
  while(rest.length>max){let breakAt=rest.lastIndexOf(" ",max);if(breakAt<max/2)breakAt=max;
   parts.push(rest.slice(0,breakAt).trim());rest=rest.slice(breakAt).trim();
   if(parts.length===3)break;
  }
  if(rest)parts.push(rest);
  return parts.slice(0,4);
 };
 const titleLines=lines(title,wide?22:17),subLines=lines(subtitle,wide?42:30);
 const txt=(s:string,x:number,y:number,size:number,color:string,weight=400)=>
  '<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="#'+color
  +'" font-family="Arial, sans-serif" text-anchor="middle">'+xml(s)+'</text>';
 const y0=certificate?250:wide?205:430,headingSize=certificate?48:wide?64:60;
 const titlePart=titleLines.map((s,i)=>txt(s,width/2,y0+i*(headingSize+10),headingSize,certificate?p.dark:p.light,700)).join("");
 const subtitleY=y0+titleLines.length*(headingSize+10)+45;
 const subtitlePart=subLines.map((s,i)=>txt(s,width/2,subtitleY+i*43,30,certificate?p.mid:p.accent)).join("");
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'">'
  +'<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#'+p.dark+'"/><stop offset="1" stop-color="#'+p.mid+'"/></linearGradient></defs>'
  +'<rect width="100%" height="100%" fill="'+(certificate?"#"+p.light:"url(#bg)")+'"/>'
  +(certificate?'<rect x="35" y="35" width="'+(width-70)+'" height="'+(height-70)+'" fill="none" stroke="#'+p.accent+'" stroke-width="7"/>'
    :'<circle cx="'+(width-80)+'" cy="90" r="'+(wide?180:280)+'" fill="#'+p.accent+'" opacity=".15"/>')
  +'<rect x="'+(width/2-70)+'" y="'+(y0-80)+'" width="140" height="7" rx="3" fill="#'+p.accent+'"/>'
  +titlePart+subtitlePart
  +(footer?txt(footer,width/2,height-95,23,certificate?p.dark:p.light):"")
  +'</svg>';
}
