/** Meeting-minutes planner: only explicitly entered facts and assigned actions are exported.
 * No transcription synthesis, background calendar access, network sync or invented participants.
 */
import {parseWorkspaceCsv} from "./csvCleanroom";
import {mergedCsvExport} from "./csvMerge";

export type MeetingInput={
 title:string;meetingDate:string;location:string;facilitator:string;
 attendees:string;agenda:string;discussion:string;decisions:string;nextMeetingDate:string;
};
export type ActionStatus="todo"|"in_progress"|"done";
export type ActionPriority="high"|"normal"|"low";
export type MeetingAction={
 id:string;task:string;owner:string;dueDate:string;priority:ActionPriority;
 status:ActionStatus;notes:string;
};
export type MeetingPlan={
 meeting:MeetingInput;attendees:string[];agenda:string[];discussion:string[];
 decisions:string[];actions:MeetingAction[];counts:{todo:number;inProgress:number;done:number};
 actionCsv:string;
};
export const MEETING_ACTION_HEADERS=["id","task","owner","due_date","priority","status","notes"];
export const MEETING_ACTION_SAMPLE=[
 MEETING_ACTION_HEADERS.join(","),
 "A-001,Review prototype changes,Alex,2026-11-02,high,todo,Check accessibility",
 "A-002,Share project checklist,Jordan,2026-11-04,normal,in_progress,Use team template",
].join("\n");
export const MEETING_SAMPLE:MeetingInput={
 title:"Project status and next steps",meetingDate:"2026-10-21",
 location:"Meeting room / video call",facilitator:"Jordan",
 attendees:"Alex\nJordan\nLee",
 agenda:"Review current progress\nDiscuss outstanding issues\nAssign next steps",
 discussion:"Prototype ready for review.\nTwo open issues were discussed.",
 decisions:"Keep the next release scope focused.\nUse the shared handover checklist.",
 nextMeetingDate:"",
};
function field(value:string,label:string,maxLength:number,required:boolean):string{
 const trimmed=value.trim();
 if((required&&!trimmed)||trimmed.length>maxLength||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(trimmed))
  throw Error(label+" is missing, too long or contains control characters.");
 return trimmed;
}
export function meetingIsoDate(value:string,label:string,required=true):string{
 const trimmed=value.trim();
 if(!trimmed&&!required)return "";
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(trimmed))
  throw Error(label+" must use YYYY-MM-DD.");
 const date=new Date(trimmed+"T00:00:00Z");
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==trimmed)
  throw Error(label+" must be a real calendar date.");
 return trimmed;
}
function nonemptyLines(value:string,label:string,maxChars:number,maxLines:number,required:boolean):string[]{
 const raw=field(value,label,maxChars,required);
 const lines=raw?raw.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean):[];
 if(lines.length>maxLines)throw Error(label+" contains more than "+maxLines+" lines.");
 if(lines.some(x=>x.length>900))throw Error(label+" contains a line longer than 900 characters.");
 return lines;
}
export function planMeetingMinutes(input:MeetingInput,csv:string):MeetingPlan{
 const meeting:MeetingInput={
  title:field(input.title,"Meeting title",160,true),
  meetingDate:meetingIsoDate(input.meetingDate,"Meeting date"),
  location:field(input.location,"Meeting location",180,false),
  facilitator:field(input.facilitator,"Facilitator",120,false),
  attendees:field(input.attendees,"Attendees",4500,false),
  agenda:field(input.agenda,"Agenda",12000,false),
  discussion:field(input.discussion,"Discussion",24000,false),
  decisions:field(input.decisions,"Decisions",12000,false),
  nextMeetingDate:meetingIsoDate(input.nextMeetingDate,"Next meeting date",false),
 };
 if(meeting.nextMeetingDate&&meeting.nextMeetingDate<meeting.meetingDate)
  throw Error("Next meeting date cannot precede the meeting date.");
 const attendees=nonemptyLines(meeting.attendees,"Attendees",4500,50,false);
 if(new Set(attendees.map(x=>x.toLocaleLowerCase())).size!==attendees.length)
  throw Error("Attendees contain duplicate names; review the list.");
 const agenda=nonemptyLines(meeting.agenda,"Agenda",12000,60,false);
 const discussion=nonemptyLines(meeting.discussion,"Discussion",24000,100,false);
 const decisions=nonemptyLines(meeting.decisions,"Decisions",12000,60,false);
 if(!csv.trim())throw Error("Enter at least one explicitly assigned action item.");
 if(csv.length>150_000)throw Error("Action CSV must be 150,000 characters or fewer.");
 const rows=parseWorkspaceCsv(csv);
 if(rows.length<2||rows.length>81)throw Error("Meeting action list must contain 1–80 rows.");
 const header=rows[0].map(x=>x.trim().toLowerCase());
 if(header.length!==MEETING_ACTION_HEADERS.length||
  header.some((value,i)=>value!==MEETING_ACTION_HEADERS[i]))
  throw Error("Action CSV headers must match the seven-column template.");
 const used=new Set<string>();
 const actions=rows.slice(1).map((row,i):MeetingAction=>{
  const index=i+2;
  if(row.length!==7)throw Error("Action CSV line "+index+" must have 7 columns.");
  const [idRaw,taskRaw,ownerRaw,dueRaw,priorityRaw,statusRaw,notesRaw]=row;
  const id=field(idRaw,"Action ID at line "+index,50,true);
  if(!/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,49}$/u.test(id))
   throw Error("Action ID "+id+" must use Unicode letters/numbers, dot, underscore or hyphen.");
  if(used.has(id))throw Error("Duplicate action ID "+id+" at line "+index+".");
  used.add(id);
  const task=field(taskRaw,"Task at line "+index,500,true);
  const owner=field(ownerRaw,"Owner at line "+index,120,true);
  const dueDate=meetingIsoDate(dueRaw,"Action due date at line "+index);
  const priority=priorityRaw.trim().toLowerCase();
  if(!["high","normal","low"].includes(priority))
   throw Error("Priority at line "+index+" must be high, normal or low.");
  const status=statusRaw.trim().toLowerCase();
  if(!["todo","in_progress","done"].includes(status))
   throw Error("Status at line "+index+" must be todo, in_progress or done.");
  const notes=field(notesRaw,"Action notes at line "+index,500,false);
  return {id,task,owner,dueDate,priority:priority as ActionPriority,status:status as ActionStatus,notes};
 });
 const counts={
  todo:actions.filter(x=>x.status==="todo").length,
  inProgress:actions.filter(x=>x.status==="in_progress").length,
  done:actions.filter(x=>x.status==="done").length,
 };
 const actionCsv=mergedCsvExport({
  headers:MEETING_ACTION_HEADERS,
  rows:actions.map(a=>[a.id,a.task,a.owner,a.dueDate,a.priority,a.status,a.notes]),
 });
 return {meeting,attendees,agenda,discussion,decisions,actions,counts,actionCsv};
}
