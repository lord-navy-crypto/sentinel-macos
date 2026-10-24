import {describe,it,expect} from "vitest";
import {sentinelCsv,sentinelTable} from "./sentinelPresentation";
import {csvRows} from "../components/EverydayTools";
import {makeDataTable,filterSortTable} from "./tableTools";
import {scrubDiagnosticText} from "./logPrivacy";

describe("Sentinel handoff to existing Universal Box tools",()=>{
 it("round-trips the original Sentinel record table through the real CSV workbench",()=>{
  const native={processes:[{pid:123,command:"/bin/sh",note:"a,b"},{pid:456,command:"/usr/bin/app",note:'a"b'}]};
  const table=sentinelTable(native)!;
  const csv=sentinelCsv(table);
  const imported=makeDataTable(csvRows(csv),true);
  expect(imported.headers).toEqual(["pid","command","note"]);
  expect(imported.rows).toEqual([["123","/bin/sh","a,b"],["456","/usr/bin/app",'a"b']]);
  expect(filterSortTable(imported,"sh").rows).toHaveLength(1);
 });
 it("keeps spreadsheet formulas inert on the handoff boundary",()=>{
  const table=sentinelTable({events:[{text:"=HYPERLINK(\"https://example.test\")"}]})!;
  const imported=makeDataTable(csvRows(sentinelCsv(table)),true);
  expect(imported.rows[0][0]).toMatch(/^'/);
 });
 it("can hand a Sentinel response to the privacy tool with source data unchanged",()=>{
  const native={header:"X-Sentinel-Token: 123456",message:"user@example.org"};
  const before=JSON.stringify(native);
  const cleaned=scrubDiagnosticText(before);
  expect(cleaned.text).not.toContain("user@example.org");
  expect(cleaned.text).not.toContain("123456");
  expect(JSON.stringify(native)).toBe(before);
 });
});
