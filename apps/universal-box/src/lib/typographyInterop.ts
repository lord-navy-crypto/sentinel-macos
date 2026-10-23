/** Offline plain-text typography exports. No HTML from user input is trusted or executed. */
import {AlignmentType,Document,Packer,Paragraph,TextRun,UnderlineType} from "docx";
export const TYPOGRAPHY_TEXT_LIMIT=100_000;
export const TYPOGRAPHY_LINE_LIMIT=3000;
export const FONT_FAMILIES=[
 "Arial","Times New Roman","Georgia","Courier New","Helvetica","Noto Sans CJK SC",
] as const;
export type FontFamily=typeof FONT_FAMILIES[number];
export type TextAlignment="left"|"center"|"right";
export type TypographyOptions={
 font:FontFamily;sizePt:number;bold:boolean;italic:boolean;underline:boolean;
 align:TextAlignment;asciiSymbols:boolean;
};
export const DEFAULT_TYPOGRAPHY:TypographyOptions={
 font:"Arial",sizePt:12,bold:false,italic:false,underline:false,
 align:"left",asciiSymbols:false,
};
const SPECIAL_TO_ASCII:Readonly<Record<string,string>>={
 "“":'"',"”":'"',"„":'"',"‘":"'","’":"'","‚":"'",
 "—":"--","–":"-","−":"-","…":"...","•":"*",
 "©":"(c)","®":"(R)","™":"(TM)","→":"->","←":"<-",
 "↔":"<->","✓":"[check]","✔":"[check]","×":"x","÷":"/",
 "±":"+/-","∞":"infinity","％":"%","\u00a0":" ",
 "≤":"<=","≥":">=","≠":"!=","≈":"~","√":"sqrt","²":"^2","³":"^3",
 "°":" degrees","§":"section","¶":"paragraph","№":"No.",
};
const symbolRegExp=/[“”„‘’‚—–−…•©®™→←↔✓✔×÷±∞％\u00a0≤≥≠≈√²³°§¶№]/gu;
export function simplifySymbols(input:string):string{
 return input.replace(symbolRegExp,character=>SPECIAL_TO_ASCII[character]??character);
}
export function validateTypography(text:string,options:TypographyOptions):void{
 if(!text.trim())throw Error("Enter or import non-empty text before export.");
 if(text.length>TYPOGRAPHY_TEXT_LIMIT)throw Error("Text exceeds 100,000 UTF-16 code units.");
 if(!FONT_FAMILIES.includes(options.font))throw Error("Unsupported font choice.");
 if(!Number.isInteger(options.sizePt)||options.sizePt<8||options.sizePt>48)
   throw Error("Font size must be a whole number from 8 to 48 pt.");
 if(!["left","center","right"].includes(options.align))
   throw Error("Unsupported text alignment.");
 const lineCount=text.split(/\r\n|\r|\n/u).length;
 if(lineCount>TYPOGRAPHY_LINE_LIMIT)throw Error("Too many text lines (max 3000).");
}
export function typographyText(text:string,options:TypographyOptions):string{
 validateTypography(text,options);
 return options.asciiSymbols?simplifySymbols(text):text;
}
function escapeHtml(input:string):string{
 return input.replace(/[&<>"']/gu,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
 }[ch]??ch));
}
/** Standalone UTF-8 document with escaped user text and no script/network dependencies. */
export function typographyToHtml(text:string,options:TypographyOptions):string{
 const converted=typographyText(text,options).replace(/\r\n?/gu,"\n");
 const cssFamily=options.font.replace(/\\/gu,"\\\\").replace(/"/gu,'\\"');
 return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<title>Sentinel Box formatted text</title>'+
  '<style>body{margin:28px;background:#fff;color:#111;}main{white-space:pre-wrap;'+
  'overflow-wrap:anywhere;font-family:"'+cssFamily+'",sans-serif;'+
  'font-size:'+options.sizePt+'pt;font-weight:'+(options.bold?"700":"400")+';'+
  'font-style:'+(options.italic?"italic":"normal")+';'+
  'text-decoration:'+(options.underline?"underline":"none")+';'+
  'text-align:'+options.align+';}</style></head><body><main>'+
  escapeHtml(converted)+'</main></body></html>\n';
}
/** Clipboard fragment: styled markup only, with original text safely escaped. */
export function typographyToClipboardHtml(text:string,options:TypographyOptions):string{
 const converted=typographyText(text,options).replace(/\r\n?/gu,"\n");
 return '<div style="white-space:pre-wrap;overflow-wrap:anywhere;font-family:&quot;'+
  options.font+'&quot;,sans-serif;font-size:'+options.sizePt+'pt;font-weight:'+
  (options.bold?"700":"400")+';font-style:'+(options.italic?"italic":"normal")+
  ';text-decoration:'+(options.underline?"underline":"none")+
  ';text-align:'+options.align+';">'+escapeHtml(converted)+'</div>';
}
/**
 * Safely reopen ONLY the HTML produced by this app. Uses no DOM/HTML parser,
 * loads no images/scripts/styles, and never executes imported markup.
 * Arbitrary webpages and more complex HTML are explicitly unsupported.
 */
export function extractOwnHtmlText(html:string):string{
 if(html.length>450_000)throw Error("HTML exceeds the 450 KB import limit.");
 if(!html.startsWith('<!doctype html>\n<html lang="zh-CN">')||
  !html.includes('<title>Sentinel Box formatted text</title>'))
  throw Error("Only HTML previously exported by Sentinel Box Typography can be imported.");
 const match=/<\/head><body><main>([\s\S]*?)<\/main><\/body><\/html>\s*$/u.exec(html);
 if(!match)throw Error("Unsupported HTML structure; import the original Sentinel Box export.");
 const body=match[1];
 if(body.includes("<")||/&(?!(?:amp|lt|gt|quot|#39);)/u.test(body))
  throw Error("Unsupported markup or entity in HTML content.");
 const replacements:Readonly<Record<string,string>>={
  "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'",
 };
 const decoded=body.replace(/&(?:amp|lt|gt|quot|#39);/gu,key=>replacements[key]??key);
 if(decoded.length>TYPOGRAPHY_TEXT_LIMIT)throw Error("Imported HTML text exceeds the character limit.");
 if(decoded.split("\n").length>TYPOGRAPHY_LINE_LIMIT)throw Error("Imported HTML contains too many lines.");
 return decoded;
}
export async function typographyToDocx(text:string,options:TypographyOptions):Promise<Uint8Array>{
 const converted=typographyText(text,options).replace(/\r\n?/gu,"\n");
 const alignments={left:AlignmentType.LEFT,center:AlignmentType.CENTER,right:AlignmentType.RIGHT};
 const paragraphs=converted.split("\n").map(line=>new Paragraph({
  alignment:alignments[options.align],
  children:[new TextRun({
   text:line,font:options.font,size:options.sizePt*2,
   bold:options.bold,italics:options.italic,
   underline:options.underline?{type:UnderlineType.SINGLE}:undefined,
  })],
  spacing:{after:0},
 }));
 const doc=new Document({creator:"Sentinel Box",title:"Formatted text",
  sections:[{properties:{},children:paragraphs}]});
 const bytes=new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
 if(bytes.length>8_000_000)throw Error("DOCX export exceeds 8 MB.");
 return bytes;
}
