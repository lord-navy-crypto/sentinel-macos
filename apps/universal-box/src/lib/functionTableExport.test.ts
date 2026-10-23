import {describe,expect,it} from "vitest";
import {functionTable} from "./functionTableExport";
describe("safe numerical function table with CSV",()=>{
 it("keeps meaningful numeric strings and exports a correctly formed data file",()=>{
  const table=functionTable("x^2",-2,1,5);
  expect(table.rows.map(row=>row.y)).toEqual([4,1,0,1,4]);
  expect(table.csv).toBe("x,f(x)\r\n-2,4\r\n-1,1\r\n0,0\r\n1,1\r\n2,4\r\n");
  expect(table.display).toContain("-2\t4");
 });
 it("marks singular or non-real values empty without fabricating numbers",()=>{
  const t=functionTable("1/x",-1,1,3);
  expect(t.rows[1].y).toBe(null);
  expect(t.csv).toContain("0,\r\n");
  expect(t.display).toContain("0\tundefined");
 });
 it("never writes raw formula expressions as CSV cells",()=>{
  const t=functionTable("sin(x)",0,1,3);
  expect(t.csv).not.toContain("sin(x)");
  expect(t.csv).toMatch(/^x,f\(x\)\r\n/u);
 });
 it("rejects malformed bounds and oversized requests",()=>{
  expect(()=>functionTable("",0,1,5)).toThrow(/Enter/);
  expect(()=>functionTable("x",0,0,5)).toThrow(/nonzero/);
  expect(()=>functionTable("x",0,1,51)).toThrow(/Rows/);
  expect(()=>functionTable("x",Infinity,1,5)).toThrow(/finite/);
 });
});
