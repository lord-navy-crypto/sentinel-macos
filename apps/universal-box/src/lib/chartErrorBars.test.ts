import {describe,expect,it} from "vitest";
import {parseChartCsv,scatterChartModel,scatterChartSvg,scatterChartCsv} from "./chartViz";
import {fitScatterLine} from "./scatterRegression";
import {analyzeFitResiduals,residualScatterChart} from "./scatterResiduals";
describe("Measured Y uncertainty as genuine scientific error bars",()=>{
 const input="Time (s),Voltage (V),Uncertainty (V)\n0.0000123000,1.2300,0.0500\n0.0000123000,1.3300,0.1\n-1.5e-3,-0.50,2e-2";
 it("retains original strings and draws one three-line error bar per observation",()=>{
  const table=parseChartCsv(input);
  const data=scatterChartModel(table,0,1,"Test","V",2);
  expect(data.uncertaintyLabel).toBe("Uncertainty (V)");
  expect(data.points[0]).toMatchObject({x:0.0000123,y:1.23,yError:0.05,yErrorText:"0.0500"});
  expect(data.points[2]).toMatchObject({y:-0.5,yError:0.02,yErrorText:"2e-2"});
  const svg=scatterChartSvg(data);
  expect((svg.match(/data-series="y-uncertainty"/gu)??[])).toHaveLength(3);
  expect((svg.match(/<circle /gu)??[])).toHaveLength(3);
  const output=scatterChartCsv(data);
  expect(output).toContain("0.0000123000,1.2300,0.0500\r\n");
  expect(output).toContain("-1.5e-3,-0.50,2e-2\r\n");
  expect(output).not.toContain("'-1.5e-3");
 });
 it("plots bars only when user selected a real column and preserves legacy two-column output",()=>{
  const table=parseChartCsv(input);
  const plain=scatterChartModel(table,0,1,"","",null);
  expect(plain.points[0].yError).toBeUndefined();
  expect(scatterChartSvg(plain)).not.toContain('data-series="y-uncertainty"');
  expect(scatterChartCsv(plain).split("\r\n")[0]).toBe("Time (s),Voltage (V)");
  const withBars=scatterChartModel(table,0,1,"","",2);
  const baseline=fitScatterLine(plain.points);
  const enhanced=fitScatterLine(withBars.points);
  expect(enhanced?.slope).toBeCloseTo(baseline!.slope,12);
  expect(enhanced?.intercept).toBeCloseTo(baseline!.intercept,12);
  expect(enhanced?.rSquared).toBeCloseTo(baseline!.rSquared!,12);
  const residuals=analyzeFitResiduals(withBars.points,enhanced!);
  const residualChart=residualScatterChart(withBars,residuals);
  expect(scatterChartSvg(residualChart,null,true)).not.toContain('data-series="y-uncertainty"');
  expect(scatterChartSvg(residualChart,null,true)).toContain('data-series="residual-zero"');
 });
 it("rejects invalid uncertainty columns, negative or missing values and strings",()=>{
  const t=parseChartCsv(input);
  for(const column of [-1,0,1,3,1.5]){
   expect(()=>scatterChartModel(t,0,1,"","",column)).toThrow(/uncertainty column/);
  }
  for(const bad of ["-0.2","NaN","Infinity","=SUM(1)","","1e999","1000000000001"]){
   expect(()=>scatterChartModel(parseChartCsv("X,Y,Error\n1,2,"+bad),0,1,"","",2)).toThrow(/row 2/i);
  }
  expect(()=>scatterChartModel(parseChartCsv("X,Y,Error\n,,0.2\n1,2,0.3"),0,1,"","",2)).toThrow(/row 2/);
  const zero=scatterChartModel(parseChartCsv("X,Y,Error\n1,2,0\n2,3,0.00"),0,1,"","",2);
  expect(zero.points.map(p=>p.yError)).toEqual([0,0]);
 });
 it("escapes formula-looking uncertainty header while keeping verified scientific measurements intact",()=>{
  const d=scatterChartModel(parseChartCsv("X,Y,=DANGEROUS\n-1.5e-3,2.00,0.0500"),0,1,"","",2);
  expect(scatterChartCsv(d)).toBe("X,Y,'=DANGEROUS\r\n-1.5e-3,2.00,0.0500\r\n");
  expect(scatterChartSvg(d)).toContain('data-series="y-uncertainty"');
 });
});
