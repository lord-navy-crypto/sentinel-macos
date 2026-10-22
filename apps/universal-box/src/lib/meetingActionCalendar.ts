/** RFC 5545 local calendar export for explicitly assigned meeting action due dates.
 * No VALARM, invitation delivery, calendar API, account or automatic reminder.
 */
import type {MeetingAction,MeetingPlan} from "./meetingMinutes";

export type CalendarExport={content:string;eventCount:number;skippedDone:number};
const utf8=new TextEncoder();
export const escapeIcalText=(value:string):string=>
 value.replace(/\\/gu,"\\\\").replace(/;/gu,"\\;").replace(/,/gu,"\\,")
  .replace(/\r\n|\r|\n/gu,"\\n");

/** Lines are UTF-8 octet-folded at <=75 bytes (including leading continuation space). */
export function foldIcalLine(value:string):string{
 if(value.includes("\r")||value.includes("\n"))throw Error("Calendar property contains an unescaped newline.");
 const parts:string[]=[];
 let current="",bytes=0;
 for(const point of value){
  const pointBytes=utf8.encode(point).byteLength;
  if(bytes+pointBytes>75){
   parts.push(current);
   current=" "+point;
   bytes=1+pointBytes;
  }else{
   current+=point;
   bytes+=pointBytes;
  }
 }
 parts.push(current);
 return parts.join("\r\n");
}
const line=(name:string,value:string)=>foldIcalLine(name+":"+escapeIcalText(value));
const dateToken=(iso:string):string=>iso.replaceAll("-","");
function nextDateToken(iso:string):string{
 const time=new Date(iso+"T00:00:00Z").getTime();
 if(!Number.isFinite(time))throw Error("Invalid action due date.");
 const following=new Date(time+86_400_000).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(following))throw Error("Calendar date exceeds supported year range.");
 return dateToken(following);
}
const stamp=(now:Date)=> {
 if(!Number.isFinite(now.getTime()))throw Error("Invalid calendar export time.");
 return now.toISOString().replace(/[-:]/gu,"").replace(/\.\d{3}Z$/u,"Z");
};
async function actionUid(plan:MeetingPlan,action:MeetingAction):Promise<string>{
 const raw=plan.meeting.title+"\u0000"+plan.meeting.meetingDate+"\u0000"+action.id;
 const bytes=utf8.encode(raw);
 const sha=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(sha)].map(x=>x.toString(16).padStart(2,"0")).join("")+"@sentinel-box.local";
}
export async function createMeetingActionCalendar(
 plan:MeetingPlan,{includeDone=false,now=new Date()}:{includeDone?:boolean;now?:Date}={},
):Promise<CalendarExport>{
 if(!globalThis.crypto?.subtle)throw Error("Local SHA-256 is needed to assign stable calendar IDs.");
 if(plan.actions.length<1||plan.actions.length>80)throw Error("Invalid number of meeting tasks.");
 const items=plan.actions.filter(x=>includeDone||x.status!=="done");
 const out=[
  "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Sentinel Box//Offline Meeting Actions//EN",
  "CALSCALE:GREGORIAN","METHOD:PUBLISH",
  line("X-WR-CALNAME","Sentinel Box meeting action deadlines"),
 ];
 const utc=stamp(now);
 for(const action of items){
  const description=[
   "Meeting: "+plan.meeting.title,
   "Action ID: "+action.id,
   "Assigned owner: "+action.owner,
   "Priority: "+action.priority,
   "Recorded status: "+action.status,
   ...(action.notes?["Notes: "+action.notes]:[]),
   "Offline snapshot; import manually. No notification was scheduled.",
  ].join("\n");
  const title="Due: "+action.task;
  out.push(
   "BEGIN:VEVENT",
   "UID:"+await actionUid(plan,action),
   "DTSTAMP:"+utc,
   "DTSTART;VALUE=DATE:"+dateToken(action.dueDate),
   "DTEND;VALUE=DATE:"+nextDateToken(action.dueDate),
   "TRANSP:TRANSPARENT",
   "STATUS:CONFIRMED",
   line("SUMMARY",title),
   line("DESCRIPTION",description),
   "END:VEVENT",
  );
 }
 out.push("END:VCALENDAR");
 return {content:out.join("\r\n")+"\r\n",
  eventCount:items.length,
  skippedDone:plan.actions.length-items.length};
}
