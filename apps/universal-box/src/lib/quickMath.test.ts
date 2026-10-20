import {describe,it,expect} from "vitest";
import {baseConvert,quadraticRoots,descriptiveStats,twoByTwo} from "./quickMath";
describe("offline ClassWiz-style utilities",()=>{
  it("converts large integers exactly",()=>{
    expect(baseConvert("FF",16,10)).toBe("255");
    expect(baseConvert("255",10,2)).toBe("11111111");
    expect(()=>baseConvert("FF",10,16)).toThrow(/Digit/);
  });
  it("solves simple quadratics and complex roots",()=>{
    expect(quadraticRoots(1,-3,2).map(Number).sort()).toEqual([1,2]);
    expect(quadraticRoots(1,0,1)[0]).toContain("i");
  });
  it("reports summary statistics",()=>{
    const s=descriptiveStats([1,2,3,4]);
    expect(s.mean).toBe(2.5);
    expect(s.median).toBe(2.5);
    expect(s.sampleSd).toBeCloseTo(Math.sqrt(5/3));
  });
  it("solves two simultaneous equations",()=>{
    const s=twoByTwo(2,1,1,-1,5,1);
    expect(s.x).toBe(2);
    expect(s.y).toBe(1);
    expect(()=>twoByTwo(1,2,2,4,3,6)).toThrow(/Singular/);
  });
});
