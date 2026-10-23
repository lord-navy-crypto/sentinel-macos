import {describe,expect,it} from "vitest";
import {halfwidthAscii,TEXT_CASE_LIMIT,transformTextCase} from "./textCaseWidth";

describe("QuickKit text case and ASCII width actions",()=>{
 it("uppercases and lowercases selected text while preserving newlines, spaces and CJK",()=>{
  const text="  Hello 世界!\nStraße and Élan  ";
  expect(transformTextCase(text,"upper")).toBe("  HELLO 世界!\nSTRASSE AND ÉLAN  ");
  expect(transformTextCase("  ABC 世界\r\nİstanbul  ","lower")).toBe("  abc 世界\r\ni\u0307stanbul  ");
 });
 it("uses a predictable simple title rule without breaking apostrophes or emoji",()=>{
  expect(transformTextCase("hELLo wORLD, it's O'NEILL! 中文 🚀\nAP physics","title"))
   .toBe("Hello World, It's O'neill! 中文 🚀\nAp Physics");
 });
 it("maps only fullwidth ASCII and U+3000 to ASCII, leaving compatibility CJK untouched",()=>{
  const source="ＡＢＣ１２３，ａ＋ｂ＝３！　中文①㎏";
  expect(halfwidthAscii(source)).toBe("ABC123,a+b=3! 中文①㎏");
  expect(transformTextCase(source,"halfwidth")).toBe("ABC123,a+b=3! 中文①㎏");
 });
 it("preserves empty text, tabs and CRLF with width changes only",()=>{
  expect(transformTextCase("","upper")).toBe("");
  expect(transformTextCase("Ａ\r\nＢ\tＣ","halfwidth")).toBe("A\r\nB\tC");
 });
 it("accepts exactly the limit, rejects excess and unknown mode",()=>{
  expect(transformTextCase("a".repeat(TEXT_CASE_LIMIT),"upper")).toHaveLength(TEXT_CASE_LIMIT);
  expect(()=>transformTextCase("a".repeat(TEXT_CASE_LIMIT+1),"upper")).toThrow(/limit/);
  expect(()=>transformTextCase("hello","invalid" as never)).toThrow(/Unsupported/);
 });
});
