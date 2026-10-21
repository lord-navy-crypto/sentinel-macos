/** Render a real editable Word minutes document + action-list CSV from explicitly entered facts. */
import JSZip from "jszip";
import {Document,HeadingLevel,Packer,Paragraph,TextRun} from "docx";
import type {MeetingPlan} from "./meetingMinutes";

const paragraph=(text:string,bold=false)=>new Paragraph({
 children:[new TextRun({text,bold,font:"Arial",size:22})],
 spacing:{after:105},
});
const heading=(value:string)=>new Paragraph({
 text:value,heading:HeadingLevel.HEADING_2,spacing:{before:260,after:130},
});
const bullet=(value:string)=>new Paragraph({
 children:[new TextRun({text:value,font:"Arial",size:21})],
 bullet:{level:0},spacing:{after:80},
});
export function meetingMinutesText(plan:MeetingPlan):string{
 const m=plan.meeting;
 const lines=[
  "MEETING MINUTES / 会议纪要",
  "Title: "+m.title,
  "Date: "+m.meetingDate,
  ...(m.location?["Location: "+m.location]:[]),
  ...(m.facilitator?["Facilitator: "+m.facilitator]:[]),
  "Attendees: "+(plan.attendees.length?plan.attendees.join(", "):"(not specified)"),
  "",
  "AGENDA",
  ...(plan.agenda.length?plan.agenda.map(x=>"- "+x):["(not specified)"]),
  "",
  "DISCUSSION (entered by user)",
  ...(plan.discussion.length?plan.discussion.map(x=>"- "+x):["(not specified)"]),
  "",
  "DECISIONS (entered by user)",
  ...(plan.decisions.length?plan.decisions.map(x=>"- "+x):["(none recorded)"]),
  "",
  "ASSIGNED ACTIONS",
  ...plan.actions.flatMap(a=>[
   a.id+": "+a.task,
   "  Owner: "+a.owner+" | Due: "+a.dueDate+" | Priority: "+a.priority+" | Status: "+a.status,
   ...(a.notes?["  Notes: "+a.notes]:[]),
  ]),
  "",
  "ACTION STATUS",
  "To do: "+plan.counts.todo+" | In progress: "+plan.counts.inProgress+" | Done: "+plan.counts.done,
  ...(m.nextMeetingDate?["Next meeting: "+m.nextMeetingDate]:[]),
  "",
  "Only user-entered facts and assignments appear above; no transcript or attendance was inferred.",
 ];
 return lines.join("\n")+"\n";
}
export async function exportMeetingMinutes(plan:MeetingPlan):Promise<Uint8Array>{
 if(plan.actions.length<1||plan.actions.length>80)throw Error("Meeting action count is invalid.");
 const m=plan.meeting;
 const sections=[
  new Paragraph({text:"MEETING MINUTES / 会议纪要",heading:HeadingLevel.TITLE}),
  paragraph(m.title,true),paragraph("Meeting date: "+m.meetingDate),
  ...(m.location?[paragraph("Location: "+m.location)]:[]),
  ...(m.facilitator?[paragraph("Facilitator: "+m.facilitator)]:[]),
  heading("Attendees / 参会者"),
  ...(plan.attendees.length?plan.attendees.map(bullet):[paragraph("No attendees listed.")]),
  heading("Agenda / 议程"),
  ...(plan.agenda.length?plan.agenda.map(bullet):[paragraph("No agenda entered.")]),
  heading("Discussion / 讨论记录"),
  ...(plan.discussion.length?plan.discussion.map(paragraph):[paragraph("No discussion recorded.")]),
  heading("Decisions / 决议"),
  ...(plan.decisions.length?plan.decisions.map(bullet):[paragraph("No decisions recorded.")]),
  heading("Action items / 待办事项"),
  ...plan.actions.flatMap(action=>[
   paragraph(action.id+" — "+action.task,true),
   paragraph("Owner: "+action.owner+"     Due: "+action.dueDate+
    "     Priority: "+action.priority+"     Status: "+action.status),
   ...(action.notes?[paragraph("Notes: "+action.notes)]:[]),
  ]),
  heading("Status overview / 任务状态"),
  paragraph("To do: "+plan.counts.todo+"    In progress: "+plan.counts.inProgress+
   "    Completed: "+plan.counts.done),
  ...(m.nextMeetingDate?[paragraph("Next meeting: "+m.nextMeetingDate)]:[]),
  paragraph("Generated from user-entered notes and assigned tasks only. Verify before sharing."),
 ];
 const word=new Document({
  creator:"Sentinel Box",title:m.title,
  sections:[{properties:{},children:sections}],
 });
 const docxBytes=new Uint8Array(await (await Packer.toBlob(word)).arrayBuffer());
 if(docxBytes.length>12_000_000)throw Error("Meeting Word document exceeds the 12 MB limit.");
 const zip=new JSZip();
 zip.file("meeting/meeting-minutes.docx",docxBytes);
 zip.file("meeting/meeting-minutes.txt",meetingMinutesText(plan));
 // UTF-8 BOM improves Excel interoperability, with CSV cells formula-protected.
 zip.file("actions/assigned-actions.csv","\uFEFF"+plan.actionCsv);
 zip.file("reports/manifest.json",JSON.stringify({
  generatedBy:"Sentinel Box — user-entered meeting minutes",
  date:m.meetingDate,actionCount:plan.actions.length,statusCounts:plan.counts,
  files:["meeting/meeting-minutes.docx","meeting/meeting-minutes.txt","actions/assigned-actions.csv"],
  limitations:[
   "No audio transcript, attendance, deadlines, participants or decisions were inferred.",
   "Task CSV is an offline snapshot; no notifications, emails or calendar events were created.",
   "Review names, owners, dates and decisions before distributing.",
  ],
 },null,2));
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
 if(bytes.length>20_000_000)throw Error("Meeting archive exceeds the 20 MB export limit.");
 return bytes;
}
