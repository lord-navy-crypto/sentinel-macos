import {describe,it,expect} from "vitest";
import {LOCAL_TOOLS} from "../components/ToolLaunchpad";
import {VISUAL_TOOL_FAMILIES,visualToolFamily} from "./toolVisualCategories";
import {clearRecentExports,getRecentExports,registerRecentExport,subscribeRecentExports} from "./recentExports";

describe("Desktop workspace office catalog",()=>{
 it("categorizes each existing tool without changing its launch route",()=>{
  const families=new Set(VISUAL_TOOL_FAMILIES);
  expect(LOCAL_TOOLS.length).toBeGreaterThan(50);
  for(const tool of LOCAL_TOOLS){
   expect(families.has(visualToolFamily(tool))).toBe(true);
   expect(tool.view.length).toBeGreaterThan(0);
  }
  expect(visualToolFamily({name:"Merge PDF",area:"Files",view:"files"})).toBe("PDF 与文档");
  expect(visualToolFamily({name:"Resize Image",area:"Images",view:"files"})).toBe("图片与媒体");
  expect(visualToolFamily({name:"CSV Table",area:"Data",view:"tables"})).toBe("表格与数据");
  expect(visualToolFamily({name:"Local sharing",area:"Office",view:"commons"})).toBe("局域网与共享");
 });
 it("tracks at most eight successful exports in RAM, never full paths",()=>{
  clearRecentExports();
  for(let i=0;i<12;i++)registerRecentExport("/private/work/report-"+i+".pdf",i*1024,i+1);
  const records=getRecentExports();
  expect(records).toHaveLength(8);
  expect(records[0]).toEqual({name:"report-11.pdf",extension:"PDF",size:11*1024,at:12});
  expect(records.every(row=>!row.name.includes("private"))).toBe(true);
  clearRecentExports();
 });
 it("notifies subscribers on new export and cleanup is effective",()=>{
  clearRecentExports();
  let events=0;
  const stop=subscribeRecentExports(()=>{events++;});
  registerRecentExport("image.png",450,99);
  expect(events).toBe(1);
  stop();
  registerRecentExport("again.png",10,100);
  expect(events).toBe(1);
  clearRecentExports();
 });
});
