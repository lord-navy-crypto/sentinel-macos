import {describe,it,expect} from "vitest";
import {normalizeOcrLines} from "./ocrTextFlow";
describe("Native OCR to editable text flow",()=>{
 it("preserves Chinese and English line order as recognized",()=>{
  const r=normalizeOcrLines([{text:"你好世界",confidence:0.99},{text:"Hello, Sentinel Box",confidence:0.87}]);
  expect(r.lines).toHaveLength(2);
  expect(r.text).toBe("你好世界\nHello, Sentinel Box");
 });
 it("accepts honest empty recognition without inventing a transcript",()=>{
  expect(normalizeOcrLines([])).toMatchObject({lines:[],text:""});
 });
 it("rejects invalid recognizer responses and unbounded output",()=>{
  expect(()=>normalizeOcrLines("This is not an OCR line array")).toThrow(/Invalid/);
  expect(()=>normalizeOcrLines([{text:"ok",confidence:2}])).toThrow(/Invalid OCR/);
  expect(()=>normalizeOcrLines([{text:"x".repeat(10001),confidence:.5}])).toThrow();
 });
});
