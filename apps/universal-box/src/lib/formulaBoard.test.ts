import {describe,it,expect} from "vitest";
import {FORMULA_BOARD} from "./formulaBoard";
describe("canonical website formula collection",()=>{
 it("keeps the website categories and unique formula identities",()=>{
  const ids=FORMULA_BOARD.map(g=>g.id);
  expect(ids).toEqual(["physics","calc","chem","stats","math"]);
  const items=FORMULA_BOARD.flatMap(x=>x.items);
  expect(items.length).toBeGreaterThanOrEqual(30);
  expect(new Set(items.map(x=>x.id)).size).toBe(items.length);
 });
 it("has LaTeX, plain and display names for all local formulas",()=>{
  for(const row of FORMULA_BOARD.flatMap(g=>g.items)){
   expect(row.name.trim().length).toBeGreaterThan(0);
   expect(row.latex.trim().length).toBeGreaterThan(0);
   expect(row.plain.trim().length).toBeGreaterThan(0);
  }
 });
});
