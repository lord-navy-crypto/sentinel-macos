import {describe,it,expect} from "vitest";
import {
 planMeetingMinutes,MEETING_SAMPLE,MEETING_ACTION_SAMPLE,MEETING_ACTION_HEADERS,meetingIsoDate,
} from "./meetingMinutes";
describe("Manual meeting minutes and actionable follow-up validation",()=>{
 it("plans exactly entered facts and assigned task statuses without invented content",()=>{
  const plan=planMeetingMinutes(MEETING_SAMPLE,MEETING_ACTION_SAMPLE);
  expect(plan.meeting.title).toBe("Project status and next steps");
  expect(plan.attendees).toEqual(["Alex","Jordan","Lee"]);
  expect(plan.decisions).toEqual([
   "Keep the next release scope focused.","Use the shared handover checklist.",
  ]);
  expect(plan.actions.map(a=>({id:a.id,owner:a.owner,status:a.status}))).toEqual([
   {id:"A-001",owner:"Alex",status:"todo"},
   {id:"A-002",owner:"Jordan",status:"in_progress"},
  ]);
  expect(plan.counts).toEqual({todo:1,inProgress:1,done:0});
  expect(plan.actionCsv).toContain("Review prototype changes");
  expect(plan.actionCsv).not.toContain("Prototype ready for review");
 });
 it("preserves Unicode in attendee names and task descriptions",()=>{
  const data={...MEETING_SAMPLE,title:"研发例会",attendees:"王丽\n李强",
   decisions:"确认下一次审核\n不扩大范围"};
  const csv=MEETING_ACTION_HEADERS.join(",")+
   "\n任务-01,检查项目文档,王丽,2026-11-08,high,todo,确认中文字符正确";
  const p=planMeetingMinutes(data,csv);
  expect(p.actions[0].owner).toBe("王丽");
  expect(p.actionCsv).toContain("检查项目文档");
  expect(p.decisions).toHaveLength(2);
 });
 it("validates strict dates including non-existent leap dates",()=>{
  expect(()=>meetingIsoDate("2026-02-29","Date")).toThrow(/real calendar date/);
  expect(meetingIsoDate("2028-02-29","Date")).toBe("2028-02-29");
  expect(()=>planMeetingMinutes({...MEETING_SAMPLE,nextMeetingDate:"2026-01-01"},MEETING_ACTION_SAMPLE))
   .toThrow(/cannot precede/);
  expect(()=>planMeetingMinutes({...MEETING_SAMPLE,meetingDate:"2026-02-30"},MEETING_ACTION_SAMPLE))
   .toThrow(/real calendar date/);
 });
 it("rejects duplicate IDs, invalid priorities, invalid status, missing owners, missing assignments",()=>{
  const header=MEETING_ACTION_HEADERS.join(",");
  const row="ID1,Review document,Sam,2026-11-10,normal,todo,";
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,header+"\n"+row+"\n"+row)).toThrow(/Duplicate action ID/);
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,header+"\n"+row.replace(",normal,todo",",urgent,todo")))
   .toThrow(/Priority/);
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,header+"\n"+row.replace(",normal,todo",",normal,started")))
   .toThrow(/Status/);
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,header+"\n"+row.replace(",Sam,",",,")))
   .toThrow(/Owner/);
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,header)).toThrow(/1–80/);
 });
 it("flags duplicate attendees and malformed CSV headings",()=>{
  expect(()=>planMeetingMinutes({...MEETING_SAMPLE,attendees:"Ana\nana"},MEETING_ACTION_SAMPLE))
   .toThrow(/duplicate names/);
  expect(()=>planMeetingMinutes(MEETING_SAMPLE,"id,id,owner,due_date,priority,status,notes\nA,Do it,Alex,2026-11-01,normal,todo,"))
   .toThrow(/headers/);
 });
 it("escapes CSV formula injection while preserving input literal",()=>{
  const data=MEETING_ACTION_HEADERS.join(",")+
   '\nF-01,=2+3,Alex,2026-11-01,normal,todo,"+SUM(1,1)"';
  const plan=planMeetingMinutes(MEETING_SAMPLE,data);
  expect(plan.actions[0].task).toBe("=2+3");
  expect(plan.actionCsv).toContain("\"'=2+3");
  expect(plan.actionCsv).toContain("\"'+SUM");
 });
});
