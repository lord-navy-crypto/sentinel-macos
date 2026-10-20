import {describe,it,expect} from "vitest";
import {cleanCopiedText,cleanTrackingUrl,cleanUrlList,dateDifference,shiftDate,parseGradeRows,calculateWeightedGrade} from "./quickKit";
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
