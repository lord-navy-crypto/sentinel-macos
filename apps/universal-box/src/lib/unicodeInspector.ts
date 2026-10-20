/** Explicit inspection only: never silently edits source Unicode. */
export type UnicodeFinding={index:number;line:number;column:number;codePoint:string;name:string;kind:string};
const NAMES:Record<number,[string,string]>={
  0x00ad:["Soft hyphen","Formatting"],
  0x034f:["Combining grapheme joiner","Invisible"],
  0x061c:["Arabic letter mark","Bidirectional"],
  0x180e:["Mongolian vowel separator","Invisible"],
  0x200b:["Zero width space","Invisible"],
  0x200c:["Zero width non-joiner","Invisible"],
  0x200d:["Zero width joiner","Invisible"],
  0x200e:["Left-to-right mark","Bidirectional"],
  0x200f:["Right-to-left mark","Bidirectional"],
  0x202a:["Left-to-right embedding","Bidirectional"],
  0x202b:["Right-to-left embedding","Bidirectional"],
  0x202c:["Pop directional formatting","Bidirectional"],
  0x202d:["Left-to-right override","Bidirectional"],
  0x202e:["Right-to-left override","Bidirectional"],
  0x2060:["Word joiner","Invisible"],
  0x2061:["Function application","Invisible"],
  0x2062:["Invisible times","Invisible"],
  0x2063:["Invisible separator","Invisible"],
  0x2064:["Invisible plus","Invisible"],
  0x2066:["Left-to-right isolate","Bidirectional"],
  0x2067:["Right-to-left isolate","Bidirectional"],
  0x2068:["First strong isolate","Bidirectional"],
  0x2069:["Pop directional isolate","Bidirectional"],
  0xfeff:["Byte order mark / zero width no-break space","Invisible"],
};
function category(cp:number):[string,string]|null{
 if(NAMES[cp])return NAMES[cp];
 if(cp>=0xfe00&&cp<=0xfe0f)return ["Variation selector","Formatting"];
 if(cp>=0x1f3fb&&cp<=0x1f3ff)return null; // emoji skin tones are visible meaningful characters
 if(cp>=0xe0100&&cp<=0xe01ef)return ["Supplementary variation selector","Formatting"];
 if(cp>=0&&cp<=0x1f&&![9,10,13].includes(cp))
   return ["C0 control character","Control"];
 if(cp===0x7f)return ["Delete control character","Control"];
 if(cp>=0x80&&cp<=0x9f)return ["C1 control character","Control"];
 return null;
}
export function inspectUnicode(source:string):UnicodeFinding[]{
 if(source.length>50_000)throw Error("Unicode inspector supports at most 50,000 UTF-16 code units.");
 const result:UnicodeFinding[]=[];
 let line=1,column=1;
 for(let i=0;i<source.length;){
   const cp=source.codePointAt(i)!;
   const codeLength=cp>0xffff?2:1;
   const data=category(cp);
   if(data){
     result.push({index:i,line,column,codePoint:"U+"+cp.toString(16).toUpperCase().padStart(4,"0"),name:data[0],kind:data[1]});
     if(result.length>500)throw Error("More than 500 special characters found; shorten the input.");
   }
   if(cp===10){line++;column=1;}
   else if(cp!==13)column++;
   i+=codeLength;
 }
 return result;
}
