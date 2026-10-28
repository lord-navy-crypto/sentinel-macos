import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {createWebCaptureReviewBundle} from "./webCaptureReviewBundle";
import {DEFAULT_CSV_CLEANUP} from "./csvCleanroom";
const handoff={
 format:"sentinel-box-web-table" as const,schemaVersion:1 as const,
 source:{title:"Example",url:"https://example.org/data",capturedAt:"2026-10-28T12:00:00Z"},
 table:{index:2,rows:2,columns:2,csv:'"Name","Number"\r\n"Ada","1"'}
};
describe("Attributable offline CSV review archive",()=>{
 it("exports separate captured, reviewed, cleaned and manifest files",async()=>{
  const workingCsv='"Name","Number"\r\n"Ada","2"';
  const cleanedCsv='"Name","Number"\r\n"Ada","2"\r\n';
  const bytes=await createWebCaptureReviewBundle({handoff,workingCsv,cleanedCsv,cleanupOptions:DEFAULT_CSV_CLEANUP,removedRows:0});
  const archive=await JSZip.loadAsync(bytes);
  expect(Object.keys(archive.files).sort()).toEqual([
   "captured-from-web.csv","cleaned-output.csv","locally-reviewed.csv","manifest.json"
  ].sort());
  const manifest=JSON.parse(await archive.file("manifest.json")!.async("string"));
  expect(manifest.source.url).toBe("https://example.org/data");
  expect(manifest.table.index).toBe(2);
  expect(manifest.modifiedAfterImport).toBe(true);
  expect(manifest.review.captured.inputRows).toBe(1);
  expect(manifest.review.output.inputRows).toBe(1);
  expect(await archive.file("captured-from-web.csv")!.async("string")).toContain('"Ada","1"');
  expect(await archive.file("cleaned-output.csv")!.async("string")).toContain('"Ada","2"');
 });
 it("rejects invalid sources and empty data rather than making deceptive provenance",async()=>{
  const fixture={handoff,workingCsv:handoff.table.csv,cleanedCsv:handoff.table.csv,
    cleanupOptions:DEFAULT_CSV_CLEANUP,removedRows:0};
  await expect(createWebCaptureReviewBundle({...fixture,workingCsv:""})).rejects.toThrow(/CSV/);
  await expect(createWebCaptureReviewBundle({...fixture,handoff:{...handoff,schemaVersion:2 as 1}})).rejects.toThrow(/交接/);
 });
});