import {describe,expect,it} from "vitest";
import {parseChartCsv,scatterChartModel,scatterChartSvg} from "./chartViz";
describe("Offline scientific CSV XY scatter and safe data roundtrip",()=>{
 it("plots actual numeric XY without category aggregation and retains original decimal precision",()=>{
  const input=parseChartCsv("Time (s),Voltage (V)\n0.0000123000,1.2300\n0.0000123000,2.000\n-1.5e-3,-0.50");
  const model=scatterChartModel(input,0,1,"Measurement","V");
  expect(model.points).toHaveLength(3);
  expect(model.points[0]).toEqual({x:0.0000123,y:1.23,xText:"0.0000123000",yText:"1.2300"});
  expect(model.points[1].x).toBe(model.points[0].x);
  expect(model.points[1].yText).toBe("2.000");
  expect(model.points[2].x).toBe(-0.0015);
  expect(model.minimum).toBe(-0.5);
  const xml=scatterChartSvg(model);
  expect(xml).toContain('viewBox="0 0 960 540"');
  expect((xml.match(/<circle /g)||[])).toHaveLength(3);
  expect(xml).toContain("0.0000123000, 1.2300");
  expect(xml).toContain("Time (s)");
  expect(xml).not.toContain("<script");
 });
 it("escapes hostile labels and text rather than executing SVG markup",()=>{
  const model=scatterChartModel(parseChartCsv('X,<script>alert(1)</script>\n1,2'),0,1,'Title <svg onload="bad()">',"m&V");
  const xml=scatterChartSvg(model);
  expect(xml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(xml).toContain('&lt;svg onload=&quot;bad()&quot;&gt;');
  expect(xml).toContain('m&amp;V');
  expect(xml).not.toContain('<script>');
  expect(xml).not.toContain("onload=\"bad()\"");
 });
 it("rejects absent, partially missing, unsafe and non-decimal numeric pairs",()=>{
  const missing=parseChartCsv("X,Y\n,\n1,2\n,\n3,4");
  expect(scatterChartModel(missing,0,1,"","").points).toHaveLength(2);
  for(const bad of ["1,","1,=2+2","1,+4","1,NaN","1,Infinity","1,0x12","1,1e999","1000000000001,2"]){
   expect(()=>scatterChartModel(parseChartCsv("X,Y\n"+bad),0,1,"","")).toThrow(/row 2/i);
  }
  expect(()=>scatterChartModel(missing,0,0,"","")).toThrow(/different/);
  expect(()=>scatterChartModel(parseChartCsv("X,Y\n,\n,"),0,1,"","")).toThrow(/No numeric/);
 });
 it("rejects excessive rows and supports identical constant coordinates",()=>{
  const many="X,Y\n"+Array.from({length:251},(_,i)=>i+","+i).join("\n");
  expect(()=>scatterChartModel(parseChartCsv(many),0,1,"","")).toThrow(/250/);
  const constant=scatterChartModel(parseChartCsv("X,Y\n3,4\n3,4"),0,1,"Constant","");
  expect(scatterChartSvg(constant)).toContain("<circle");
 });
});
