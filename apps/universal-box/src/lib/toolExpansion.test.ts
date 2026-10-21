import {describe,it,expect} from "vitest";
import {readBookmarksHtml,bookmarksToCsv,bookmarksToMarkdown} from "./bookmarkImport";
import {importIcs,icsToCsv} from "./icsImportAudit";
import {inspectSubtitleQuality,subtitleQualityCsv} from "./subtitleQuality";
import {generateCalendarBatch} from "./lifeMediaWorkflow";

describe("Netscape-style bookmark import",()=>{
 const source='<DL><DT><A HREF="https://example.org/?a=1&amp;b=2">参考 &amp; 学习</A>'+
 '<DT><A HREF="javascript:alert(1)">Unsafe</A>'+
 '<DT><A HREF="https://example.org/?a=1&amp;b=2">Duplicate</A>'+
 '<DT><A HREF="https://science.org/hello">Physics</A></DL>';
 it("decodes HTML, rejects executable schemes and excludes repeated URLs",()=>{
  const r=readBookmarksHtml(source);
  expect(r.entries).toHaveLength(2);
  expect(r.rejected).toBe(1);
  expect(r.duplicates).toBe(1);
  expect(r.entries[0].url).toBe("https://example.org/?a=1&b=2");
  expect(r.entries[0].title).toBe("参考 & 学习");
  expect(bookmarksToCsv(r.entries)).toContain("参考 & 学习");
  expect(bookmarksToMarkdown(r.entries)).toContain("https://science.org/hello");
 });
 it("rejects invalid or non-Web bookmarks",()=>{
  expect(()=>readBookmarksHtml("<p>No links</p>")).toThrow(/No bookmark/);
  expect(()=>readBookmarksHtml('<A HREF="file:///private/path">Private</A>')).toThrow(/No safe/);
 });
});
describe("Strict offline UTC ICS import",()=>{
 const ics="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:first\r\nDTSTART:20261112T090000Z\r\nDTEND:20261112T100000Z\r\nSUMMARY:物理\\, Lab\r\nLOCATION:Classroom\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:second\r\nDTSTART:20261112T093000Z\r\nDTEND:20261112T104500Z\r\nSUMMARY:Study Group\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
 it("reconstructs real UTF-8 UTC calendar events and detects conflicts",()=>{
  const data=importIcs(ics);
  expect(data.events).toHaveLength(2);
  expect(data.events[0].summary).toBe("物理, Lab");
  expect(data.events[0].start).toBe("2026-11-12T09:00:00Z");
  expect(data.overlaps).toEqual([{first:1,second:2}]);
  expect(icsToCsv(data.events)).toContain("2026-11-12T09:00:00Z");
 });
 it("reads ICS produced by existing calendar generator",()=>{
  const created=generateCalendarBatch("2026-11-12T09:00 | 2026-11-12T10:00 | Lab | Campus","batch-test");
  const read=importIcs(created.ics);
  expect(read.events).toHaveLength(1);
  expect(read.events[0].summary).toBe("Lab");
 });
 it("refuses unsupported timezone & recurring rules to avoid misleading reports",()=>{
  expect(()=>importIcs(ics.replace("DTSTART:20261112T090000Z","DTSTART;TZID=Europe/Dublin:20261112T090000"))).toThrow(/TZID/);
  expect(()=>importIcs(ics.replace("UID:first","UID:first\r\nRRULE:FREQ=DAILY"))).toThrow(/Recurring/);
  expect(()=>importIcs(ics.replace("DTEND:20261112T100000Z","DTEND:20260230T100000Z"))).toThrow(/date|end/);
 });
});
describe("SRT/VTT read-only subtitle QC",()=>{
 const srt="1\n00:00:01,000 --> 00:00:02,500\nHello world\n\n2\n00:00:02,300 --> 00:00:03,500\n你好世界\n\n3\n00:00:20,000 --> 00:00:20,200\nVery long English text for a short cue";
 it("flags overlaps, gaps, very short cues and reading speed",()=>{
  const qa=inspectSubtitleQuality(srt,"srt",20,10);
  expect(qa.count).toBe(3);
  expect(qa.durationMs).toBe(20200);
  expect(qa.warnings.some(w=>w.category==="overlap"&&w.cue===2)).toBe(true);
  expect(qa.warnings.some(w=>w.category==="gap"&&w.cue===3)).toBe(true);
  expect(qa.warnings.some(w=>w.category==="fast"&&w.cue===3)).toBe(true);
  expect(qa.warnings.some(w=>w.category==="short"&&w.cue===3)).toBe(true);
  expect(subtitleQualityCsv(qa)).toContain("overlap");
 });
 it("checks WebVTT and bounds thresholds",()=>{
  const vtt="WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA good line.";
  expect(inspectSubtitleQuality(vtt,"vtt").count).toBe(1);
  expect(()=>inspectSubtitleQuality(vtt,"vtt",1)).toThrow(/threshold/);
 });
});
