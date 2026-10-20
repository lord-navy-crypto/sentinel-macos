import {describe,expect,it} from "vitest";
import {
 compareBlobs,comparisonReport,COMPARE_MAX_BYTES,COMPARE_SEGMENTS,
} from "./binaryCompare";

const blob=(array:number[])=>new Blob([new Uint8Array(array)]);
describe("offline exact binary comparison",()=>{
 it("detects identical contents and reports progress",async()=>{
  const steps:number[]=[];
  const a=blob([1,2,3,4,5,6,7,8]);
  const result=await compareBlobs(a,blob([1,2,3,4,5,6,7,8]),{
   chunkSize:3,onProgress:p=>steps.push(p.done),
  });
  expect(result.status).toBe("identical");
  expect(result.firstDifference).toBeNull();
  expect(result.changedBytes).toBe(0);
  expect(result.totalChunks).toBe(3);
  expect(result.dirtyChunks).toBe(0);
  expect(steps.at(-1)).toBe(8);
  expect(result.segments.some(s=>s.different)).toBe(false);
 });
 it("marks modified and missing bytes, including the earliest offset",async()=>{
  const result=await compareBlobs(blob([1,2,3,4,5,6]),blob([1,99,3,4]),{chunkSize:2});
  expect(result.status).toBe("different");
  expect(result.changedBytes).toBe(3); // replaced byte and two missing bytes
  expect(result.firstDifference).toBe(1);
  expect(result.dirtyChunks).toBe(2);
  expect(result.segments.filter(s=>s.different).length).toBe(3);
 });
 it("catches prefix-only matches and completely empty input",async()=>{
  const prefix=await compareBlobs(blob([7,8]),blob([7,8,9]),{chunkSize:1});
  expect(prefix.firstDifference).toBe(2);
  expect(prefix.changedBytes).toBe(1);
  expect((await compareBlobs(blob([]),blob([]))).status).toBe("identical");
  expect((await compareBlobs(blob([]),blob([]))).segments).toHaveLength(0);
 });
 it("supports user cancellation before reading source bytes",async()=>{
  const controller=new AbortController();controller.abort();
  await expect(compareBlobs(blob([1]),blob([1]),{signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
 });
 it("refuses excessively large or unsafe comparison inputs",async()=>{
  const over=new Blob([],{});Object.defineProperty(over,"size",{value:COMPARE_MAX_BYTES+1});
  await expect(compareBlobs(over,blob([]))).rejects.toThrow(/256 MB/);
  await expect(compareBlobs(blob([1]),blob([1]),{chunkSize:0})).rejects.toThrow(/chunk/);
 });
 it("emits a JSON report of metadata only, with section information",async()=>{
  const result=await compareBlobs(blob([1,2,3]),blob([1,2,4]),{chunkSize:1});
  const report=JSON.parse(comparisonReport(result,"left.bin","right.bin")) as Record<string,unknown>;
  expect(report.format).toBe("offline-exact-binary-compare-v1");
  expect(report.changedBytes).toBe(1);
  expect(report.firstDifferenceOffset).toBe(2);
  expect((report.sections as unknown[]).length).toBeLessThanOrEqual(COMPARE_SEGMENTS);
  expect(JSON.stringify(report)).not.toContain("base64");
 });
});
