import {describe,it,expect} from "vitest";
import {duplicateGroups,fileKind,inventoryCsv,mismatchedExtension,sizeLabel,type FileInspection} from "./fileIntake";
const file=(name:string,sha256:string):FileInspection=>({name,size:42,sha256,kind:"PDF",extension:"pdf",mismatch:false});
describe("local File Intake",()=>{
 it("checks known file signatures and does not trust extensions",()=>{
  expect(fileKind(Uint8Array.from([37,80,68,70,45,49]))).toBe("PDF");
  expect(fileKind(Uint8Array.from([137,80,78,71,13,10,26,10]))).toBe("PNG");
  expect(fileKind(Uint8Array.from([255,216,255,1]))).toBe("JPEG");
  expect(fileKind(Uint8Array.from([80,75,3,4,0]))).toBe("ZIP container");
  expect(fileKind(new Uint8Array(12))).toBe("Unknown");
  expect(mismatchedExtension("PDF","report.png")).toBe(true);
  expect(mismatchedExtension("ZIP container","work.docx")).toBe(false);
  expect(mismatchedExtension("Unknown","thing.exe")).toBe(false);
 });
 it("groups files only when both hashes and sizes match",()=>{
  const a=file("A.pdf","a".repeat(64)),b=file("B.pdf","a".repeat(64));
  const different={...file("C.pdf","a".repeat(64)),size:40};
  const groups=duplicateGroups([a,b,different]);
  expect(groups).toHaveLength(1);
  expect(groups[0].map(x=>x.name)).toEqual(["A.pdf","B.pdf"]);
 });
 it("protects CSV from formulas, quotes and embedded newlines",()=>{
  const data=inventoryCsv([{...file('=HYPERLINK("evil")\nodd.pdf',"0".repeat(64)),mismatch:true}]);
  expect(data).toContain(`"'=HYPERLINK(""evil"")\nodd.pdf"`);
  expect(data).toContain('"YES"');
  expect(data).toMatch(/^\uFEFF/);
 });
 it("reports human-scale sizes",()=>{
  expect(sizeLabel(200)).toBe("200 B");
  expect(sizeLabel(2200)).toBe("2.2 KB");
  expect(sizeLabel(2000000)).toBe("2.00 MB");
 });
});
