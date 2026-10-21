import {describe,it,expect} from "vitest";
import {inspectNdjson,ndjsonToCsv,ndjsonToJson} from "./ndjsonAudit";
import {auditMarkdownLocalLinks,markdownAuditCsv} from "./markdownLinksAudit";
import {profileCsv,profileCsvReportCsv} from "./csvProfileAudit";

describe("NDJSON read-only validator and safe converter",()=>{
 it("recognizes Unicode, discovers fields, tracks missing fields, and quotes formulas in CSV",()=>{
  const r=inspectNdjson('{"name":"物理","score":95}\r\n{"name":"化学","formula":"=2+3"}\r\n');
  expect(r.validRecords).toBe(2);expect(r.invalidRecords).toBe(0);
  expect(r.fields).toContain("formula");
  expect(r.missing.find(x=>x.field==="score")?.count).toBe(1);
  expect(ndjsonToJson(r)).toContain("物理");
  expect(ndjsonToCsv(r)).toContain("'=2+3");
 });
 it("does not silently export a partial successful dataset if any line is invalid",()=>{
  const r=inspectNdjson('{"id":1}\nnot-json\n{"id":2}\n[1,2]');
  expect(r.validRecords).toBe(2);expect(r.invalidRecords).toBe(2);
  expect(r.issues.map(x=>x.line)).toEqual([2,4]);
  expect(()=>ndjsonToCsv(r)).toThrow(/Fix all/);
  expect(()=>ndjsonToJson(r)).toThrow(/Fix all/);
 });
 it("rejects unsafe keys and enormous inputs",()=>{
  const r=inspectNdjson('{"__proto__":1}');
  expect(r.invalidRecords).toBe(1);
  expect(()=>inspectNdjson(" ".repeat(500001))).toThrow();
 });
});
describe("Offline Markdown link audits",()=>{
 const files=[
  {path:"site/docs/start.md",markdown:"# Links\n[real](../images/a.png)\n[broken](lost.md)\n[site](https://example.com)\n[internal](#hello)\n[reference][ref]\n[ref]: ../images/a.png\n```md\n[fake](bad.md)\n```"},
  {path:"site/images/a.png"},
  {path:"site/docs/second.md",markdown:"# Another document"},
 ];
 it("identifies real, broken, external and anchor targets without network",()=>{
  const r=auditMarkdownLocalLinks(files);
  expect(r.markdownFiles).toBe(2);
  expect(r.broken).toBe(1);expect(r.unsafe).toBe(0);
  expect(r.references.filter(x=>x.status==="ok").length).toBe(2);
  expect(r.references.filter(x=>x.status==="external").length).toBe(1);
  expect(r.references.some(x=>x.target==="bad.md")).toBe(false);
  expect(markdownAuditCsv(r)).toContain("lost.md");
 });
 it("never allows relative path escape beyond selected root",()=>{
  const r=auditMarkdownLocalLinks([{path:"a.md",markdown:"[bad](../../../../etc/passwd)"}]);
  expect(r.unsafe).toBe(1);
 });
});
describe("Strict CSV column completeness and types",()=>{
 it("reports column missingness, uniqueness and exact numeric extrema",()=>{
  const report=profileCsv("id,name,score,day\n001,Physics,90,2026-10-20\n002,Chemistry,100,2026-10-21\n003,Biology,,2026-10-22\n");
  expect(report.rows).toBe(3);
  expect(report.columns.find(x=>x.name==="id")?.type).toBe("text");
  expect(report.columns.find(x=>x.name==="score")).toMatchObject({type:"number",missing:1,min:90,max:100,mean:95});
  expect(report.columns.find(x=>x.name==="day")?.type).toBe("date");
  expect(profileCsvReportCsv(report)).toContain("score");
 });
 it("refuses malformed rows instead of inventing column positions",()=>{
  expect(()=>profileCsv("a,b\n1\n2,3")).toThrow(/inconsistent/);
  expect(()=>profileCsv("a,a\n1,2")).toThrow(/unique/);
  expect(()=>profileCsv('a,b\n"unclosed,2')).toThrow(/unclosed/);
 });
 it("classifies mixed values as mixed, not quietly numeric",()=>{
  expect(profileCsv("x\n1\nabc\n2").columns[0].type).toBe("mixed");
 });
});
