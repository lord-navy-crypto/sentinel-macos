import {describe,it,expect} from "vitest";
import {generateCalendarBatch} from "./lifeMediaWorkflow";
import {makeIcsEvent} from "./universalBox";
import {parseLocalIcs,icsToCsv} from "./localIcsArchive";
const byteCount=(value:string)=>new TextEncoder().encode(value).length;
const sampleRows="2026-11-12T09:00 | 2026-11-12T10:00 | Physics Seminar | Lab\n"+
 "2026-11-12T09:30 | 2026-11-12T10:15 | Study Group | Library";

describe("Offline iCalendar nonrecurring CSV export",()=>{
 it("reads the existing batch ICS generator and detects one genuine UTC overlap",()=>{
  const original=generateCalendarBatch(sampleRows,"test-ics-archive");
  const parsed=parseLocalIcs(original.ics,byteCount(original.ics));
  expect(parsed.events).toHaveLength(2);
  expect(parsed.events[0]).toMatchObject({
   start:"2026-11-12T09:00:00Z",end:"2026-11-12T10:00:00Z",
   title:"Physics Seminar",location:"Lab",allDay:false,
  });
  expect(parsed.timedConflicts).toBe(1);
  expect(parsed.events[0].uid).toContain("@daily-desk.local");
  const csv=icsToCsv(parsed);
  expect(csv.startsWith("\uFEFFindex,start_utc_or_date,end_utc_or_date,all_day")).toBe(true);
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3);
  expect(csv).toContain('"2026-11-12T09:30:00Z"');
  expect(csv).toContain('"Study Group"');
 });
 it("reads single-event generator without modifying the event",()=>{
  const original=makeIcsEvent({
   start:"2026-11-12T09:00",end:"2026-11-12T10:00",summary:"Writing, Design",
   location:"Room 3",description:"Line 1\nLine 2",uid:"sample-1@local",
  });
  const parsed=parseLocalIcs(original,byteCount(original));
  expect(parsed.events).toHaveLength(1);
  expect(parsed.events[0].title).toBe("Writing, Design");
  expect(parsed.events[0].description).toBe("Line 1\nLine 2");
  expect(parsed.timedConflicts).toBe(0);
 });
 it("supports RFC5545 folded long lines and explicit DATE all-day periods",()=>{
  const file=[
   "BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT","UID:all-day-01",
   "DTSTART;VALUE=DATE:20261111","DTEND;VALUE=DATE:20261113",
   "SUMMARY:Project "," discussion","LOCATION:Campus\\, Auditorium",
   "END:VEVENT","END:VCALENDAR","",
  ].join("\r\n");
  const parsed=parseLocalIcs(file,byteCount(file));
  expect(parsed.events[0]).toMatchObject({
   start:"2026-11-11",end:"2026-11-13",allDay:true,
   title:"Project discussion",location:"Campus, Auditorium",
  });
  expect(parsed.timedConflicts).toBe(0);
 });
 it("refuses recurrence and local timestamps instead of silently exporting wrong calendar times",()=>{
  const plain=generateCalendarBatch(sampleRows,"test-ics-recurrent").ics;
  expect(()=>parseLocalIcs(plain.replace("SUMMARY:Study Group","RRULE:FREQ=WEEKLY\r\nSUMMARY:Study Group"),
   byteCount(plain)+20)).toThrow(/Recurring/);
  const floating=plain.replace("20261112T090000Z","20261112T090000");
  expect(()=>parseLocalIcs(floating,byteCount(floating))).toThrow(/UTC Z/);
  const tz=plain.replace("DTSTART:","DTSTART;TZID=Europe/Paris:");
  expect(()=>parseLocalIcs(tz,byteCount(tz))).toThrow(/UTC Z|date\/time parameters/);
 });
 it("rejects impossible dates, missing boundaries, and incomplete data",()=>{
  const plain=generateCalendarBatch(sampleRows,"test-ics-valid").ics;
  for(const bad of [
    plain.replace("20261112T090000Z","20260230T090000Z"),
    plain.replace("END:VCALENDAR",""),
    plain.replace("DTEND:20261112T100000Z","DTEND:20261112T080000Z"),
    plain.replace("VERSION:2.0","VERSION:9.9"),
    plain.replace("SUMMARY:Physics Seminar","SUMMARY:"),
  ]){
    expect(()=>parseLocalIcs(bad,byteCount(bad))).toThrow();
  }
  expect(()=>parseLocalIcs("x".repeat(750001),750001)).toThrow(/750 KB/);
 });
 it("formula-like titles and descriptions stay inert inside complete quoted CSV",()=>{
  const plain=generateCalendarBatch(sampleRows,"test-ics-formula").ics;
  const risky=plain.replace("SUMMARY:Physics Seminar","SUMMARY:=HYPERLINK(1)")
   .replace("LOCATION:Lab","LOCATION:@SUM(2)");
  const parsed=parseLocalIcs(risky,byteCount(risky));
  const csv=icsToCsv(parsed);
  expect(csv).toContain('"\'=HYPERLINK(1)"');
  expect(csv).toContain('"\'@SUM(2)"');
  expect(csv).toContain('"Study Group"');
 });
});
