/** Read-only bounded hex inspection. Never writes, edits or infers MIME from a filename. */
export const HEX_MAX_BYTES=8_000_000;
export const HEX_PAGE_BYTES=512;
export const HEX_ROW_BYTES=16;
export type HexRow={offset:number;offsetHex:string;hex:string;ascii:string};
export type HexPage={start:number;end:number;total:number;rows:HexRow[]};
function asOffset(offset:number,length:number):void{
 if(!Number.isSafeInteger(offset)||offset<0||offset>length)
  throw Error("Offset must be a valid integer within the selected file.");
}
export function validateHexBytes(bytes:Uint8Array):void{
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>HEX_MAX_BYTES)
  throw Error("Choose a nonempty file up to 8 MB.");
}
export function hexHeader(bytes:Uint8Array):string{
 validateHexBytes(bytes);
 return Array.from(bytes.subarray(0,16),x=>x.toString(16).padStart(2,"0").toUpperCase()).join(" ");
}
export function buildHexPage(bytes:Uint8Array,offset:number,pageSize=HEX_PAGE_BYTES):HexPage{
 validateHexBytes(bytes);asOffset(offset,bytes.length);
 if(!Number.isSafeInteger(pageSize)||pageSize<16||pageSize>4096||pageSize%16!==0)
  throw Error("Hex page size must be a multiple of 16 between 16 and 4096.");
 const start=Math.min(Math.floor(offset/pageSize)*pageSize,Math.floor((bytes.length-1)/pageSize)*pageSize);
 const end=Math.min(bytes.length,start+pageSize),rows:HexRow[]=[];
 for(let index=start;index<end;index+=HEX_ROW_BYTES){
  const section=bytes.subarray(index,Math.min(index+HEX_ROW_BYTES,end));
  const hex=Array.from(section,x=>x.toString(16).padStart(2,"0").toUpperCase()).join(" ");
  const ascii=Array.from(section,x=>x>=32&&x<=126?String.fromCharCode(x):".").join("");
  rows.push({offset:index,offsetHex:index.toString(16).padStart(8,"0").toUpperCase(),hex,ascii});
 }
 return {start,end,total:bytes.length,rows};
}
export function parseHexPattern(value:string):Uint8Array{
 const normalized=value.trim().replace(/\s+/gu,"");
 if(!normalized||normalized.length>64||normalized.length%2!==0||!/^[0-9a-f]+$/iu.test(normalized))
  throw Error("Enter 1–32 complete hex bytes, e.g. 50 4B 03 04.");
 const out=new Uint8Array(normalized.length/2);
 for(let i=0;i<out.length;i++)out[i]=Number.parseInt(normalized.slice(i*2,i*2+2),16);
 return out;
}
export type HexSearchResult={matches:number;offsets:number[];truncated:boolean};
export function findHexBytes(bytes:Uint8Array,pattern:Uint8Array,maxResults=30):HexSearchResult{
 validateHexBytes(bytes);
 if(!(pattern instanceof Uint8Array)||!pattern.length||pattern.length>32)
  throw Error("Search pattern must contain 1–32 bytes.");
 if(!Number.isSafeInteger(maxResults)||maxResults<1||maxResults>100)
  throw Error("Search results limit must be 1–100.");
 const offsets:number[]=[];let matches=0;
 outer:for(let i=0;i<=bytes.length-pattern.length;i++){
  for(let j=0;j<pattern.length;j++)if(bytes[i+j]!==pattern[j])continue outer;
  matches++;
  if(offsets.length<maxResults)offsets.push(i);
 }
 return {matches,offsets,truncated:matches>maxResults};
}
export function hexSummary(name:string,bytes:Uint8Array):string{
 validateHexBytes(bytes);
 if(!name||name.length>250)throw Error("Invalid filename.");
 const printable=name.replace(/[\u0000-\u001f\u007f]/gu," ");
 return "Sentinel Box · Read-only Hex Summary\nFile: "+printable+"\nBytes: "+bytes.length+
  "\nHeader (up to 16 bytes): "+hexHeader(bytes)+
  "\nNote: No bytes were modified or written back to the original file.\n";
}
