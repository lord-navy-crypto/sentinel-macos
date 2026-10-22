import {describe,it,expect} from "vitest";
import {normalizeOcrLines,countUncertainOcrLines} from "./ocrTextFlow";
import {cleanCopiedText,DEFAULT_CLEANUP} from "./quickKit";
describe("Native OCR to editable text flow",()=>{
 it("preserves Chinese and English line order as recognized",()=>{
  const r=normalizeOcrLines([{text:"你好世界",confidence:0.99},{text:"Hello, Sentinel Box",confidence:0.87}]);
  expect(r.lines).toHaveLength(2);
  expect(r.text).toBe("你好世界\nHello, Sentinel Box");
 });
 it("accepts honest empty recognition without inventing a transcript",()=>{
  expect(normalizeOcrLines([])).toMatchObject({lines:[],text:""});
 });
 it("counts uncertain nonempty OCR lines as review hints, not accuracy guarantees",()=>{
  const lines=normalizeOcrLines([
   {text:"清楚的中文",confidence:0.94},
   {text:"uncertain line",confidence:0.51},
   {text:"  ",confidence:0.1},
   {text:"borderline line",confidence:0.65},
  ]).lines;
  expect(countUncertainOcrLines(lines)).toBe(1);
  expect(countUncertainOcrLines(lines,0.7)).toBe(2);
  expect(()=>countUncertainOcrLines(lines,-0.1)).toThrow(/threshold/);
  expect(()=>countUncertainOcrLines([{text:"oops",confidence:NaN}])).toThrow(/confidence/);
 });
 it("optional OCR reflow keeps original recognized text and paragraph boundaries",()=>{
  const raw="First scanned line\ncontinues here.\n\n第二段\n接着第二行";
  const options={...DEFAULT_CLEANUP,joinSoftWrappedParagraphs:true};
  const reflow=cleanCopiedText(raw,options);
  expect(reflow).toBe("First scanned line continues here.\n\n第二段接着第二行");
  expect(raw).toBe("First scanned line\ncontinues here.\n\n第二段\n接着第二行");
  expect(cleanCopiedText(raw,DEFAULT_CLEANUP)).toBe(raw);
 });
 it("rejects invalid recognizer responses and unbounded output",()=>{
  expect(()=>normalizeOcrLines("This is not an OCR line array")).toThrow(/Invalid/);
  expect(()=>normalizeOcrLines([{text:"ok",confidence:2}])).toThrow(/Invalid OCR/);
  expect(()=>normalizeOcrLines([{text:"x".repeat(10001),confidence:.5}])).toThrow();
 });
});
