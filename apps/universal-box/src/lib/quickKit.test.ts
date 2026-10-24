import {describe,it,expect} from "vitest";
import {cleanCopiedText,cleanTrackingUrl,cleanUrlList,dateDifference,shiftDate,parseGradeRows,calculateWeightedGrade,decodeQuickTextDraft} from "./quickKit";
describe("QuickKit no-upload utilities",()=>{
  it("cleans copied text while preserving line breaks by default",()=>{
    expect(cleanCopiedText(" A  B\r\nC\u00a0 D\u200b\n")).toBe("A B\nC D\n");
    expect(cleanCopiedText("A\nA\nB",{collapseSpaces:true,removeEmptyLines:true,deduplicateLines:true,joinWrappedLines:false})).toBe("A\nB");
    expect(cleanCopiedText("line one\nline two",{collapseSpaces:true,removeEmptyLines:true,deduplicateLines:false,joinWrappedLines:true})).toBe("line one line two");
    expect(()=>cleanCopiedText("x".repeat(200001))).toThrow();
  });
  it("removes tracking only, preserving functional URL query, anchor and host",()=>{
    const cleaned=cleanTrackingUrl("https://example.org/search?q=ap+physics&utm_source=mail&gclid=abc#results");
    expect(cleaned.url).toBe("https://example.org/search?q=ap+physics#results");
    expect(cleaned.removed).toEqual(["utm_source","gclid"]);
    expect(cleanTrackingUrl("https://example.org/?token=123&ref=abc").url).toContain("token=123&ref=abc");
    expect(cleanUrlList("https://example.org/?utm_medium=abc\nhttps://example.com/?id=7").removed).toBe(1);
    expect(()=>cleanTrackingUrl("javascript:alert(1)")).toThrow(/http/);
    expect(()=>cleanTrackingUrl("https://user:password@example.org/")).toThrow(/credentials/);
    expect(()=>cleanUrlList("")).toThrow();
  });
  it("calculates civil-date differences in UTC, leap years, and offset bounds",()=>{
    expect(dateDifference("2024-02-28","2024-03-01")).toBe(2);
    expect(dateDifference("2024-02-28","2024-03-01",true)).toBe(3);
    expect(shiftDate("2024-02-28",1)).toBe("2024-02-29");
    expect(shiftDate("2024-03-01",-2)).toBe("2024-02-28");
    expect(dateDifference("2026-10-31","2026-11-01")).toBe(1);
    expect(()=>dateDifference("2025-02-29","2025-03-01")).toThrow(/Invalid/);
    expect(()=>shiftDate("2026-01-01",1.5)).toThrow(/integer/);
  });
  it("calculates weighted grades and future-target requirements",()=>{
    const rows=parseGradeRows("Homework,25,90\nTests,25,80\nFinal,50,?");
    const grade=calculateWeightedGrade(rows,90);
    expect(grade.completedWeight).toBe(50);
    expect(grade.earned).toBe(42.5);
    expect(grade.currentAverage).toBe(85);
    expect(grade.required).toBe(95);
    expect(grade.projectedPerfect).toBe(92.5);
    const done=calculateWeightedGrade(parseGradeRows("All,100,88"),90);
    expect(done.finalGrade).toBe(88);
    expect(done.required).toBeNull();
    expect(()=>calculateWeightedGrade(parseGradeRows("A,10,100"),85)).toThrow(/100%/);
    expect(()=>parseGradeRows("A,foo,20")).toThrow();
    expect(()=>parseGradeRows("B,20,110")).toThrow();
  });
});

describe("QuickKit imports existing local TXT/Markdown safely",()=>{
 const utf8=(s:string)=>new TextEncoder().encode(s);
 it("reads UTF-8 BOM, Chinese, emoji and original Windows line endings without changing source bytes",()=>{
  const original=utf8("\uFEFF会议纪要  😀\r\n下一项  工作\r\n");
  const saved=new Uint8Array(original);
  const result=decodeQuickTextDraft("会议.md",original);
  expect(result).toEqual({text:"会议纪要  😀\r\n下一项  工作\r\n",encoding:"UTF-8"});
  expect(cleanCopiedText(result.text)).toBe("会议纪要 😀\n下一项 工作\n");
  expect(original).toEqual(saved);
 });
 it("accepts UTF-16LE Windows Unicode TXT only with BOM",()=>{
  const input="订单编号 00123\r\n客户名称 张三";
  const raw=new Uint8Array(2+input.length*2);
  raw[0]=255;raw[1]=254;
  for(let i=0;i<input.length;i++){raw[2+i*2]=input.charCodeAt(i)&255;raw[3+i*2]=input.charCodeAt(i)>>8;}
  expect(decodeQuickTextDraft("note.TXT",raw)).toEqual({text:input,encoding:"UTF-16LE"});
 });
 it("fails closed on binary data, unsupported extension/encoding, invalid bytes and oversize files",()=>{
  expect(()=>decodeQuickTextDraft("archive.docx",utf8("words"))).toThrow(/\.txt or \.md/);
  expect(()=>decodeQuickTextDraft("empty.txt",new Uint8Array(0))).toThrow(/1 byte/);
  expect(()=>decodeQuickTextDraft("empty.md",utf8(" \r\n "))).toThrow(/empty/);
  expect(()=>decodeQuickTextDraft("bad.txt",Uint8Array.from([255,255,65]))).toThrow(/valid UTF-8/);
  expect(()=>decodeQuickTextDraft("unicode.txt",Uint8Array.from([254,255,0,65]))).toThrow(/UTF-16BE/);
  expect(()=>decodeQuickTextDraft("broken.txt",Uint8Array.from([255,254,65]))).toThrow(/Truncated/);
  expect(()=>decodeQuickTextDraft("binary.md",utf8("OK\u0000BAD"))).toThrow(/binary/);
  expect(()=>decodeQuickTextDraft("large.txt",new Uint8Array(500001))).toThrow(/500 KB/);
  expect(()=>decodeQuickTextDraft("too-long.md",utf8("x".repeat(200001)))).toThrow(/200,000-character/);
 });
});
