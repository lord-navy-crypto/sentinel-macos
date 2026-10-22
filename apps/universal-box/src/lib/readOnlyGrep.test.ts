import {describe,it,expect} from "vitest";
import {runReadOnlyGrep,exportGrepCsv,validateGrepFiles,validateGrepQuery,type GrepSource} from "./readOnlyGrep";

const samples:GrepSource[]=[
 {name:"project.md",bytes:48,text:"# Project\nTODO: update intro\nDone\nTODO: review draft\n"},
 {name:"会议.csv",bytes:45,text:"task,owner\nTODO,张三\n待办,李四\n"},
 {name:"debug.log",bytes:56,text:"2026-10-22 DEBUG idle\nwarning: todo later\n"},
];
describe("Read-only local grep-style search",()=>{
 it("reports actual file order, physical 1-based line numbers, case-insensitive literal matches",()=>{
  const report=runReadOnlyGrep(samples,"todo");
  expect(report.files).toEqual([
   {name:"project.md",matchedLines:2},
   {name:"会议.csv",matchedLines:1},
   {name:"debug.log",matchedLines:1},
  ]);
  expect(report.matches.map(x=>[x.fileIndex,x.line])).toEqual([[0,2],[0,4],[1,2],[2,2]]);
  expect(report.matches[2].snippet).toContain("TODO,张三");
  expect(report.totalFiles).toBe(3);
  expect(report.matches).toHaveLength(4);
  expect(samples[0].text).toContain("TODO: update intro");
 });
 it("case-sensitive option changes results, plain strings never behave as regex",()=>{
  const sensitive=runReadOnlyGrep(samples,"TODO",true);
  expect(sensitive.matches).toHaveLength(3);
  const literal=runReadOnlyGrep([
   {name:"words.txt",bytes:17,text:"a.b\nacb\na[b]\n"},
  ],"a.b");
  expect(literal.matches.map(x=>x.line)).toEqual([1]);
  expect(validateGrepQuery("+++")).toBe("+++");
  expect(()=>validateGrepQuery("x\ny")).toThrow(/literal/);
  expect(()=>validateGrepQuery("a".repeat(121))).toThrow(/120/);
  expect(()=>validateGrepQuery("  ")).toThrow(/literal/);
 });
 it("handles CRLF, trailing newline and embedded Chinese without fake line counts",()=>{
  const report=runReadOnlyGrep([{name:"中文.txt",bytes:30,text:"第一行\r\n关键词所在第二行\r\n第三行\r\n"}],"关键词");
  expect(report.totalLines).toBe(3);
  expect(report.matches.map(x=>x.line)).toEqual([2]);
 });
 it("keeps CSV complete and protects spreadsheet formulas, quotation and commas",()=>{
  const source:GrepSource={name:"=weird.csv",bytes:24,text:'=HYPERLINK(1), "x"\nnormal\n'};
  const report=runReadOnlyGrep([source],"HYPERLINK");
  const csv=exportGrepCsv(report);
  expect(csv.startsWith("\uFEFFfile_index,file_name,line_number,preview,original_line\r\n")).toBe(true);
  expect(csv).toContain('"\'=weird.csv"');
  expect(csv).toContain('"\'=HYPERLINK(1), ""x"""');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
 });
 it("fails whole selection if any file is invalid, with no silent skipping",()=>{
  expect(()=>validateGrepFiles([])).toThrow(/1–20/);
  expect(()=>validateGrepFiles(Array.from({length:21},(_,i)=>({name:i+".txt",bytes:1,text:"x"})))).toThrow(/1–20/);
  expect(()=>validateGrepFiles([{name:"file.png",bytes:2,text:"ok"}])).toThrow(/Unsupported/);
  expect(()=>validateGrepFiles([{name:"../x.txt",bytes:1,text:"x"}])).toThrow(/Unsupported/);
  expect(()=>validateGrepFiles([{name:"good.txt",bytes:200001,text:"x"}])).toThrow(/200,000/);
  expect(()=>validateGrepFiles(Array.from({length:11},(_,i)=>({name:i+".txt",bytes:200000,text:"x"})))).toThrow(/2 MB/);
 });
 it("explicitly refuses 5,001 matching lines instead of exporting an incomplete report",()=>{
  const source={name:"many.txt",bytes:12000,text:Array.from({length:5001},()=> "x").join("\n")};
  expect(()=>runReadOnlyGrep([source],"x")).toThrow(/5,000 matching lines/);
  expect(runReadOnlyGrep([{name:"nohits.txt",bytes:8,text:"hello"}],"missing").matches).toHaveLength(0);
  expect(exportGrepCsv(runReadOnlyGrep([{name:"nohits.txt",bytes:8,text:"hello"}],"missing")))
   .toContain("line_number,preview,original_line");
 });
 it("refuses malformed physical line volume despite a small byte footprint",()=>{
  const source={name:"manylines.txt",bytes:150002,text:"\n".repeat(75001)};
  expect(()=>runReadOnlyGrep([source],"x")).toThrow(/75,000/);
 });
});
