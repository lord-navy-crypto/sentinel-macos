/** User-initiated local export. Keeps source snapshot separate from edits and cleanup. */
import JSZip from "jszip";
import type {WebTableHandoff} from "./webCaptureHandoff";
import type {CsvCleanupOptions} from "./csvCleanroom";
import {inspectWorkspaceCsv} from "./csvCleanroom";

export type WebCaptureReviewBundle={
 handoff:WebTableHandoff;
 workingCsv:string;
 cleanedCsv:string;
 cleanupOptions:CsvCleanupOptions;
 removedRows:number;
};
export async function createWebCaptureReviewBundle(input:WebCaptureReviewBundle):Promise<Uint8Array>{
 const {handoff,workingCsv,cleanedCsv,cleanupOptions,removedRows}=input;
 if(!handoff||handoff.schemaVersion!==1||handoff.format!=="sentinel-box-web-table")
  throw Error("请先导入有效的网页表格交接 JSON。");
 if(!workingCsv||!cleanedCsv||workingCsv.length>2_000_000||cleanedCsv.length>2_500_000)
  throw Error("要导出的 CSV 内容无效或过大。");
 const importedCsv=handoff.table.csv;
 if(!importedCsv||importedCsv.length>400_000)throw Error("原始网页表格超过导出限制。");
 const importedStats=inspectWorkspaceCsv(importedCsv);
 const workingStats=inspectWorkspaceCsv(workingCsv);
 const cleanedStats=inspectWorkspaceCsv(cleanedCsv);
 const manifest={
  format:"sentinel-box-web-review-bundle",
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  source:handoff.source,
  table:{index:handoff.table.index,rows:handoff.table.rows,columns:handoff.table.columns},
  contents:{
   captured:"captured-from-web.csv",
   working:"locally-reviewed.csv",
   output:"cleaned-output.csv"
  },
  modifiedAfterImport:workingCsv!==importedCsv,
  review:{captured:importedStats,working:workingStats,output:cleanedStats,removedRows},
  cleanupOptions:{...cleanupOptions},
  caveat:"Page-provided source metadata is unverified. CSV spreadsheet formula behavior varies by program."
 };
 const zip=new JSZip();
 zip.file("manifest.json",JSON.stringify(manifest,null,2));
 zip.file("captured-from-web.csv","\uFEFF"+importedCsv);
 zip.file("locally-reviewed.csv","\uFEFF"+workingCsv);
 zip.file("cleaned-output.csv","\uFEFF"+cleanedCsv);
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
 if(bytes.length>15_000_000)throw Error("ZIP 超过 15 MB 导出限制。");
 return bytes;
}
