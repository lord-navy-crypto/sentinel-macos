/** Common HTML entity + Unicode normalization helpers; never execute rendered HTML. */
const NAMED:Record<string,string>={
 amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0",copy:"©",reg:"®",
 trade:"™",ndash:"–",mdash:"—",hellip:"…",bull:"•",euro:"€",pound:"£",yen:"¥",
};
export function encodeHtmlEntities(input:string):string{
 if(input.length>100_000)throw Error("Maximum 100,000 text characters.");
 return input.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
   .replace(/"/gu,"&quot;").replace(/'/gu,"&apos;");
}
export function decodeHtmlEntities(input:string):string{
 if(input.length>100_000)throw Error("Maximum 100,000 text characters.");
 return input.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z][a-zA-Z0-9]+);/gu,(source,token:string)=>{
   if(Object.prototype.hasOwnProperty.call(NAMED,token))return NAMED[token];
   if(token.startsWith("#")){
     const hex=/^#x/iu.test(token),value=Number.parseInt(token.slice(hex?2:1),hex?16:10);
     if(!Number.isInteger(value)||value<1||value>0x10ffff||(value>=0xd800&&value<=0xdfff))
       throw Error("Invalid numeric HTML entity.");
     return String.fromCodePoint(value);
   }
   // Unsupported names remain visible as literal text rather than guessed conversions.
   return source;
 });
}
export function normalizeText(input:string,form:"NFC"|"NFKC"):string{
 if(input.length>100_000)throw Error("Maximum 100,000 text characters.");
 if(form!=="NFC"&&form!=="NFKC")throw Error("Invalid normalization choice.");
 return input.normalize(form);
}
