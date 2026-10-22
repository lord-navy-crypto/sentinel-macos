import {describe,it,expect} from "vitest";
import {decodeQuickTextFile,QUICK_TEXT_MAX_BYTES} from "./quickTextImport";
const enc=new TextEncoder();
describe("Explicit local text file import",()=>{
 it("preserves indentation, Chinese and line breaks rather than trimming pasted text",()=>{
  const raw="  第一行\r\n  Line 2  \n\n";
  expect(decodeQuickTextFile("notes.MD",enc.encode(raw))).toBe(raw);
  expect(decodeQuickTextFile("report.csv",enc.encode("001,alpha\n002,beta"))).toBe("001,alpha\n002,beta");
 });
 it("accepts UTF-8 BOM without inserting an invisible marker into the editor",()=>{
  const bytes=Uint8Array.from([0xEF,0xBB,0xBF,...enc.encode("Hello 世界")]);
  expect(decodeQuickTextFile("sample.txt",bytes)).toBe("Hello 世界");
 });
 it("rejects invalid extensions, empty files, oversized files and binary payloads",()=>{
  expect(()=>decodeQuickTextFile("malware.exe",enc.encode("hello"))).toThrow(/supported/);
  expect(()=>decodeQuickTextFile("a.txt",new Uint8Array(0))).toThrow(/1–200,000 bytes/);
  expect(()=>decodeQuickTextFile("a.txt",new Uint8Array(QUICK_TEXT_MAX_BYTES+1))).toThrow(/1–200,000 bytes/);
  expect(()=>decodeQuickTextFile("a.txt",Uint8Array.from([0xff,0xfe,0x00]))).toThrow(/UTF-8/);
  expect(()=>decodeQuickTextFile("binary.log",enc.encode("a\u0000b"))).toThrow(/NUL/);
 });
});
