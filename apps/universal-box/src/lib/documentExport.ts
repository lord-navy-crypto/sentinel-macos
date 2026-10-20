import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export type DocumentBlock = {kind:"paragraph"|"heading"|"list"|"quote"|"code";content:string;level?:number};
export type StyledSpan = {text:string;bold?:boolean;italic?:boolean;strike?:boolean;code?:boolean};

/** Convert a small, predictable subset of Markdown inline styles into DOCX text runs. */
export function parseInlineMarkdown(source:string):StyledSpan[]{
  const parts:StyledSpan[]=[];
  const token=/(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/gu;
  let index=0;
  for(const match of source.matchAll(token)){
    const start=match.index??0;
    if(start>index)parts.push({text:source.slice(index,start)});
    const value=match[0];
    const pair=value.startsWith("**")||value.startsWith("__")||value.startsWith("~~");
    const text=value.slice(pair?2:1,pair?-2:-1);
    if(value.startsWith("**")||value.startsWith("__"))parts.push({text,bold:true});
    else if(value.startsWith("~~"))parts.push({text,strike:true});
    else if(value.startsWith("`"))parts.push({text,code:true});
    else parts.push({text,italic:true});
    index=start+value.length;
  }
  if(index<source.length)parts.push({text:source.slice(index)});
  return parts.length?parts:[{text:""}];
}

export function parseMarkdownBlocks(input:string):DocumentBlock[]{
  const output:DocumentBlock[]=[];
  let code=false;
  for(const line of input.split(/\r?\n/u)){
    if(line.trim().startsWith("```")){code=!code;continue;}
    if(code){output.push({kind:"code",content:line});continue;}
    if(!line.trim()){output.push({kind:"paragraph",content:""});continue;}
    const heading=/^(#{1,6})\s+(.+)$/u.exec(line);
    if(heading){output.push({kind:"heading",level:heading[1].length,content:heading[2]});continue;}
    const list=/^\s*(?:[-*+]\s+|\d+\.\s+)(.*)$/u.exec(line);
    if(list){output.push({kind:"list",content:list[1]});continue;}
    if(line.trimStart().startsWith("> ")){output.push({kind:"quote",content:line.trimStart().slice(2)});continue;}
    output.push({kind:"paragraph",content:line});
  }
  return output.slice(0,5000);
}
function runs(content:string,extra:{italic?:boolean;code?:boolean}={}):TextRun[]{
  return parseInlineMarkdown(content).map(span=>new TextRun({
    text:span.text,
    bold:span.bold,
    italics:span.italic||extra.italic,
    strike:span.strike,
    font:(span.code||extra.code)?"Consolas":"Arial",
    size:22,
  }));
}
export function docxParagraphs(markdown:string):Paragraph[]{
  const levels=[
    HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6,
  ];
  return parseMarkdownBlocks(markdown).map(block=>{
    const heading=block.kind==="heading";
    const bullet=block.kind==="list";
    const quote=block.kind==="quote";
    return new Paragraph({
      heading:heading?levels[(block.level??1)-1]:undefined,
      bullet:bullet?{level:0}:undefined,
      children:runs(block.content,{italic:quote,code:block.kind==="code"}),
      indent:quote?{left:500}:undefined,
      spacing:{after:heading?200:95},
    });
  });
}
export async function markdownToDocx(markdown:string):Promise<Uint8Array>{
  const document=new Document({
    creator:"Daily Desk",
    title:"Daily Desk Document",
    sections:[{properties:{},children:docxParagraphs(markdown)}],
  });
  const blob=await Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}
