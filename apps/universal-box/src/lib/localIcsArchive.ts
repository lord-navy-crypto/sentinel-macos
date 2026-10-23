/** Explicit-file, offline read-only RFC5545 VEVENT subset.
 * No timezone database, recurrence expansion, network fetching or OS Calendar access.
 * Reference: https://www.rfc-editor.org/rfc/rfc5545
 */
export const ICS_MAX_BYTES=750_000;
export const ICS_MAX_EVENTS=400;
export type IcsRecord={
 uid:string;start:string;end:string;allDay:boolean;title:string;location:string;description:string;
};
export type IcsArchive={events:IcsRecord[];timedConflicts:number;ignoredProperties:number};
const RECURRING=new Set(["RRULE","RDATE","EXDATE","RECURRENCE-ID"]);
function text(value:string,max=500):string{
 const out=value.replace(/\\([nN,;\\])/gu,(_match:string,char:string)=>
  char==="n"||char==="N"?"\n":char).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,"");
 if(out.length>max)throw Error("A calendar text field exceeds its safety limit.");
 return out;
}
function unfoldedLines(raw:string):string[]{
 const physical=raw.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split("\n");
 const lines:string[]=[];
 for(const current of physical){
  if(current.startsWith(" ")||current.startsWith("\t")){
   if(!lines.length)throw Error("ICS folded line has no preceding line.");
   lines[lines.length-1]+=current.slice(1);
  }else if(current)lines.push(current);
  if(lines.length>20000)throw Error("ICS contains too many lines.");
  if(lines.length&&lines[lines.length-1].length>10000)throw Error("ICS contains an excessive property.");
 }
 return lines;
}
function parseTime(property:string,raw:string):{value:string;allDay:boolean;epoch:number}{
 const dateOnly=/^(\d{4})(\d{2})(\d{2})$/u.exec(raw);
 const dateTime=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(raw);
 if(!dateOnly&&!dateTime)
  throw Error("Only DATE all-day and UTC Z timestamps are supported; TZID or floating times require calendar software.");
 const allDay=!!dateOnly;
 if((allDay&&!/^(?:;VALUE=DATE)?$/iu.test(property))||
    (!allDay&&property!==""))
  throw Error("Unsupported ICS date/time parameters; export as UTC timestamps or DATE.");
 const match=dateOnly??dateTime!;
 const [year,month,day]=match.slice(1,4).map(Number);
 const [hour,minute,second]=allDay?[0,0,0]:match.slice(4,7).map(Number);
 if(year<1900||year>2100)throw Error("ICS year must be within 1900–2100.");
 const epoch=Date.UTC(year,month-1,day,hour,minute,second),d=new Date(epoch);
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day||
    d.getUTCHours()!==hour||d.getUTCMinutes()!==minute||d.getUTCSeconds()!==second)
  throw Error("ICS contains an impossible date or UTC time.");
 return {value:allDay?
  raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8):
  d.toISOString().slice(0,19)+"Z",allDay,epoch};
}
export function parseLocalIcs(source:string,bytes:number):IcsArchive{
 if(typeof source!=="string"||!Number.isSafeInteger(bytes)||bytes<40||bytes>ICS_MAX_BYTES||
    source.length>ICS_MAX_BYTES||source.includes("\u0000"))
  throw Error("Select a UTF-8 .ics file between 40 bytes and 750 KB.");
 const lines=unfoldedLines(source);
 if(lines[0]?.toUpperCase()!=="BEGIN:VCALENDAR"||
    lines.at(-1)?.toUpperCase()!=="END:VCALENDAR")
  throw Error("ICS must have exactly one BEGIN:VCALENDAR and END:VCALENDAR.");
 const events:IcsRecord[]=[];
 let calendarVersion=false,inEvent=false,insideOther=0,ignoredProperties=0;
 let fields=new Map<string,{value:string;params:string}>();
 function finish(){
  const summary=fields.get("SUMMARY")?.value??"",start=fields.get("DTSTART"),end=fields.get("DTEND");
  if(!start||!end||!summary)throw Error("VEVENT requires DTSTART, DTEND and SUMMARY.");
  const first=parseTime(start.params,start.value),last=parseTime(end.params,end.value);
  if(first.allDay!==last.allDay)throw Error("VEVENT mixes all-day and UTC timed events.");
  if(last.epoch<=first.epoch||last.epoch-first.epoch>366*86400000)
   throw Error("VEVENT end must follow start within 366 days.");
  events.push({
   uid:text(fields.get("UID")?.value??"",255),start:first.value,end:last.value,allDay:first.allDay,
   title:text(summary,300),location:text(fields.get("LOCATION")?.value??"",400),
   description:text(fields.get("DESCRIPTION")?.value??"",1000),
  });
  if(events.length>ICS_MAX_EVENTS)throw Error("ICS exceeds 400 events.");
  fields=new Map();inEvent=false;
 }
 for(let index=1;index<lines.length-1;index++){
  const line=lines[index];
  const colon=line.indexOf(":");
  if(colon<1)throw Error("ICS contains an invalid property.");
  const prefix=line.slice(0,colon),value=line.slice(colon+1);
  const semicolon=prefix.indexOf(";");
  const key=(semicolon<0?prefix:prefix.slice(0,semicolon)).toUpperCase();
  const params=semicolon<0?"":prefix.slice(semicolon);
  if(key==="BEGIN"){
   if(value.toUpperCase()==="VEVENT"){
    if(inEvent||insideOther)throw Error("Nested or misplaced VEVENT.");
    inEvent=true;fields=new Map();
   }else if(value.toUpperCase()==="VALARM"&&inEvent){
    insideOther++;
   }else throw Error("Unsupported nested ICS component.");
   continue;
  }
  if(key==="END"){
   if(value.toUpperCase()==="VALARM"&&insideOther>0){insideOther--;continue;}
   if(value.toUpperCase()!=="VEVENT"||!inEvent||insideOther)
    throw Error("ICS component boundaries do not match.");
   finish();continue;
  }
  if(insideOther)continue;
  if(!inEvent){
   if(key==="VERSION"){if(calendarVersion||value!=="2.0")throw Error("ICS requires VERSION:2.0.");calendarVersion=true;}
   else ignoredProperties++;
   continue;
  }
  if(RECURRING.has(key))throw Error("Recurring ICS events are not supported; use a calendar app to expand the series.");
  if(["DTSTART","DTEND","SUMMARY","LOCATION","DESCRIPTION","UID"].includes(key)){
   if(fields.has(key))throw Error("VEVENT has duplicate "+key+" fields.");
   if(params&&key!=="DTSTART"&&key!=="DTEND")
    throw Error("Unsupported property parameters for "+key+".");
   fields.set(key,{value,params});
  }else ignoredProperties++;
 }
 if(inEvent||insideOther||!calendarVersion||!events.length)
  throw Error("ICS has no complete nonrecurring events or valid calendar version.");
 let timedConflicts=0;
 const timed=events.filter(x=>!x.allDay).map(x=>({
  start:Date.parse(x.start),end:Date.parse(x.end)
 })).sort((a,b)=>a.start-b.start);
 // Count each overlapping pair, not just adjacent events.
 for(let i=0;i<timed.length;i++)
  for(let j=i+1;j<timed.length&&timed[j].start<timed[i].end;j++)
   if(timed[j].end>timed[i].start)timedConflicts++;
 return {events,timedConflicts,ignoredProperties};
}
function cell(value:string):string{
 const sanitized=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+sanitized.replace(/"/gu,'""')+'"';
}
export function icsToCsv(report:IcsArchive):string{
 if(!report.events.length||report.events.length>ICS_MAX_EVENTS)throw Error("ICS event count out of range.");
 const rows=report.events.map((item,index)=>[
  String(index+1),cell(item.start),cell(item.end),item.allDay?"true":"false",
  cell(item.title),cell(item.location),cell(item.description),cell(item.uid),
 ].join(","));
 return "\uFEFFindex,start_utc_or_date,end_utc_or_date,all_day,title,location,description,uid\r\n"+
  rows.join("\r\n")+"\r\n";
}
