import { Document, HeadingLevel, Packer, Paragraph, TextRun, type Math } from "docx";
import {latexToNativeMath,validateMathDelimiters} from "./nativeMathInterop";

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
/** Split inline $...$ math without decoding formulas or changing numeric precision. */
function mixedRuns(content:string,extra:{italic?:boolean;code?:boolean}={}):Array<TextRun|Math>{
 if(extra.code)return runs(content,extra);
 const result:Array<TextRun|Math>=[];
 let start=0,at=0;
 const escaped=(index:number)=>{
  let slashes=0;for(let p=index-1;p>=0&&content[p]==="\\";p--)slashes++;
  return slashes%2===1;
 };
 while(at<content.length){
  if(content[at]!=="$"||escaped(at)||content[at+1]==="$"){at++;continue;}
  let end=at+1;
  while(end<content.length&&(content[end]!=="$"||escaped(end)))end++;
  if(end>=content.length){at++;continue;}
  const equation=content.slice(at+1,end);
  if(!equation.trim()){at=end+1;continue;}
  if(at>start)result.push(...runs(content.slice(start,at),extra));
  result.push(latexToNativeMath(equation));
  at=end+1;start=at;
 }
 if(start<content.length)result.push(...runs(content.slice(start),extra));
 return result.length?result:runs("",extra);
}
/** Word DOCX export: Markdown structure plus real editable Office Math equations.
 * Unrecognized LaTeX fails the export rather than silently corrupting mathematics.
 */
export function mathAwareDocxParagraphs(markdown:string):Paragraph[]{
 validateMathDelimiters(markdown);
 const lines=markdown.split(/\r?\n/u);
 const out:Paragraph[]=[];
 const headingLevels=[
  HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6,
 ];
 let codeFence=false,mathCount=0;
 const marker=String.fromCharCode(96).repeat(3);
 for(let i=0;i<lines.length;i++){
  const raw=lines[i],trimmed=raw.trim();
  if(trimmed.startsWith(marker)){codeFence=!codeFence;continue;}
  if(!codeFence&&trimmed.startsWith("$")){
   let latex=trimmed.slice(2);
   if(latex.endsWith("$"))latex=latex.slice(0,-2);
   else{
    let closed=false;
    while(++i<lines.length){
     const item=lines[i].trim();
     if(item.endsWith("$")){latex+="\n"+item.slice(0,-2);closed=true;break;}
     latex+="\n"+item;
    }
    if(!closed)throw Error("Unclosed $ math block. Close the equation before exporting.");
   }
   if(++mathCount>40)throw Error("At most 40 equations are supported per DOCX export.");
   out.push(new Paragraph({children:[latexToNativeMath(latex)],spacing:{after:160}}));
   continue;
  }
  const block=codeFence?{kind:"code" as const,content:raw}:parseMarkdownBlocks(raw)[0];
  if(!block)continue;
  const heading=block.kind==="heading",bullet=block.kind==="list",quote=block.kind==="quote";
  const inlineMathCount=codeFence?0:(block.content.match(/(?<!\\)\$[^$\n]+\$/gu)??[]).length;
  mathCount+=inlineMathCount;
  if(mathCount>40)throw Error("At most 40 equations are supported per DOCX export.");
  out.push(new Paragraph({
   heading:heading?headingLevels[(block.level??1)-1]:undefined,
   bullet:bullet?{level:0}:undefined,
   children:codeFence?runs(raw,{code:true}):mixedRuns(block.content,{italic:quote}),
   indent:quote?{left:500}:undefined,
   spacing:{after:heading?200:95},
  }));
 }
 if(codeFence)throw Error("Unclosed Markdown code fence.");
 return out;
}
export async function markdownToDocx(markdown:string):Promise<Uint8Array>{
  const document=new Document({
    creator:"Sentinel Box",
    title:"Sentinel Box Document",
    sections:[{properties:{},children:mathAwareDocxParagraphs(markdown)}],
  });
  const blob=await Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}
