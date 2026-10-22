import {describe,it,expect} from "vitest";
import {
 MEETING_SAMPLE,MEETING_ACTION_SAMPLE,MEETING_ACTION_HEADERS,planMeetingMinutes,
} from "./meetingMinutes";
import {createMeetingActionCalendar,escapeIcalText,foldIcalLine} from "./meetingActionCalendar";

const makePlan=(rows:string,overrides:Partial<typeof MEETING_SAMPLE>={})=>
 planMeetingMinutes({...MEETING_SAMPLE,...overrides},MEETING_ACTION_HEADERS.join(",")+"\n"+rows);
const unfold=(ics:string)=>ics.replace(/\r\n[ \t]/gu,"");
const physicalLines=(ics:string)=>ics.split("\r\n").filter(Boolean);
describe("RFC5545 meeting action due-date export",()=>{
 it("uses CRLF, all-day ISO dates, stable valid UIDs and no background reminders",async()=>{
  const plan=planMeetingMinutes(MEETING_SAMPLE,MEETING_ACTION_SAMPLE);
  const fixed=new Date("2026-10-22T04:30:00Z");
  const result=await createMeetingActionCalendar(plan,{now:fixed});
  expect(result.eventCount).toBe(2);
  expect(result.skippedDone).toBe(0);
  expect(result.content).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/u);
  expect(result.content.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(result.content.replace(/\r\n/gu,"")).not.toContain("\n");
  expect(result.content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(result.content).toContain("DTSTAMP:20261022T043000Z");
  expect(result.content).toContain("DTSTART;VALUE=DATE:20261102");
  expect(result.content).toContain("DTEND;VALUE=DATE:20261103");
  expect(result.content).toContain("DTSTART;VALUE=DATE:20261104");
  expect(result.content).toContain("TRANSP:TRANSPARENT");
  expect(result.content).not.toContain("BEGIN:VALARM");
  expect(result.content).not.toContain("ATTENDEE:");
  expect(result.content).not.toContain("ORGANIZER:");
  const again=await createMeetingActionCalendar(plan,{now:new Date("2026-10-23T00:00:00Z")});
  const uids=(s:string)=>s.split("\r\n").filter(x=>x.startsWith("UID:"));
  expect(uids(again.content)).toEqual(uids(result.content));
  expect(new Set(uids(result.content)).size).toBe(2);
 });
 it("skips completed tasks by default, but adds them when explicitly requested",async()=>{
  const rows=[
   "A1,Open item,Robin,2026-11-03,normal,todo,",
   "A2,Already finished,Alex,2026-11-04,low,done,",
   "A3,Work in progress,Lee,2026-11-05,high,in_progress,",
  ].join("\n");
  const plan=makePlan(rows);
  const normal=await createMeetingActionCalendar(plan);
  expect(normal.eventCount).toBe(2);
  expect(normal.skippedDone).toBe(1);
  expect(unfold(normal.content)).not.toContain("Already finished");
  const all=await createMeetingActionCalendar(plan,{includeDone:true});
  expect(all.eventCount).toBe(3);
  expect(all.skippedDone).toBe(0);
  expect(unfold(all.content)).toContain("Already finished");
 });
 it("escapes malicious-looking meeting CSV content and all iCalendar delimiters",async()=>{
  const plan=makePlan('ID1,"Approve meeting; send\\nlinks",王丽,2026-12-02,high,todo,"Discuss \\\\ server, updates;"',
   {title:"产品例会;第二次"});
  const result=await createMeetingActionCalendar(plan);
  const parsed=unfold(result.content);
  expect(parsed).toContain("SUMMARY:Due: Approve meeting\\; send");
  expect(parsed).toContain("DESCRIPTION:Meeting: 产品例会\\;第二次\\nAction ID: ID1");
  expect(parsed).toContain("Assigned owner: 王丽");
  expect(parsed).toContain("Notes: Discuss \\\\\\\\ server\\, updates\\;");
  expect(parsed).not.toContain("\r\nATTENDEE:");
  expect(parsed).not.toContain("\r\nBEGIN:VALARM");
 });
 it("folds Chinese/emoji content without splitting a UTF-8 code point and keeps each physical line <=75 octets",async()=>{
  const longTask="交付报告与审查📅".repeat(28);
  const plan=makePlan('CN-1,"'+longTask+'",王丽,2026-11-12,high,todo,"检查内容"');
  const data=await createMeetingActionCalendar(plan);
  for(const line of physicalLines(data.content)){
   expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
   expect(line).not.toContain("\uFFFD");
  }
  expect(unfold(data.content)).toContain(longTask);
  const folded=foldIcalLine("SUMMARY:"+longTask);
  expect(folded).toContain("\r\n ");
  expect(folded.replace(/\r\n /gu,"")).toBe("SUMMARY:"+longTask);
  expect(escapeIcalText("a\\b,c;d\nsecond")).toBe("a\\\\b\\,c\\;d\\nsecond");
 });
 it("does not include a selected calendar owner email or claim to schedule meetings",async()=>{
  const plan=makePlan("X1,Preparation,owner@example.com,2026-12-31,normal,todo,No automated contact");
  const content=(await createMeetingActionCalendar(plan)).content;
  expect(content).toContain("Assigned owner: owner@example.com");
  expect(content).not.toContain("mailto:");
  expect(content).not.toContain("METHOD:REQUEST");
  expect(content).toContain("METHOD:PUBLISH");
 });
 it("rejects invalid export time",async()=>{
  const plan=planMeetingMinutes(MEETING_SAMPLE,MEETING_ACTION_SAMPLE);
  await expect(createMeetingActionCalendar(plan,{now:new Date(NaN)}))
   .rejects.toThrow(/Invalid calendar export time/);
 });
});
