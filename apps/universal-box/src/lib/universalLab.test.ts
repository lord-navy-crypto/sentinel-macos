import {describe,it,expect} from "vitest";
import {batchLines,convertSubtitles,parseSubtitles,inspectUrl,LINE_DEFAULTS} from "./universalLab";
import {contactSheetLayout} from "./contactSheet";

describe("Universal Box v0.21 local processing",()=>{
 it("transforms, deduplicates, sorts lines, preserving Unicode and enforcing size limits",()=>{
  const result=batchLines(" C \nA\nA\n B \n",{
   ...LINE_DEFAULTS,unique:true,removeBlank:true,sort:"ascending",prefix:"[",suffix:"]",
  });
  expect(result.text).toBe("[A]\n[B]\n[C]");
  expect(result.before).toBe(5);
  expect(result.after).toBe(3);
  expect(batchLines("你好\nWORLD",{...LINE_DEFAULTS,caseMode:"lower"}).text).toBe("你好\nworld");
  expect(()=>batchLines("x".repeat(200001),LINE_DEFAULTS)).toThrow(/200,000/);
  expect(()=>batchLines("hello",{...LINE_DEFAULTS,prefix:"z".repeat(101)})).toThrow(/100/);
 });
 it("converts SRT to WebVTT, preserving multiline cues and shifting timestamps",()=>{
  const source="1\n00:00:01,200 --> 00:00:03,400\nHello\nWorld\n\n2\n00:01:00,000 --> 00:01:01,900\n中文";
  const res=convertSubtitles(source,"srt","vtt",500);
  expect(res.cues).toBe(2);
  expect(res.text).toContain("00:00:01.700 --> 00:00:03.900\nHello\nWorld");
  expect(res.text).toContain("00:01:00.500 --> 00:01:02.400\n中文");
  const again=convertSubtitles(res.text,"vtt","srt",-500);
  expect(again.text).toContain("00:00:01,200 --> 00:00:03,400");
  expect(again.text).toContain("2\n00:01:00,000 --> 00:01:01,900");
 });
 it("rejects unsupported subtitle settings, underflow, invalid chronology and huge offsets",()=>{
  const vtt="WEBVTT\n\n00:00:00.100 --> 00:00:01.000\nHello";
  expect(parseSubtitles(vtt,"vtt")).toHaveLength(1);
  expect(()=>convertSubtitles(vtt,"vtt","srt",-101)).toThrow(/outside/);
  expect(()=>convertSubtitles(vtt,"vtt","srt",3600001)).toThrow(/Shift/);
  expect(()=>parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:01.000\nText","vtt")).toThrow(/later/);
  expect(()=>parseSubtitles("WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start\nText","vtt")).toThrow(/settings/);
  expect(()=>parseSubtitles("WEBVTT\n\nSTYLE\n::cue {color:red;}\n\n00:00:01.000 --> 00:00:02.000\nText","vtt")).toThrow(/STYLE/);
  expect(()=>parseSubtitles("00:00:01,000 --> 00:00:02,000\nA","vtt")).toThrow(/WEBVTT/);
 });
 it("inspects URL query duplicates and refuses non-http schemes or credentials",()=>{
  const r=inspectUrl("https://example.org:8443/a?tag=one&tag=two&empty=#section");
  expect(r.scheme).toBe("https");
  expect(r.host).toBe("example.org:8443");
  expect(r.params).toEqual([{key:"tag",value:"one"},{key:"tag",value:"two"},{key:"empty",value:""}]);
  expect(r.fragment).toBe("#section");
  expect(()=>inspectUrl("javascript:alert(1)")).toThrow(/HTTP/);
  expect(()=>inspectUrl("https://user:pass@example.org")).toThrow(/credentials/);
 });
 it("lays out numbered photo cells within strict pixel boundaries",()=>{
  const layout=contactSheetLayout({count:7,columns:3,cellWidth:240,cellHeight:180,margin:12,captions:true});
  expect(layout.rows).toBe(3);
  expect(layout.width).toBe(768);
  expect(layout.height).toBe(684);
  expect(layout.slots).toHaveLength(7);
  expect(layout.slots[3].x).toBe(12);
  expect(layout.slots[3].y).toBe(236);
  expect(()=>contactSheetLayout({count:13,columns:4,cellWidth:200,cellHeight:200,margin:12,captions:false})).toThrow(/1–12/);
  expect(contactSheetLayout({count:12,columns:6,cellWidth:700,cellHeight:700,margin:48,captions:true}).width).toBeLessThan(5000);
  expect(()=>contactSheetLayout({count:12,columns:7,cellWidth:700,cellHeight:700,margin:48,captions:true})).toThrow(/1–6/);
 });
});
