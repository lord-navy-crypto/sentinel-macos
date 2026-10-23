import {describe,expect,it} from "vitest";
import {parseChartCsv,scatterChartModel,scatterChartSvg} from "./chartViz";
import {fitScatterLine} from "./scatterRegression";
import {analyzeFitResiduals,residualAnalysisCsv,residualScatterChart} from "./scatterResiduals";

function analyze(source:string){
 const chart=scatterChartModel(parseChartCsv(source),0,1,"Physics lab","V");
 const fit=fitScatterLine(chart.points);
 if(!fit)throw Error("Expected fit for test measurements");
 return {chart,fit,summary:analyzeFitResiduals(chart.points,fit)};
}
describe("Scientific residual diagnostics and safe data export",()=>{
 it("shows zero residuals and a real zero baseline for a perfect straight line",()=>{
  const {chart,summary}=analyze("Time (s),Voltage (V)\n0,1\n1,3\n2,5\n3,7");
  expect(summary.records).toHaveLength(4);
  expect(summary.rmse).toBeCloseTo(0,12);
  expect(summary.sse).toBeCloseTo(0,12);
  summary.records.forEach(p=>expect(p.residual).toBeCloseTo(0,12));
  const residualChart=residualScatterChart(chart,summary);
  const svg=scatterChartSvg(residualChart,null,true);
  expect(svg).toContain('data-series="residual-zero"');
  expect((svg.match(/<circle /g)||[])).toHaveLength(4);
  expect(svg).toContain("Residual (observed − predicted)");
  expect(svg).not.toContain("<script>");
 });
 it("measures real nonzero residuals and retains original precision strings",()=>{
  const {chart,summary}=analyze("Time (s),V\n-1.5e-3,1.2300\n0,1.5600\n0,1.6500\n2e-3,2.0300");
  expect(summary.records).toHaveLength(4);
  expect(summary.rmse).toBeGreaterThan(0);
  expect(summary.sse).toBeGreaterThan(0);
  expect(summary.maxAbsoluteResidual).toBeGreaterThan(0);
  expect(summary.meanResidual).toBeCloseTo(0,9);
  expect(summary.records[0].observedX).toBe("-1.5e-3");
  expect(summary.records[0].observedY).toBe("1.2300");
  const csv=residualAnalysisCsv(chart,summary);
  expect(csv).toContain("-1.5e-3,1.2300,");
  expect(csv).not.toContain("'-1.5e-3");
  expect(csv.split("\r\n")[0]).toBe("Time (s),V,Predicted Y,Residual (observed - predicted)");
  const dataRows=csv.trim().split("\r\n").slice(1);
  expect(dataRows).toHaveLength(4);
  for(let i=0;i<dataRows.length;i++){
   const cells=dataRows[i].split(",");
   expect(cells).toHaveLength(4);
   expect(Number(cells[2])).toBeCloseTo(summary.records[i].predicted,10);
   expect(Number(cells[3])).toBeCloseTo(summary.records[i].residual,10);
  }
 });
 it("sanitizes formula-looking CSV headers but never interprets original numeric fields",()=>{
  const {chart,summary}=analyze("=HYPERLINK(1),Y\n-1.5e-3,2.00\n2,3.25");
  const csv=residualAnalysisCsv(chart,summary);
  expect(csv.split("\r\n")[0]).toBe("'=HYPERLINK(1),Y,Predicted Y,Residual (observed - predicted)");
  expect(csv).toContain("-1.5e-3,2.00,");
 });
 it("rejects stale/mismatched fit results instead of mislabelling output",()=>{
  const a=analyze("X,Y\n1,2\n2,3\n3,5");
  const b=scatterChartModel(parseChartCsv("X,Y\n1,2\n2,3"),0,1,"","");
  expect(()=>analyzeFitResiduals(b.points,a.fit)).toThrow(/does not match/);
  expect(()=>residualAnalysisCsv(b,a.summary)).toThrow(/does not match/);
  expect(()=>residualScatterChart(b,a.summary)).toThrow(/does not match/);
  const sameLengthEdited=scatterChartModel(parseChartCsv("X,Y\n1,2\n2,3\n3,6"),0,1,"","");
  expect(()=>residualAnalysisCsv(sameLengthEdited,a.summary)).toThrow(/does not match/);
  expect(()=>residualScatterChart(sameLengthEdited,a.summary)).toThrow(/does not match/);
 });
 it("does not produce calculations for invalid values or unsupported floating-point ranges",()=>{
  const fit=fitScatterLine(scatterChartModel(parseChartCsv("X,Y\n1,2\n2,3"),0,1,"","").points)!;
  const huge=[{x:1e308,y:1,xText:"1e308",yText:"1"},{x:-1e308,y:2,xText:"-1e308",yText:"2"}];
  expect(()=>analyzeFitResiduals(huge,fit)).toThrow(/range/);
 });
});
