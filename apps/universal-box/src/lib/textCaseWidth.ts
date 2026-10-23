/** Small, explicit offline text conversions. Original input is never mutated. */
export type TextCaseMode="upper"|"lower"|"title"|"halfwidth";
export const TEXT_CASE_LIMIT=200_000;

/** Only fullwidth ASCII and the ideographic space are converted: no lossy NFKC of CJK text. */
export function halfwidthAscii(input:string):string{
 return input.replace(/[\uFF01-\uFF5E\u3000]/gu,ch=>{
  const cp=ch.codePointAt(0)!;
  return cp===0x3000?" ":String.fromCodePoint(cp-0xFEE0);
 });
}

/** Simple word-initial case, not a linguistically complete title-style engine. */
function titleCase(input:string):string{
 return input.replace(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu,word=>{
  const chars=Array.from(word);
  if(!chars.length)return word;
  return chars[0].toUpperCase()+chars.slice(1).join("").toLowerCase();
 });
}
export function transformTextCase(input:string,mode:TextCaseMode):string{
 if(input.length>TEXT_CASE_LIMIT)throw Error("Text exceeds the 200,000-character limit.");
 switch(mode){
  case "upper":return input.toUpperCase();
  case "lower":return input.toLowerCase();
  case "title":return titleCase(input);
  case "halfwidth":return halfwidthAscii(input);
  default:throw Error("Unsupported text transformation.");
 }
}
