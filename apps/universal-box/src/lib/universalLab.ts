/** Bounded offline transforms for the Universal Box v0.21 text and subtitle suite. */
export type LineOptions={
  trim:boolean;removeBlank:boolean;unique:boolean;
  sort:"none"|"ascending"|"descending";
  caseMode:"none"|"lower"|"upper";
  prefix:string;suffix:string;
};
export const LINE_DEFAULTS:LineOptions={
  trim:true,removeBlank:false,unique:false,sort:"none",caseMode:"none",prefix:"",suffix:"",
};
export function batchLines(source:string,options:LineOptions):{text:string;before:number;after:number}{
  if(source.length>200_000)throw new Error("Maximum 200,000 input characters.");
  if(options.prefix.length>100||options.suffix.length>100)throw new Error("Prefix/suffix must be 100 characters or fewer.");
  let lines=source.replace(/\r\n?/gu,"\n").split("\n");
  if(lines.length>20_000)throw new Error("Maximum 20,000 lines.");
  const before=lines.length;
  lines=lines.map(line=>{
    let item=options.trim?line.trim():line;
    if(options.caseMode==="lower")item=item.toLocaleLowerCase();
    if(options.caseMode==="upper")item=item.toLocaleUpperCase();
    return item;
  });
  if(options.removeBlank)lines=lines.filter(line=>line.trim()!=="");
  if(options.unique){
    const seen=new Set<string>();
    lines=lines.filter(line=>{if(seen.has(line))return false;seen.add(line);return true;});
  }
  if(options.sort!=="none"){
    const descending=options.sort==="descending";
    lines=[...lines].sort((a,b)=>descending?b.localeCompare(a):a.localeCompare(b));
  }
  const text=lines.map(line=>options.prefix+line+options.suffix).join("\n");
  if(text.length>500_000)throw new Error("Output exceeds 500,000 characters.");
  return {text,before,after:lines.length};
}
export type SubtitleFormat="srt"|"vtt";
export type SubtitleCue={id?:string;start:number;end:number;lines:string[]};
function timestampToMs(value:string,format:SubtitleFormat):number{
  const m=format==="srt"
    ?/^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/u.exec(value)
    :/^(?:(\d{2}):)?([0-5]?\d):([0-5]\d)\.(\d{3})$/u.exec(value);
  if(!m)throw new Error("Invalid "+format.toUpperCase()+" timestamp: "+value);
  const hours=format==="srt"?Number(m[1]):m[1]?Number(m[1]):0;
  const minutes=Number(m[2]),seconds=Number(m[3]),ms=Number(m[4]);
  const result=((hours*60+minutes)*60+seconds)*1000+ms;
  if(result>359_999_999)throw new Error("Subtitle timestamp exceeds 99:59:59.999.");
  return result;
}
function formatMs(value:number,format:SubtitleFormat):string{
  if(!Number.isSafeInteger(value)||value<0||value>359_999_999)throw new Error("Shifted timestamp outside 00:00:00–99:59:59.");
  const h=Math.floor(value/3_600_000),m=Math.floor(value/60_000)%60,s=Math.floor(value/1000)%60,ms=value%1000;
  const pad=(n:number,size:number)=>String(n).padStart(size,"0");
  return pad(h,2)+":"+pad(m,2)+":"+pad(s,2)+(format==="srt"?",":".")+pad(ms,3);
}
export function parseSubtitles(source:string,format:SubtitleFormat):SubtitleCue[]{
  if(source.length<1||source.length>2_000_000)throw new Error("Subtitles must be 1 byte–2 MB of text.");
  let text=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").trim();
  if(format==="vtt"){
    const match=/^WEBVTT[^\n]*(?:\n|$)/u.exec(text);
    if(!match)throw new Error("WebVTT files must begin with WEBVTT.");
    text=text.slice(match[0].length).trim();
  }
  const blocks=text.split(/\n\s*\n/gu).map(item=>item.trim()).filter(Boolean);
  const cues:SubtitleCue[]=[];
  for(const block of blocks){
    if(format==="vtt" && /^(NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/u.test(block)){
      // Only NOTE comments are supported; STYLE/REGION must not silently disappear.
      if(!/^NOTE(?:\s|$)/u.test(block))throw new Error("WebVTT STYLE/REGION blocks cannot be preserved by this basic converter.");
      continue;
    }
    const lines=block.split("\n");
    const timeLine=lines.findIndex(line=>line.includes("-->"));
    if(timeLine<0||timeLine>1)throw new Error("A subtitle cue needs a timestamp line.");
    const id=timeLine===1?lines[0].trim():undefined;
    const timing=/^(\S+)\s+-->\s+(\S+)(?:\s+(.+))?$/u.exec(lines[timeLine].trim());
    if(!timing)throw new Error("Malformed subtitle timing line.");
    if(timing[3])throw new Error("Cue position/settings are not supported by this lossless-text converter.");
    const start=timestampToMs(timing[1],format),end=timestampToMs(timing[2],format);
    if(end<=start)throw new Error("Each subtitle end must be later than its start.");
    const payload=lines.slice(timeLine+1);
    if(!payload.length||payload.every(line=>line.trim()===""))throw new Error("Subtitle cue text is missing.");
    if(payload.some(line=>line.length>4000))throw new Error("A subtitle line exceeds 4,000 characters.");
    cues.push({id,start,end,lines:payload});
    if(cues.length>1000)throw new Error("Maximum 1,000 subtitle cues.");
  }
  if(!cues.length)throw new Error("No subtitle cues found.");
  return cues;
}
export function convertSubtitles(
  text:string,from:SubtitleFormat,to:SubtitleFormat,shiftMs:number,
):{text:string;cues:number}{
  if(!Number.isSafeInteger(shiftMs)||Math.abs(shiftMs)>3_600_000)
    throw new Error("Shift must be an integer within ±3,600,000 milliseconds.");
  const cues=parseSubtitles(text,from);
  let output=to==="vtt"?"WEBVTT\n\n":"";
  output+=cues.map((cue,i)=>{
    const start=formatMs(cue.start+shiftMs,to),end=formatMs(cue.end+shiftMs,to);
    // SRT always uses sequential numerical IDs. VTT doesn't require cue IDs.
    const heading=to==="srt"?String(i+1)+"\n":(cue.id&&!/^\d+$/u.test(cue.id)?cue.id+"\n":"");
    return heading+start+" --> "+end+"\n"+cue.lines.join("\n");
  }).join("\n\n")+"\n";
  return {text:output,cues:cues.length};
}
export type ParsedUrl={scheme:string;host:string;path:string;fragment:string;origin:string;params:{key:string;value:string}[]};
export function inspectUrl(input:string):ParsedUrl{
  const source=input.trim();
  if(!source||source.length>5000)throw new Error("Enter one full URL (max 5,000 characters).");
  let url:URL;
  try{url=new URL(source);}catch{throw new Error("Enter a full HTTP(S) URL.");}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)
    throw new Error("Only HTTP(S) URLs without embedded credentials are supported.");
  return {scheme:url.protocol.slice(0,-1),host:url.host,path:url.pathname,fragment:url.hash,
    origin:url.origin,params:[...url.searchParams.entries()].map(([key,value])=>({key,value}))};
}
