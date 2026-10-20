import {describe,it,expect} from "vitest";
import {PDFDocument} from "pdf-lib";
import {parsePdfPageOrder,exportSelectedPdfPages} from "./pdfEveryday";
describe("free PDF page extraction and ordering",()=>{
 it("parses inclusive ranges and keeps intentional duplicate pages",()=>{
  expect(parsePdfPageOrder("3, 1-2, 3",5)).toEqual([2,0,1,2]);
 });
 it("rejects out-of-range and reversed page selections",()=>{
  expect(()=>parsePdfPageOrder("0",3)).toThrow();
  expect(()=>parsePdfPageOrder("4",3)).toThrow();
  expect(()=>parsePdfPageOrder("3-1",3)).toThrow();
  expect(()=>parsePdfPageOrder("1,,2",3)).toThrow();
 });
 it("exports pages in the requested order without mutating input",async()=>{
  const pdf=await PDFDocument.create();
  pdf.addPage([300,300]);pdf.addPage([400,400]);pdf.addPage([500,500]);
  const source=await pdf.save();
  const result=await exportSelectedPdfPages(source,"3,1,3");
  const output=await PDFDocument.load(result);
  expect(output.getPages().map(p=>p.getWidth())).toEqual([500,300,500]);
  expect((await PDFDocument.load(source)).getPageCount()).toBe(3);
 });
});
