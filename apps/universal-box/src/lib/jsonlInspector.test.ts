import {describe,it,expect} from "vitest";
import {parseLocalJsonl,jsonlLevelCounts,filterJsonl,exportJsonlCsv} from "./jsonlInspector";
const lines=[
 '{"timestamp":"2026-10-22T10:00:00Z","level":"INFO","message":"Loaded"}',
 '{"time":"2026-10-22T10:01:00Z","severity":"warning","msg":"Slow request"}',
 'bad,not,json',
 '{"ts":123,"level":"ERROR","message":"=SUM(A1:A2)"}',
 '{"status":"critical","event":"Disk quota reached"}',
 '{"status":"DEBUG","message":"Inspect variable"}',
].join("\n");
describe("Offline JSONL inspector",()=>{
 const r=parseLocalJsonl(lines,new TextEncoder().encode(lines).length);
 it("parses every physical line, retains malformed JSON and normalizes severity",()=>{
  expect(r.records.map(x=>x.level)).toEqual(["info","warn","invalid","error","fatal","debug"]);
  expect(r.records.map(x=>x.line)).toEqual([1,2,3,4,5,6]);
  expect(r.invalidCount).toBe(1);
  expect(r.records[2].raw).toBe("bad,not,json");
  expect(r.records[2].valid).toBe(false);
  expect(r.records[1].timestamp).toBe("2026-10-22T10:01:00Z");
  expect(jsonlLevelCounts(r).reduce((x,item)=>x+item.count,0)).toBe(6);
 });
 it("allows exact severity search and full-text search without mutation",()=>{
  expect(filterJsonl(r.records,"error","")).toHaveLength(1);
  expect(filterJsonl(r.records,"invalid","")).toHaveLength(1);
  expect(filterJsonl(r.records,"all","disk")).toHaveLength(1);
  expect(filterJsonl(r.records,"all","slow")).toHaveLength(1);
  expect(filterJsonl(r.records,"info","fail")).toHaveLength(0);
  expect(r.records).toHaveLength(6);
 });
 it("exports every selected original line, marks parse failures and protects Excel cells",()=>{
  const csv=exportJsonlCsv(r.records);
  expect(csv.startsWith("\uFEFFline,level,valid,timestamp,message,raw_jsonl\r\n")).toBe(true);
  expect(csv).toContain('"\'=SUM(A1:A2)"');
  expect(csv).toContain('"bad,not,json"');
  expect(csv).toContain('3,"invalid",false');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(7);
  expect(exportJsonlCsv(filterJsonl(r.records,"error",""))).toContain('"error"');
 });
 it("rejects oversized files and line count without silent truncation",()=>{
  expect(()=>parseLocalJsonl("",1)).toThrow(/1–2,000,000/);
  expect(()=>parseLocalJsonl("{}",2_000_001)).toThrow(/1–2,000,000/);
  expect(()=>parseLocalJsonl(Array.from({length:5001},()=>"{ }").join("\n"),20_000)).toThrow(/5,000/);
  expect(()=>parseLocalJsonl("x".repeat(50_001),50_001)).toThrow(/50,000/);
  expect(()=>exportJsonlCsv([])).toThrow(/Choose/);
 });
 it("invalid primitives, blank lines and nested objects are represented explicitly",()=>{
  const input='42\n\n{"level":"info","message":{"nested":true}}';
  const out=parseLocalJsonl(input,new TextEncoder().encode(input).length);
  expect(out.records.map(x=>x.valid)).toEqual([false,false,true]);
  expect(out.records[2].message).toBe('{"nested":true}');
 });
});
