import { describe,it,expect } from "vitest";
import { combineVectors, significantFigures, roundSignificant } from "./mathExtras";

describe("desktop math conveniences",()=>{
 it("computes orthogonal vector addition and subtraction",()=>{
   const added=combineVectors({magnitude:3,angle:0},{magnitude:4,angle:90});
   expect(added.magnitude).toBeCloseTo(5);
   expect(added.angle).toBeCloseTo(53.130102);
   const sub=combineVectors({magnitude:3,angle:0},{magnitude:4,angle:90},true);
   expect(sub.magnitude).toBeCloseTo(5);
   expect(sub.y).toBeCloseTo(-4);
 });
 it("counts clearly indicated significant figures",()=>{
   expect(significantFigures("0.00450")).toBe(3);
   expect(significantFigures("1.200e3")).toBe(4);
   expect(significantFigures("1500.")).toBe(4);
   expect(significantFigures("1500")).toBe(2);
   expect(significantFigures("abc")).toBeNull();
 });
 it("rounds multiplication results to selected significant figures",()=>{
   expect(roundSignificant(12.34*2.1,2)).toBe("26");
 });
});
