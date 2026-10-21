/** Offline media synchronization, file grouping, and multi-event calendar planning. */
import {parseSubtitles,type SubtitleFormat,type SubtitleCue} from "./universalLab";
import {makeIcsEvent} from "./universalBox";
export type AnchorTime={originalMs:number;correctedMs:number};
export type SubtitleSync={text:string;count:number;overlaps:number;scale:number;offsetMs:number;firstMs:number;lastMs:number};
const LIMIT=359_999_999;
function msFormat(value:number,format:SubtitleFormat):string{
 if(!Number.isSafeInteger(value)||value<0||value>LIMIT)throw Error("Adjusted subtitle time is outside 00:00:00–99:59:59.");
 const h=Math.floor(value/3600000),m=Math.floor(value/60000)%60,s=Math.floor(value/1000)%60,ms=value%1000;
 return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")
  +(format==="srt"?",":".")+String(ms).padStart(3,"0");
}
function validTime(n:number):boolean{return Number.isSafeInteger(n)&&n>=0&&n<=LIMIT;}
export function resyncSubtitleCues(source:string,from:SubtitleFormat,to:SubtitleFormat,
 first:AnchorTime,last:AnchorTime):SubtitleSync{
 if(!["srt","vtt"].includes(from)||!["srt","vtt"].includes(to))throw Error("Choose SRT or VTT format.");
 for(const a of [first,last]){
  if(!validTime(a.originalMs)||!validTime(a.correctedMs))throw Error("Anchor times must be nonnegative integer milliseconds.");
 }
 const delta=last.originalMs-first.originalMs;
 if(delta<1000)throw Error("Original anchor times must be at least 1 second apart.");
 if(last.correctedMs<=first.correctedMs)throw Error("Corrected anchors must increase.");
 const scale=(last.correctedMs-first.correctedMs)/delta;
 if(scale<0.8||scale>1.2)throw Error("Resync scaling must remain between 0.8 and 1.2.");
 const offsetMs=first.correctedMs-scale*first.originalMs;
 const convert=(t:number)=>{const r=Math.round(t*scale+offsetMs);if(!validTime(r))throw Error("Subtitle resync would exceed the supported timeline.");return r;};
 const cues=parseSubtitles(source,from);
 const mapped:SubtitleCue[]=cues.map(c=>{
  const start=convert(c.start),end=convert(c.end);
  if(end<=start)throw Error("Resync made a cue duration nonpositive.");
  return {...c,start,end};
 });
 const sorted=[...mapped].sort((a,b)=>a.start-b.start);
 let overlaps=0;
 for(let i=1;i<sorted.length;i++)if(sorted[i].start<sorted[i-1].end)overlaps++;
 const head=to==="vtt"?"WEBVTT\n\n":"";
 const body=mapped.map((c,i)=>{
  const id=to==="srt"?String(i+1)+"\n":c.id&&!/^\d+$/u.test(c.id)?c.id+"\n":"";
  return id+msFormat(c.start,to)+" --> "+msFormat(c.end,to)+"\n"+c.lines.join("\n");
 }).join("\n\n");
 return {text:head+body+"\n",count:mapped.length,overlaps,scale,offsetMs,
  firstMs:mapped[0].start,lastMs:mapped[mapped.length-1].end};
}

export type OrganizedInput={name:string;size:number};
export type OrganizeBucket="Documents"|"Pictures"|"Audio"|"Videos"|"Archives"|"Code"|"Other";
export type OrganizedPlan={index:number;source:string;bucket:OrganizeBucket;path:string;size:number};
const GROUPS:Record<OrganizeBucket,Set<string>>={
 Documents:new Set(["pdf","doc","docx","ppt","pptx","xls","xlsx","txt","md","rtf","odt","ods","odp"]),
 Pictures:new Set(["png","jpg","jpeg","webp","gif","svg","heic","bmp","tif","tiff"]),
 Audio:new Set(["wav","mp3","ogg","flac","m4a","aac"]),
 Videos:new Set(["mp4","m4v","mov","webm","avi","mkv"]),
 Archives:new Set(["zip","7z","tar","gz","rar"]),
 Code:new Set(["js","jsx","ts","tsx","py","rs","go","java","c","cpp","json","yaml","yml","xml","html","css"]),
 Other:new Set(),
};
export function planOrganizedArchive(files:readonly OrganizedInput[]):OrganizedPlan[]{
 if(files.length<1||files.length>50)throw Error("Select 1–50 files explicitly.");
 const used=new Set<string>();let total=0;
 return files.map((f,i)=>{
  if(!Number.isSafeInteger(f.size)||f.size<0)throw Error("Invalid file size.");
  total+=f.size;if(total>16_000_000)throw Error("Selected files exceed 16 MB total.");
  if(!f.name||f.name.length>255)throw Error("Invalid source file name.");
  // No directory structure from user names may be carried into the ZIP.
  const clean=f.name.normalize("NFC").replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/gu,"_")
   .replace(/^\.+/u,"_").trim().slice(0,110);
  if(!clean||clean==="."||clean==="..")throw Error("Invalid file name.");
  const ext=clean.includes(".")?clean.split(".").pop()!.toLowerCase():"";
  const bucket=(Object.keys(GROUPS) as OrganizeBucket[]).find(group=>GROUPS[group].has(ext))??"Other";
  const suffix=String(i+1).padStart(3,"0");
  const path=bucket+"/"+suffix+"-"+clean;
  const key=path.toLocaleLowerCase();
  if(used.has(key))throw Error("Duplicate archive path.");used.add(key);
  return {index:i,source:f.name,bucket,path,size:f.size};
 });
}

export type CalendarRow={start:string;end:string;summary:string;location:string};
export type CalendarPlan={events:CalendarRow[];overlaps:{first:number;second:number}[];ics:string};
function dateUtc(s:string):number{
 const re=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(s);
 if(!re)throw Error("Use YYYY-MM-DDTHH:mm timestamps in UTC.");
 const [year,month,day,hour,minute]=re.slice(1).map(Number);
 const d=Date.UTC(year,month-1,day,hour,minute);
 const dt=new Date(d);
 if(dt.getUTCFullYear()!==year||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day||dt.getUTCHours()!==hour||dt.getUTCMinutes()!==minute)
  throw Error("Invalid UTC date or time.");
 if(year<1900||year>2100)throw Error("Calendar year must be 1900–2100.");
 return d;
}
/** Pipe-delimited UTC events; every row becomes a standard VEVENT in one .ics file. */
export function generateCalendarBatch(source:string,identifier:string):CalendarPlan{
 if(source.length<1||source.length>12000)throw Error("Calendar plan must contain 1–12,000 characters.");
 if(!/^[a-z0-9-]{6,80}$/iu.test(identifier))throw Error("Invalid calendar batch identifier.");
 const lines=source.replace(/\r\n?/gu,"\n").split("\n").map(s=>s.trim()).filter(Boolean);
 if(lines.length<1||lines.length>40)throw Error("Provide 1–40 events.");
 const events:CalendarRow[]=lines.map((line,i)=>{
  const parts=line.split("|").map(s=>s.trim());
  if(parts.length!==4)throw Error("Line "+(i+1)+": use Start | End | Title | Location.");
  const [start,end,summary,location]=parts;
  if(!summary||summary.length>120||location.length>300)throw Error("Event title/location is missing or too long.");
  if(dateUtc(end)<=dateUtc(start))throw Error("Line "+(i+1)+": end must be after start.");
  return {start,end,summary,location};
 });
 const overlaps:{first:number;second:number}[]=[];
 for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
  if(dateUtc(events[i].start)<dateUtc(events[j].end)&&dateUtc(events[j].start)<dateUtc(events[i].end))
   overlaps.push({first:i+1,second:j+1});
 }
 const body=events.map((e,i)=>{
  const single=makeIcsEvent({...e,description:"",uid:identifier+"-"+String(i+1)+"@daily-desk.local"});
  const match=/BEGIN:VEVENT\r\n[\s\S]*?END:VEVENT\r\n/u.exec(single);
  if(!match)throw Error("Failed to generate event.");
  return match[0];
 }).join("");
 const ics="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Universal Box//Offline Planner//EN\r\n"
  +"CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n"+body+"END:VCALENDAR\r\n";
 return {events,overlaps,ics};
}
