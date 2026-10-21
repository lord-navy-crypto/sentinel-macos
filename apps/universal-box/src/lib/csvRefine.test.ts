import {describe,expect,it} from "vitest";
import {cleanWorkspaceCsv,DEFAULT_CSV_CLEANUP,DEFAULT_CSV_REFINE} from "./csvCleanroom";

describe("Free offline CSV filter and sort",()=>{
 const input='Name,Score,Note\nZoe,10,Keep\nAda,2,=1+1\nAda,11,=1+1\nAda,2,=1+1\nBob,7,Keep\n';
 it("searches data rows without dropping the header; sorts numerical-looking cells naturally",()=>{
  const result=cleanWorkspaceCsv(input,DEFAULT_CSV_CLEANUP,{query:"ADA",sortColumn:1,descending:false});
  expect(result.keptRows).toBe(2);
  expect(result.filteredRows).toBe(2);
  expect(result.removedRows).toBe(3);
  expect(result.csv).toBe('"Name","Score","Note"\r\n"Ada","2","\'=1+1"\r\n"Ada","11","\'=1+1"\r\n');
  expect(input).toContain("Zoe,10,Keep");
 });
 it("handles descending order, maintains stable tie order, and keeps default behavior",()=>{
  const input='Name,Score\nAda,2\nBob,2\nZoe,10';
  const out=cleanWorkspaceCsv(input,{...DEFAULT_CSV_CLEANUP,removeDuplicateRows:false},{query:"",sortColumn:1,descending:true});
  expect(out.csv).toBe('"Name","Score"\r\n"Zoe","10"\r\n"Ada","2"\r\n"Bob","2"\r\n');
  const normal=cleanWorkspaceCsv(input,DEFAULT_CSV_CLEANUP);
  const explicit=cleanWorkspaceCsv(input,DEFAULT_CSV_CLEANUP,DEFAULT_CSV_REFINE);
  expect(normal).toEqual(explicit);
 });
 it("rejects invalid column selections and excessive filter terms",()=>{
  expect(()=>cleanWorkspaceCsv("A,B\n1,2",DEFAULT_CSV_CLEANUP,{query:"",sortColumn:2,descending:false})).toThrow(/sort column/);
  expect(()=>cleanWorkspaceCsv("A,B\n1,2",DEFAULT_CSV_CLEANUP,{query:"x".repeat(121),sortColumn:null,descending:false})).toThrow(/120/);
  expect(()=>cleanWorkspaceCsv("A,B\n1,2",DEFAULT_CSV_CLEANUP,{query:"",sortColumn:-1,descending:false})).toThrow(/sort column/);
 });
 it("does not evaluate formula-looking cells, even after filtering and sorting",()=>{
  const processed=cleanWorkspaceCsv('Name,Value\nAnna,@attack\nAnn,"+SUM(1,2)"\nAnn,-cmd',DEFAULT_CSV_CLEANUP,{query:"Ann",sortColumn:0,descending:false});
  expect(processed.csv).toContain('"\'@attack"');
  expect(processed.csv).toContain('"\'-cmd"');
  expect(processed.csv).toContain('"\' +SUM(1,2)"'.replace("' ","'"));
 });
});