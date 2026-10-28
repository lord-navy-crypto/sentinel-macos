import {describe,expect,it} from "vitest";
import {parseWebTableHandoff} from "./webCaptureHandoff";

const sample=()=>({
 format:"sentinel-box-web-table",schemaVersion:1,
 source:{title:"Example page",url:"https://example.org/data",capturedAt:"2026-10-28T12:00:00.000Z"},
 table:{index:0,rows:2,columns:2,csv:'"Name","Note"\r\n"Ada","\'=2+2"'}
});
describe("Explicit Web Capture table handoff",()=>{
 it("accepts bounded source-attributed CSV and retains the source without fetching",()=>{
  const record=parseWebTableHandoff(JSON.stringify(sample()));
  expect(record.source.url).toBe("https://example.org/data");
  expect(record.table.csv).toContain("'=2+2");
 });
 it("rejects arbitrary files, unsupported schemas, file paths and credential-bearing URLs",()=>{
  expect(()=>parseWebTableHandoff("not json")).toThrow(/JSON/);
  expect(()=>parseWebTableHandoff(JSON.stringify({...sample(),schemaVersion:2}))).toThrow(/兼容版本/);
  expect(()=>parseWebTableHandoff(JSON.stringify({...sample(),source:{...sample().source,url:"file:///etc/passwd"}}))).toThrow(/来源网址/);
  expect(()=>parseWebTableHandoff(JSON.stringify({...sample(),source:{...sample().source,url:"https://name:pass@example.org/"}}))).toThrow(/凭据/);
 });
 it("rejects oversized or empty tables rather than silently truncating",()=>{
  expect(()=>parseWebTableHandoff(JSON.stringify({...sample(),table:{...sample().table,csv:""}}))).toThrow(/表格/);
  expect(()=>parseWebTableHandoff(JSON.stringify({...sample(),table:{...sample().table,rows:6000}}))).toThrow(/表格/);
  expect(()=>parseWebTableHandoff("x".repeat(800001))).toThrow(/过大/);
 });
});
