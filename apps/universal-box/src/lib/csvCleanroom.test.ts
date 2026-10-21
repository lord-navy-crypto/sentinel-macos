import {describe,expect,it} from "vitest";
import {cleanWorkspaceCsv,DEFAULT_CSV_CLEANUP,inspectWorkspaceCsv,parseWorkspaceCsv} from "./csvCleanroom";

describe("Offline CSV office workshop",()=>{
 it("parses embedded comma, doubled quotes and CRLF",()=>{
  expect(parseWorkspaceCsv('A,B\r\n"Hello, friend","say ""hello"""\r\n')).toEqual([
   ["A","B"],["Hello, friend",'say "hello"'],
  ]);
 });
 it("preserves embedded newlines inside quoted cells",()=>{
  expect(parseWorkspaceCsv('"Name","Note"\n"Ada","line1\nline2"')).toEqual([
   ["Name","Note"],["Ada","line1\nline2"],
  ]);
 });
 it("reports blank and duplicate records before changes",()=>{
  const report=inspectWorkspaceCsv("Name,Age\nAda,18\n\nAda,18\n");
  expect(report.inputRows).toBe(3);
  expect(report.duplicateRows).toBe(1);
  expect(report.blankRows).toBe(1);
 });
 it("cleans without changing the input and protects formula injection",()=>{
  const source="Name,Note\n  Ada  ,  =1+1  \n  Ada  ,  =1+1  \n  ,  \n";
  const result=cleanWorkspaceCsv(source,DEFAULT_CSV_CLEANUP);
  expect(result.removedRows).toBe(2);
  expect(result.keptRows).toBe(1);
  expect(result.csv).toBe('"Name","Note"\r\n"Ada","\'=1+1"\r\n');
  expect(source.startsWith("Name,Note")).toBe(true);
 });
 it("keeps unsafe-looking data literal, also with leading tabs and spaces",()=>{
  const source="Value\n  +SUM(1,2)\n  @Evil\n-1\n=cmd\n";
  const result=cleanWorkspaceCsv(source,{trimCells:false,removeBlankRows:false,removeDuplicateRows:false,protectFormulas:true});
  expect(result.csv).toContain("\"'  +SUM(1,2)\"");
  expect(result.csv).toContain("\"'  @Evil\"");
  expect(result.csv).toContain("\"'-1\"");
  expect(result.csv).toContain("\"'=cmd\"");
 });
 it("rejects malformed records without emitting partial results",()=>{
  for(const text of ['A\n"unterminated','A\nun"quoted','A\n"closed"oops']){
   expect(()=>cleanWorkspaceCsv(text,DEFAULT_CSV_CLEANUP)).toThrow();
  }
 });
 it("rejects oversized rows and columns",()=>{
  expect(()=>parseWorkspaceCsv("col\n"+"a".repeat(20001))).toThrow(/20,000/);
  expect(()=>parseWorkspaceCsv(Array(101).fill("x").join(","))).toThrow(/100/);
  expect(()=>parseWorkspaceCsv("A\n"+Array(10001).fill("a").join("\n"))).toThrow(/10,000/);
 });
 it("rejects null characters and excessive input",()=>{
  expect(()=>parseWorkspaceCsv("A\0B")).toThrow(/null/);
  expect(()=>parseWorkspaceCsv("a".repeat(2_000_001))).toThrow(/2 million/);
 });
});
