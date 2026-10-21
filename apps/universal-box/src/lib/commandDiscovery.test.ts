import {describe,it,expect} from "vitest";
import {searchPalette,addPaletteRecent,sanitizePaletteHistory,type PaletteCommand} from "./commandDiscovery";
const items:PaletteCommand[]=[
 {id:"view-all-tools",name:"All tools / 全部工具",description:"Search all modules",view:"all-tools"},
 {id:"tool-business-billing",name:"Business Invoices & Quotes · 批量发票报价单 Word/PDF",description:"Office",view:"workflows",module:"business-billing"},
 {id:"tool-pdf-measured-optimize",name:"PDF Size Optimizer · 实测文件大小优化",description:"Files",view:"pdf-mini",module:"optimize"},
 {id:"tool-scan-pdf-compress",name:"Scanned PDF Image Compressor · DPI / JPEG 扫描件压缩",description:"Files",view:"pdf-mini",module:"scan-compress"},
 {id:"tool-target-photo-compressor",name:"Target Size Photo Compression · 批量照片指定 KB 压缩",description:"Images",view:"media-files",module:"photo-target"},
 {id:"view-notes",name:"Notes",description:"Local notes",view:"notes"},
 {id:"tool-word-count",name:"Word Counter",description:"Text",view:"utilities",module:"stats"},
];
const ids=new Set(items.map(x=>x.id));
describe("Offline Sentinel Box global command discovery",()=>{
 it("searches useful English and Chinese intents without networking",()=>{
  expect(searchPalette(items,"发票")[0].id).toBe("tool-business-billing");
  expect(searchPalette(items,"invoice")[0].id).toBe("tool-business-billing");
  expect(searchPalette(items,"heic转jpg")[0].id).toBe("tool-target-photo-compressor");
  expect(searchPalette(items,"字数统计")[0].id).toBe("tool-word-count");
  expect(searchPalette(items,"压缩pdf").slice(0,2).map(x=>x.id)).toContain("tool-scan-pdf-compress");
  expect(searchPalette(items,"NOT EXISTING UTILITY")).toHaveLength(0);
 });
 it("prioritizes individually pinned and recent tools, not entire workspaces",()=>{
  const results=searchPalette(items,"",["tool-business-billing"],["tool-target-photo-compressor"]);
  expect(results.slice(0,2).map(x=>x.id)).toEqual(["tool-business-billing","tool-target-photo-compressor"]);
  expect(results.some(x=>x.id==="view-notes")).toBe(false);
 });
 it("does not double-count or store unrecognized/fabricated local preference IDs",()=>{
  expect(sanitizePaletteHistory(["tool-business-billing","tool-business-billing","fake",{token:"never"},"view-notes"],ids)).toEqual([
   "tool-business-billing","view-notes"
  ]);
  expect(addPaletteRecent(["view-notes","tool-business-billing"],"tool-business-billing",ids)).toEqual([
   "tool-business-billing","view-notes"
  ]);
  expect(addPaletteRecent([],"attacker-fake-command",ids)).toEqual([]);
 });
 it("filters whitespace and allows distinct scoped actions inside the same view",()=>{
  expect(searchPalette(items,"  invoice  ")[0].module).toBe("business-billing");
  expect(searchPalette(items,"压缩pdf").some(x=>x.module==="scan-compress")).toBe(true);
  expect(searchPalette(items,"压缩pdf").some(x=>x.module==="optimize")).toBe(true);
 });
 it("enforces UI result count while preserving distinct commands",()=>{
  expect(searchPalette(items,"",[],[],3)).toHaveLength(3);
 });
});
