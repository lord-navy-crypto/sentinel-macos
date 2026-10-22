import {describe,it,expect} from "vitest";
import {LOCAL_TOOLS} from "./ToolLaunchpad";
import {UTILITIES} from "./EverydayTools";

describe("Sentinel Box tool catalog integration quality",()=>{
 it("keeps every catalog identifier unique as the app grows",()=>{
  const ids=LOCAL_TOOLS.map(item=>item.id);
  expect(new Set(ids).size).toBe(ids.length);
 });
 it("exposes only one public text contrast catalog entry while preserving legacy color shortcut",()=>{
  const matches=LOCAL_TOOLS.filter(item=>/color contrast|text contrast|文字对比度|颜色对比/i.test(item.name));
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({id:"color",view:"utilities",module:"color"});
  expect(LOCAL_TOOLS.some(item=>item.id==="wcag-text-color-contrast")).toBe(false);
  const tab=UTILITIES.filter(item=>item.id==="color");
  expect(tab).toHaveLength(1);
  expect(tab[0].description).toMatch(/AA\/AAA/);
 });
 it("preserves a single CSV to VCF / VCF to CSV entry and its existing route",()=>{
  const matches=LOCAL_TOOLS.filter(item=>/VCF|vCard/i.test(item.name)&&/CSV/i.test(item.name));
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({id:"contacts-csv-vcf",view:"office-privacy",module:"contacts"});
 });
});
