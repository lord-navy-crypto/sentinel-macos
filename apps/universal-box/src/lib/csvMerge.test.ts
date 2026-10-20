import {describe,it,expect} from "vitest";
import {mergeCsvSources,mergedCsvExport} from "./csvMerge";
describe("CSV multi-source union",()=>{
 it("aligns differently ordered columns and records provenance",()=>{
  const r=mergeCsvSources([{name:"a.csv",rows:[["name","age"],["Ada","23"]]},{name:"b.csv",rows:[["age","city"],["24","Tokyo"]]}]);
  expect(r.headers).toEqual(["source_file","name","age","city"]);
  expect(r.rows).toEqual([["a.csv","Ada","23",""],["b.csv","","24","Tokyo"]]);
 });
 it("rejects duplicate headers and malformed rows",()=>{
  expect(()=>mergeCsvSources([{name:"a",rows:[["x","x"],["1","2"]]},{name:"b",rows:[["z"],["3"]]}])).toThrow();
  expect(()=>mergeCsvSources([{name:"a",rows:[["x"],["1","2"]]},{name:"b",rows:[["z"],["3"]]}])).toThrow();
 });
 it("escapes CSV quotes and protects formula-like cells",()=>{
  const r=mergeCsvSources([{name:"=bad.csv",rows:[["v"],['=SUM(1,2)']]},{name:"b.csv",rows:[["v"],['a"b']]}]);
  const text=mergedCsvExport(r);
  expect(text).toContain('"\'=SUM(1,2)"');
  expect(text).toContain('"a""b"');
  expect(text).toContain('"\'=bad.csv"');
 });
});
