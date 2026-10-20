import {describe,expect,it} from "vitest";
import {convertTemperature,convertUnits,UNIT_GROUPS,PHYSICAL_CONSTANTS} from "./unitCatalog";
describe("ported web units and constants",()=>{
 it("includes all original eight unit categories and 14 constants",()=>{
   expect(Object.keys(UNIT_GROUPS)).toHaveLength(8);
   expect(PHYSICAL_CONSTANTS).toHaveLength(14);
 });
 it("converts uncommon scientific units accurately",()=>{
   expect(convertUnits("Length",1,"Å","m")).toBeCloseTo(1e-10,18);
   expect(convertUnits("Charge",1,"μC","C")).toBeCloseTo(1e-6);
   expect(convertUnits("Force",1,"kN","N")).toBeCloseTo(1000);
   expect(convertUnits("Energy",1,"Wh","J")).toBeCloseTo(3600);
   expect(convertUnits("Speed",1,"kn","m/s")).toBeCloseTo(.514444);
   expect(convertUnits("Energy",1,"eV","J")).toBeCloseTo(1.602176634e-19,26);
 });
 it("handles temperature scales and rejects below absolute zero",()=>{
   expect(convertTemperature(0,"C","F")).toBeCloseTo(32);
   expect(convertTemperature(32,"F","K")).toBeCloseTo(273.15);
   expect(convertTemperature(273.15,"K","C")).toBeCloseTo(0);
   expect(()=>convertTemperature(-274,"C","K")).toThrow(/absolute zero/);
 });
 it("rejects unsupported units rather than returning NaN",()=>{
   expect(()=>convertUnits("Mass",10,"m","kg")).toThrow(/Invalid unit/);
 });
});