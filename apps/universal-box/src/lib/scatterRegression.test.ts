import {describe,expect,it} from "vitest";
import {parseChartCsv,scatterChartModel,scatterChartSvg} from "./chartViz";
import {fitScatterLine,formatRegressionNumber} from "./scatterRegression";

const points=(csv:string)=>scatterChartModel(parseChartCsv(csv),0,1,"Lab","V").points;

describe("Scientific XY least-squares fit",()=>{
 it("derives slope, intercept and R² from actual observations and draws a real SVG line",()=>{
  const set=points("X,Y\n0,1\n1,3\n2,5\n3,7");
  const fit=fitScatterLine(set);
  expect(fit).not.toBeNull();
  expect(fit!.slope).toBeCloseTo(2,12);
  expect(fit!.intercept).toBeCloseTo(1,12);
  expect(fit!.rSquared).toBeCloseTo(1,12);
  expect(fit!.observations).toBe(4);
  const model=scatterChartModel(parseChartCsv("X,Y\n0,1\n1,3\n2,5\n3,7"),0,1,"Lab","V");
  const withFit=scatterChartSvg(model,fit);
  expect(withFit).toContain('data-series="least-squares"');
  expect(withFit).toContain('clip-path="url(#scatter-plot-clip)"');
  expect((withFit.match(/<circle /g)||[])).toHaveLength(4);
  expect(scatterChartSvg(model)).not.toContain('data-series="least-squares"');
 });
 it("does not generate a fictitious fit for only one point or constant X",()=>{
  expect(fitScatterLine(points("X,Y\n1,2"))).toBeNull();
  expect(fitScatterLine(points("X,Y\n1,2\n1,3"))).toBeNull();
 });
 it("reports undefined R² for constant Y, even when a flat line exists",()=>{
  const fit=fitScatterLine(points("X,Y\n1,5\n2,5\n3,5"));
  expect(fit?.slope).toBe(0);
  expect(fit?.intercept).toBe(5);
  expect(fit?.rSquared).toBeNull();
 });
 it("calculates non-perfect R² without fabricating exact correlation",()=>{
  const fit=fitScatterLine(points("X,Y\n1,2\n2,2\n3,4\n4,5"));
  expect(fit?.rSquared).toBeGreaterThan(0);
  expect(fit?.rSquared).toBeLessThan(1);
  expect(fit?.observations).toBe(4);
 });
 it("handles duplicate X measurements and small scientific values",()=>{
  const fit=fitScatterLine(points("Time,Voltage\n0.0000123000,1.2300\n0.0000123000,1.3300\n0.0000124,1.5100"));
  expect(fit?.observations).toBe(3);
  expect(Number.isFinite(fit?.slope)).toBe(true);
  expect(Number.isFinite(fit?.intercept)).toBe(true);
  expect(formatRegressionNumber(1.234567890123)).toBe("1.23456789");
 });
});
