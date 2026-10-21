/** Read standard UTC, non-recurring VEVENTs from a user-provided ICS file. */
import {mergedCsvExport} from "./csvMerge";
export type ImportedEvent={summary:string;start:string;end:string;location:string;uid:string};
export type IcsImportResult={events:ImportedEvent[];overlaps:{first:number;second:number}[]};
function utcStamp(s:string):string{
 const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(s);
 if(!m)throw Error("Only UTC DTSTART/DTEND in YYYYMMDDTHHMMSSZ format are supported; local TZID and all-day events need conversion first.");
 const [y,mo,d,h,mi,se]=m.slice(1).map(Number);
 if(y<1900||y>2100)throw Error("ICS year must be 1900–2100.");
 const stamp=Date.UTC(y,mo-1,d,h,mi,se),date=new Date(stamp);
 if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==mo||date.getUTCDate()!==d||
    date.getUTCHours()!==h||date.getUTCMinutes()!==mi||date.getUTCSeconds()!==se)
   throw Error("Invalid ICS date or time.");
 return date.toISOString().replace(".000Z","Z");
}
function unescapeIcs(s:string):string{
 return s.replace(/\\([nN,;\\])/gu,(_whole:string,ch:string)=>ch.toLowerCase()==="n"?"\n":ch);
}
export function importIcs(source:string):IcsImportResult{
 if(!source.trim()||source.length>500_000)throw Error("ICS must contain 1–500,000 characters.");
 const raw=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n");
 const physical=raw.split("\n");
 if(physical.length>12000)throw Error("ICS file contains too many lines.");
 const unfolded:string[]=[];
 for(const line of physical){
  if(/^[ \t]/u.test(line)){
   if(!unfolded.length)throw Error("ICS folding starts without a preceding property.");
   unfolded[unfolded.length-1]+=line.slice(1);
  }else unfolded.push(line);
 }
 if(!unfolded.some(x=>x.trim()==="BEGIN:VCALENDAR")||!unfolded.some(x=>x.trim()==="END:VCALENDAR"))
  throw Error("Expected a complete VCALENDAR document.");
 const events:ImportedEvent[]=[];
 let fields=new Map<string,string>(),inside=false;
 for(const line of unfolded){
  if(line==="BEGIN:VEVENT"){
   if(inside)throw Error("Nested VEVENT is invalid.");
   inside=true;fields=new Map();continue;
  }
  if(line==="END:VEVENT"){
   if(!inside)throw Error("Unexpected END:VEVENT.");
   if(fields.has("RRULE")||fields.has("RDATE")||fields.has("EXDATE")||fields.has("RECURRENCE-ID"))
    throw Error("Recurring calendar events are not supported; expand recurrences before importing.");
   const start=utcStamp(fields.get("DTSTART")??""),end=utcStamp(fields.get("DTEND")??"");
   if(Date.parse(end)<=Date.parse(start))throw Error("ICS event end must follow start.");
   const summary=unescapeIcs(fields.get("SUMMARY")??"").trim();
   const location=unescapeIcs(fields.get("LOCATION")??"").trim();
   const uid=fields.get("UID")??"";
   if(!summary||summary.length>200||location.length>300||uid.length>300)
    throw Error("Calendar event title, location or UID is invalid.");
   events.push({summary,start,end,location,uid});
   if(events.length>200)throw Error("Maximum 200 ICS events.");
   inside=false;continue;
  }
  if(!inside)continue;
  const sep=line.indexOf(":");if(sep<1)continue;
  const rawKey=line.slice(0,sep).toUpperCase(),value=line.slice(sep+1);
  if(value.length>5000)throw Error("Calendar property value too large.");
  if(/^(DTSTART|DTEND)(;|$)/u.test(rawKey)){
   if(!/^(DTSTART|DTEND)(;VALUE=DATE-TIME)?$/u.test(rawKey))
    throw Error("TZID and all-day date properties are not supported; UTC timestamps are required.");
   const base=rawKey.split(";")[0];
   if(fields.has(base))throw Error("Duplicate "+base+" in VEVENT.");
   fields.set(base,value);
  }else if(["RRULE","RDATE","EXDATE","RECURRENCE-ID","SUMMARY","LOCATION","UID"].includes(rawKey)){
   if(fields.has(rawKey))throw Error("Duplicate "+rawKey+" in VEVENT.");
   fields.set(rawKey,value);
  }
 }
 if(inside)throw Error("VEVENT was not closed.");
 if(!events.length)throw Error("No supported VEVENT records in ICS.");
 const overlaps:{first:number;second:number}[]=[];
 for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
  if(Date.parse(events[i].start)<Date.parse(events[j].end)&&Date.parse(events[j].start)<Date.parse(events[i].end))
   overlaps.push({first:i+1,second:j+1});
  if(overlaps.length>1000)throw Error("Too many calendar overlaps to report safely.");
 }
 return {events,overlaps};
}
export function icsToCsv(events:readonly ImportedEvent[]):string{
 if(!events.length||events.length>200)throw Error("Invalid imported ICS event count.");
 return "\uFEFF"+mergedCsvExport({headers:["start_utc","end_utc","summary","location","uid"],
  rows:events.map(x=>[x.start,x.end,x.summary,x.location,x.uid])});
}
