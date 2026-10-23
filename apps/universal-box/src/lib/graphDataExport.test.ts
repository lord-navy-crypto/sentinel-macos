import {describe,expect,it} from "vitest";
import {graphSegmentsToCsv,nearestGraphTrace} from "./graphDataExport";
import {DEFAULT_WINDOW,sampleGraph} from "./graphModel";
describe("Graph trace and spreadsheet-safe point export",()=>{
 it("exports exact finite sampled values and preserves separated segments",()=>{
  const parts=sampleGraph({first:"x"},"cartesian",DEFAULT_WINDOW,0,1,10);
  const csv=graphSegmentsToCsv([parts],"cartesian");
  const rows=csv.trim().split("\r\n");
  expect(rows[0]).toBe("curve,mode,segment,x,y");
  expect(rows).toHaveLength(12);
  expect(rows[1]).toBe("1,cartesian,1,-10.0000000000000,-10.0000000000000");
  expect(csv).not.toContain("=SUM(");
 });
 it("does not connect valid domains across discontinuities in exported rows",()=>{
  const csv=graphSegmentsToCsv([[[{x:-2,y:-.5},{x:-1,y:-1}],[{x:1,y:1},{x:2,y:.5}]]],"cartesian");
  expect(csv).toContain("1,cartesian,2,1.00000000000000,1.00000000000000");
  expect(csv).toContain("1,cartesian,1,-2.00000000000000,-0.500000000000000");
 });
 it("refuses invalid non-finite coordinates and empty outputs",()=>{
  expect(()=>graphSegmentsToCsv([],"cartesian")).toThrow(/No valid/);
  expect(()=>graphSegmentsToCsv([[[{x:NaN,y:1}]]],"cartesian")).toThrow(/non-finite/);
  expect(()=>graphSegmentsToCsv([],"unknown" as never)).toThrow(/Unknown/);
 });
 it("traces actual nearest samples only within a fixed distance in pixels",()=>{
  const win={xMin:-1,xMax:1,yMin:-1,yMax:1};
  const parts=[[[{x:0,y:0},{x:0.5,y:0.5}]]];
  const hit=nearestGraphTrace(parts,win,201,100,400,200);
  expect(hit?.curve).toBe(1);
  expect(hit?.point).toEqual({x:0,y:0});
  expect(nearestGraphTrace(parts,win,360,80,400,200)).toBe(null);
  expect(nearestGraphTrace(parts,win,Infinity,0,400,200)).toBe(null);
 });
});
