/** Offline Markdown ↔ plain text, matching the website's simple note-conversion scope. */
export function markdownToPlain(input:string,keepLinks=false):string{
 return input
  .replace(/```[^\n]*\n?([\s\S]*?)```/gu,"$1")
  .replace(/`([^`\n]+)`/gu,"$1")
  .replace(/!\[[^\]]*\]\([^)]*\)/gu,"")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gu,(_all,label:string,url:string)=>keepLinks?label+" ("+url+")":label)
  .replace(/^\s{0,3}#{1,6}\s+/gmu,"")
  .replace(/^\s*[-*+]\s+/gmu,"• ")
  .replace(/^\s*\d+\.\s+/gmu,"")
  .replace(/(\*\*|__)(.*?)\1/gu,"$2")
  .replace(/(~~)(.*?)\1/gu,"$2")
  .replace(/(\*|_)(.*?)\1/gu,"$2")
  .replace(/^>\s?/gmu,"")
  .replace(/\n{3,}/gu,"\n\n")
  .trim();
}
export function plainToMarkdown(input:string):string{
 return input.split(/\n{2,}/u).map(p=>p.trim()).filter(Boolean)
  .map(p=>{
    const lines=p.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean);
    if(lines.length&&lines.every(l=>/^[•*-]\s+/u.test(l))){
      return lines.map(l=>"- "+l.replace(/^[•*-]\s+/u,"")).join("\n");
    }
    return lines.join(" ");
  }).join("\n\n");
}
export function countWords(text:string):number{return text.trim()?text.trim().split(/\s+/u).length:0;}
