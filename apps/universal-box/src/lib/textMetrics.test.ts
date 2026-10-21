import {describe,it,expect} from "vitest";
import {analyzeTextMetrics,checkTextLimit,textMetricsReport} from "./textMetrics";
describe("Everyday Word Counter: real Unicode-safe text metrics",()=>{
 it("counts complex emoji and combining accents as displayed characters",()=>{
  const m=analyzeTextMetrics("👩‍👩‍👧‍👦e\u0301 汉字");
  expect(m.characters).toBe(5);
  expect(m.withoutWhitespace).toBe(4);
  expect(m.emojiClusters).toBe(1);
  expect(m.utf16Units).toBeGreaterThan(m.characters);
  expect(m.utf8Bytes).toBeGreaterThan(m.utf16Units);
  expect(m.hanCharacters).toBe(2);
  expect(m.letters).toBe(3);
 });
 it("distinguishes letters, Han script, digits, punctuation, spaces and symbols",()=>{
  const m=analyzeTextMetrics("Hello! 中文 123 +");
  expect(m.latinLetters).toBe(5);
  expect(m.hanCharacters).toBe(2);
  expect(m.letters).toBe(7);
  expect(m.numbers).toBe(3);
  expect(m.punctuation).toBe(1);
  expect(m.symbols).toBeGreaterThanOrEqual(1);
  expect(m.whitespace).toBe(3);
  expect(m.spaces).toBe(3);
 });
 it("treats CRLF as one line break while counting its original byte size",()=>{
  const m=analyzeTextMetrics("alpha\r\nbeta\n\nthird");
  expect(m.lines).toBe(4);
  expect(m.paragraphs).toBe(2);
  expect(m.words).toBe(3);
  expect(m.utf8Bytes).toBe(new TextEncoder().encode("alpha\r\nbeta\n\nthird").length);
 });
 it("handles blank inputs and strict maximum input length",()=>{
  const m=analyzeTextMetrics("");
  expect(m.characters).toBe(0);expect(m.words).toBe(0);
  expect(m.readingMinutes).toBe(0);expect(m.lines).toBe(0);
  expect(()=>analyzeTextMetrics("x".repeat(1000001))).toThrow(/1,000,000/);
 });
 it("length limits are exact and do not truncate source content",()=>{
  const m=analyzeTextMetrics("apple banana pear");
  expect(checkTextLimit(m,"words",3)).toMatchObject({used:3,remaining:0,exceeded:false});
  expect(checkTextLimit(m,"characters",5).exceeded).toBe(true);
  expect(()=>checkTextLimit(m,"words",0)).toThrow(/positive/);
 });
 it("generates a local standalone report and optional selection summary",()=>{
  const text="Hello 你好 👋";
  const report=textMetricsReport(text,"你好");
  expect(report).toContain("Unicode visible characters:");
  expect(report).toContain("Latin letters:");
  expect(report).toContain("Selection: 2 characters");
  expect(report).not.toContain(text);
 });
});
