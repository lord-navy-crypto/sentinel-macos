import {describe,it,expect} from "vitest";
import {graphRasterDimensions} from "./graphRasterExport";
describe("graph PNG export safety",()=>{
 it("preserves aspect ratio and doubles raster resolution",()=>{
  expect(graphRasterDimensions(780,470)).toEqual({width:1560,height:940});
  expect(graphRasterDimensions(400,200,3)).toEqual({width:1200,height:600});
 });
 it("rejects invalid/outsize dimensions and scales",()=>{
  expect(()=>graphRasterDimensions(0,400)).toThrow(/pixel budget/);
  expect(()=>graphRasterDimensions(4000,2000)).toThrow(/pixel budget/);
  expect(()=>graphRasterDimensions(300,200,4)).toThrow(/pixel budget/);
  expect(()=>graphRasterDimensions(300.5,200,2)).toThrow(/pixel budget/);
 });
});
