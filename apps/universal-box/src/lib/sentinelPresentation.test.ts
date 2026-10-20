import {describe,it,expect} from "vitest";
import {sentinelTable,sentinelCsv,filteredSentinelRows,sentinelDiff,sentinelSummary} from "./sentinelPresentation";
describe("Sentinel evidence presentation",()=>{
 it("extracts actual nested record arrays and preserves raw data",()=>{
  const source={marker:"engine",nested:{items:[{pid:2,cpu:3,name:"alpha"},{pid:1,cpu:10,name:"beta"}]}};
  const before=JSON.stringify(source);
  const table=sentinelTable(source)!;
  expect(table.path).toBe("result.nested.items");
  expect(table.columns).toEqual(["pid","cpu","name"]);
  expect(table.rows).toHaveLength(2);
  expect(JSON.stringify(source)).toBe(before);
 });
 it("filters and numerically sorts without modifying source",()=>{
  const t=sentinelTable({items:[{pid:11,name:"BB"},{pid:2,name:"aa"}]})!;
  const out=filteredSentinelRows(t,"", "pid");
  expect(out.map(x=>x[0])).toEqual(["2","11"]);
  expect(filteredSentinelRows(t,"aa")).toHaveLength(1);
  expect(t.rows[0][0]).toBe("11");
 });
 it("protects CSV formulas and escapes quoted values",()=>{
  const t=sentinelTable({items:[{name:"=SUM(2,3)",note:'one"two'}, {name:"-1",note:"@formula"}]})!;
  const csv=sentinelCsv(t);
  expect(csv).toContain('"\'=SUM(2,3)"');
  expect(csv).toContain('"one""two"');
  expect(csv).toContain('"\'-1"');
  expect(csv).toContain('"\'@formula"');
 });
 it("shows bounded before/after changes",()=>{
  const changes=sentinelDiff({stats:{count:2},rows:[{pid:1}]},{stats:{count:3},rows:[{pid:1},{pid:2}]});
  expect(changes.some(x=>x.field==="result.stats.count"&&x.after==="3")).toBe(true);
  expect(changes.some(x=>x.field==="result.rows"&&x.after==="2 items")).toBe(true);
 });
 it("caps tabular rows and handles unstructured responses",()=>{
  const t=sentinelTable({items:Array.from({length:500},(_,i)=>({n:i}))})!;
  expect(t.total).toBe(500);
  expect(t.rows).toHaveLength(400);
  expect(sentinelTable({message:"no rows"})).toBeNull();
  expect(sentinelSummary({status:"ok",events:[1,2],metadata:{a:1}}).map(x=>x.name)).toEqual(["status","events"]);
 });
});
