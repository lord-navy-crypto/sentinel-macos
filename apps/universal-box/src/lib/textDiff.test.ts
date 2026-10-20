import {describe,it,expect} from "vitest";
import {diffLines,diffWords,normalizeForComparison,unifiedDiff} from "./textDiff";
describe("website-compatible text comparison",()=>{
 it("aligns inserted and removed lines rather than positional zip",()=>{
  const result=diffLines("a\nb\nc","a\nnew\nb\nc");
  expect(result.filter(r=>r.type==="add")).toEqual([{type:"add",text:"new"}]);
  expect(result.filter(r=>r.type==="same").map(r=>r.text)).toEqual(["a","b","c"]);
 });
 it("highlights inserted words",()=>{
  const p=diffWords("hi there","hi dear there");
  expect(p.some(x=>x.type==="add"&&x.text==="dear")).toBe(true);
 });
 it("exports familiar unified diff",()=>{
  expect(unifiedDiff(diffLines("a","b"))).toContain("-a");
  expect(unifiedDiff(diffLines("a","b"))).toContain("+b");
 });
 it("supports website case and whitespace switches",()=>{
  expect(normalizeForComparison("A   B",true,true)).toBe("a b");
 });
 it("falls back safely when text exceeds comparison work budget",()=>{
  const a="x\n".repeat(450),b="y\n".repeat(450);
  expect(diffLines(a,b).length).toBeGreaterThan(0);
 });
});