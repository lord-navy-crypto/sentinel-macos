import {describe,it,expect} from "vitest";
import {resyncSubtitleCues,planOrganizedArchive,generateCalendarBatch} from "./lifeMediaWorkflow";
import {parseSubtitles} from "./universalLab";

describe("Subtitle two-point resynchronization",()=>{
 const source="1\n00:00:01,000 --> 00:00:02,000\n第一句\n\n2\n00:00:11,000 --> 00:00:13,000\nSecond sentence";
 it("repairs gradual time drift, preserving Chinese and spoken text",()=>{
  const synced=resyncSubtitleCues(source,"srt","vtt",
   {originalMs:1000,correctedMs:2000},{originalMs:11000,correctedMs:12200});
  expect(synced.scale).toBeCloseTo(1.02);
  expect(synced.count).toBe(2);
  expect(synced.overlaps).toBe(0);
  expect(synced.text).toContain("WEBVTT\n\n");
  expect(synced.text).toContain("00:00:02.000 --> 00:00:03.020");
  expect(synced.text).toContain("00:00:12.200 --> 00:00:14.240");
  expect(parseSubtitles(synced.text,"vtt").map(x=>x.lines[0])).toEqual(["第一句","Second sentence"]);
 });
 it("refuses invalid anchors, reversed order, excessive scale and underflow",()=>{
  expect(()=>resyncSubtitleCues(source,"srt","srt",{originalMs:1000,correctedMs:0},{originalMs:2000,correctedMs:5000})).toThrow(/scaling/);
  expect(()=>resyncSubtitleCues(source,"srt","srt",{originalMs:1000,correctedMs:0},{originalMs:1000,correctedMs:0})).toThrow(/1 second/);
  expect(()=>resyncSubtitleCues(source,"srt","srt",{originalMs:2000,correctedMs:1000},{originalMs:12000,correctedMs:11000})).toThrow(/timeline/);
  expect(()=>resyncSubtitleCues(source,"srt","srt",{originalMs:2000.25,correctedMs:1000},{originalMs:12000,correctedMs:11000})).toThrow(/integer/);
 });
 it("reports overlapping subtitles rather than silently deleting them",()=>{
  const text="1\n00:00:01,000 --> 00:00:04,000\nA\n\n2\n00:00:03,000 --> 00:00:05,000\nB";
  const res=resyncSubtitleCues(text,"srt","srt",{originalMs:1000,correctedMs:1000},{originalMs:5000,correctedMs:5000});
  expect(res.overlaps).toBe(1);
 });
});

describe("Safe user-selected category ZIP planner",()=>{
 it("classifies filenames, protects ZIP paths, and preserves inputs in manifest",()=>{
  const input=[{name:"portrait.png",size:200},{name:"notes.docx",size:300},{name:"song.wav",size:0},
   {name:"../unsafe.py",size:10},{name:"portrait.png",size:5},{name:"what.unknown",size:12}];
  const plan=planOrganizedArchive(input);
  expect(plan.map(x=>x.bucket)).toEqual(["Pictures","Documents","Audio","Code","Pictures","Other"]);
  expect(new Set(plan.map(x=>x.path.toLowerCase())).size).toBe(6);
  expect(plan[3].path).not.toContain("../");
  expect(plan[4].path).toContain("005-portrait.png");
  expect(input[0].name).toBe("portrait.png");
 });
 it("bounds selection and total input size",()=>{
  expect(()=>planOrganizedArchive([])).toThrow(/1–50/);
  expect(()=>planOrganizedArchive([{name:"x.bin",size:16_000_001}])).toThrow(/16 MB/);
  expect(()=>planOrganizedArchive(Array(51).fill({name:"x",size:0}))).toThrow(/1–50/);
 });
});
describe("Multi-event calendar planning",()=>{
 const input="2026-11-12T09:00 | 2026-11-12T10:00 | Seminar | Library\n"
  +"2026-11-12T09:30 | 2026-11-12T11:00 | Study | Room A\n"
  +"2026-11-12T11:00 | 2026-11-12T12:00 | Lunch | Cafe";
 it("generates a standards-shaped ICS with unique UIDs and UTC endpoints",()=>{
  const r=generateCalendarBatch(input,"universal-box-tests");
  expect(r.events).toHaveLength(3);
  expect(r.overlaps).toEqual([{first:1,second:2}]);
  expect((r.ics.match(/BEGIN:VEVENT/g)||[]).length).toBe(3);
  expect((r.ics.match(/END:VEVENT/g)||[]).length).toBe(3);
  expect((r.ics.match(/BEGIN:VCALENDAR/g)||[]).length).toBe(1);
  expect(r.ics).toContain("DTSTART:20261112T090000Z");
  expect(r.ics).toContain("UID:universal-box-tests-2@daily-desk.local");
  expect(r.ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
 });
 it("rejects malformed dates, injection fields and invalid durations",()=>{
  expect(()=>generateCalendarBatch("2026-02-30T09:00|2026-02-30T10:00|Test|Room","test-plan")).toThrow(/Invalid UTC/);
  expect(()=>generateCalendarBatch("2026-11-12T10:00|2026-11-12T09:00|Test|Room","test-plan")).toThrow(/end must/);
  expect(()=>generateCalendarBatch("2026-11-12T09:00|2026-11-12T10:00|T|Room|extra","test-plan")).toThrow(/Line 1/);
  expect(()=>generateCalendarBatch(input,"..")).toThrow(/identifier/);
 });
});