import {describe,expect,it} from "vitest";
import {LOCAL_TOOLS} from "../components/ToolLaunchpad";
import {SENTINEL_EXTRA_READS,SENTINEL_LEGACY_ONLY} from "./sentinelSurfaceCatalog";

describe("original Sentinel native workbench visibility",()=>{
 it("registers exactly one browse/search entry per standalone original Go read surface",()=>{
  expect(SENTINEL_EXTRA_READS).toHaveLength(31);
  expect(new Set(SENTINEL_EXTRA_READS.map(x=>x.id)).size).toBe(31);
  const tools=LOCAL_TOOLS.filter(x=>x.id.startsWith("sentinel-original-"));
  expect(tools).toHaveLength(31);
  for(const operation of SENTINEL_EXTRA_READS){
   const tool=tools.find(x=>x.module===operation.id);
   expect(tool).toBeDefined();
   expect(tool?.name).toContain(operation.name);
   expect(tool?.view).toBe(operation.lens==="overview"?"sentinel":"sentinel-"+operation.lens);
   expect(tool?.area).toBe("Sentinel");
  }
 });
 it("still preserves existing original Go shortcuts and guarded full WebView categories",()=>{
  expect(LOCAL_TOOLS.find(t=>t.id==="sentinel-system-overview")).toBeDefined();
  expect(LOCAL_TOOLS.find(t=>t.id==="sentinel-evidence-search")).toBeDefined();
  expect(LOCAL_TOOLS.find(t=>t.id==="sentinel-log-redactor")).toBeDefined();
  expect(SENTINEL_LEGACY_ONLY.length).toBeGreaterThanOrEqual(4);
  const names=SENTINEL_LEGACY_ONLY.map(x=>x.title).join(" ");
  expect(names).toMatch(/安全操作/);
 });
});
