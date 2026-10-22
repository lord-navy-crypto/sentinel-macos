import {describe,it,expect} from "vitest";
import {PDFDocument} from "pdf-lib";
import {inspectMergeFiles,mergePdfFiles,moveMergeFile,validateMergeFiles,mergedPageRanges,validateMergeOutputName,type MergePdfInput} from "./pdfMergeQuick";

async function pdf(name:string,widths:number[]):Promise<MergePdfInput>{
 const doc=await PDFDocument.create();
 widths.forEach(width=>doc.addPage([width,600]));
 const data=await doc.save();
 return {name,size:data.length,arrayBuffer:async()=>Uint8Array.from(data).buffer};
}

describe("Daily PDF merge order, previews and input limits",()=>{
 it("moves files without changing their bytes or their original array",()=>{
  const input=["A","B","C"];
  expect(moveMergeFile(input,2,0)).toEqual(["C","A","B"]);
  expect(moveMergeFile(input,0,1)).toEqual(["B","A","C"]);
  expect(input).toEqual(["A","B","C"]);
  expect(()=>moveMergeFile(input,-1,0)).toThrow(/invalid/);
  expect(()=>moveMergeFile(input,1,3)).toThrow(/invalid/);
  expect(()=>moveMergeFile(input,1.5,1)).toThrow(/invalid/);
 });
 it("preflights every real PDF and merges in the supplied order, even for duplicate names",async()=>{
  const first=await pdf("attachment.pdf",[410,411]),second=await pdf("attachment.pdf",[520]);
  const entries=await inspectMergeFiles([second,first]);
  expect(entries.map(e=>e.pages)).toEqual([1,2]);
  expect(entries.map(e=>e.name)).toEqual(["attachment.pdf","attachment.pdf"]);
  const merged=await mergePdfFiles([second,first]);
  const doc=await PDFDocument.load(merged.bytes);
  expect(merged.pages).toBe(3);
  expect(doc.getPages().map(p=>p.getWidth())).toEqual([520,410,411]);
  const reversed=await mergePdfFiles([first,second]);
  const reordered=await PDFDocument.load(reversed.bytes);
  expect(reordered.getPages().map(p=>p.getWidth())).toEqual([410,411,520]);
 });
 it("rejects invalid names, excessive file count and oversized total before reading",()=>{
  expect(()=>validateMergeFiles([])).toThrow(/1–20/);
  expect(()=>validateMergeFiles([{name:"notes.txt",size:500}])).toThrow(/valid/);
  expect(()=>validateMergeFiles([{name:"a.pdf",size:0}])).toThrow(/valid/);
  expect(()=>validateMergeFiles([{name:"a.pdf",size:15_000_001}])).toThrow(/15 MB/);
  expect(()=>validateMergeFiles(Array.from({length:21},(_,i)=>({name:i+".pdf",size:1000})))).toThrow(/1–20/);
  expect(()=>validateMergeFiles(Array.from({length:5},(_,i)=>({name:i+".pdf",size:14_000_000})))).toThrow(/60 MB/);
 });
 it("shows inclusive merged page boundaries in exactly the chosen PDF order",()=>{
  const entries=[
   {name:"book.pdf",pages:2,bytes:500},
   {name:"worksheet.pdf",pages:1,bytes:600},
   {name:"appendix.pdf",pages:3,bytes:700},
  ];
  expect(mergedPageRanges(entries)).toEqual([
   {first:1,last:2},{first:3,last:3},{first:4,last:6},
  ]);
  expect(mergedPageRanges([])).toEqual([]);
  expect(()=>mergedPageRanges([{name:"invalid.pdf",pages:0,bytes:100}])).toThrow(/page count/);
  expect(()=>mergedPageRanges([{name:"huge.pdf",pages:201,bytes:100}])).toThrow(/page count/);
  expect(()=>mergedPageRanges([
   {name:"first.pdf",pages:200,bytes:100},
   {name:"second.pdf",pages:200,bytes:100},
   {name:"third.pdf",pages:1,bytes:100},
  ])).toThrow(/400 pages/);
 });
 it("permits readable Chinese PDF filenames without duplicate .pdf extension",()=>{
  expect(validateMergeOutputName("  文书汇总.PDF  ")).toBe("文书汇总.pdf");
  expect(validateMergeOutputName("Final-Review.pdf")).toBe("Final-Review.pdf");
  expect(validateMergeOutputName("meeting-notes")).toBe("meeting-notes.pdf");
  expect(validateMergeOutputName("report.v2.pdf")).toBe("report.v2.pdf");
 });
 it("rejects empty, traversal, Windows reserved and control-character output paths",()=>{
  for(const name of ["","  ","..","CON.pdf","NUL","COM1.pdf",
   "../hidden.pdf","folder\\\\merge.pdf","filename:bad.pdf",".secret.pdf",
   "trailing..pdf","bad\nname.pdf", "x".repeat(101)+".pdf"]){
   expect(()=>validateMergeOutputName(name)).toThrow();
  }
 });
 it("refuses unreadable files and explains which input failed",async()=>{
  const invalid:MergePdfInput={name:"broken.pdf",size:500,arrayBuffer:async()=>new Uint8Array(500).buffer};
  await expect(inspectMergeFiles([invalid])).rejects.toThrow(/PDF 1/);
  await expect(mergePdfFiles([invalid])).rejects.toThrow(/PDF 1/);
 });
});
