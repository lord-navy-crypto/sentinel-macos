import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectCsvKeys,exportCsvDuplicateAudit} from "./csvDuplicateAudit";
describe("CSV duplicate-key audit with actual evidence",()=>{
 const csv="ID,Description,Code\n001,First,=2+3\n002,Same,safe\n001,Second,=4+4\n002,Same,safe\n,Missing,id";
 it("separates identical duplicate rows from conflicting key values",()=>{
  const report=inspectCsvKeys(csv,[0]);
  expect(report.groups).toHaveLength(2);
  expect(report.duplicateRows).toBe(4);
  expect(report.conflictingGroups).toBe(1);
  expect(report.blankKeys).toEqual([6]);
  expect(report.groups[0].rowNumbers).toEqual([2,4]);
  expect(report.groups[0].conflict).toBe(true);
  expect(report.groups[1].conflict).toBe(false);
  expect(inspectCsvKeys(csv,[0,1]).groups).toHaveLength(1);
 });
 it("exports ZIP report and formula-safe CSV with accurate original row numbers",async()=>{
  const {zip,audit}=await exportCsvDuplicateAudit(csv,[0]);
  expect(audit.conflictingGroups).toBe(1);
  const z=await JSZip.loadAsync(zip,{checkCRC32:true});
  const data=await z.file("duplicate-key-rows.csv")!.async("string");
  expect(data).toContain("'=2+3");
  expect(data).toContain("source_row");
  expect(data).toContain('"2"');
  expect(JSON.parse(await z.file("audit.json")!.async("string")).groups).toHaveLength(2);
 });
 it("rejects ambiguous key definitions and malformed rows",()=>{
  expect(()=>inspectCsvKeys(csv,[0,0])).toThrow(/distinct/);
  expect(()=>inspectCsvKeys("ID,Value\n1,x\n2",[0])).toThrow(/column counts/);
  expect(()=>inspectCsvKeys("ID,Value\n1,x",[2])).toThrow(/valid/);
 });
});
