import {describe,expect,it} from "vitest";
import {parsePrintItems,renderPrintSheet} from "./printSheet";
import {auditJsonToTypescript} from "./jsonTypeStudio";
describe("real offline printable layouts",()=>{
 const base={title:"Learning & Science",items:"Research\nBuild <prototype>\nReview",
  template:"cards" as const,theme:"blue" as const,footer:"Free & local"};
 it("emits true A4 physical size, design cells and escaped user text",()=>{
  const result=renderPrintSheet(base);
  expect(result).toContain('width="210mm" height="297mm"');
  expect(result).toContain('viewBox="0 0 1240 1754"');
  expect(result).toContain("Learning &amp; Science");
  expect(result).toContain("Build &lt;prototype&gt;");
  expect(result).not.toContain("<prototype>");
  expect((result.match(/<rect x="/g)||[])).toHaveLength(8);
  expect(parsePrintItems(base)).toHaveLength(3);
 });
 it("supports distinct label and ticket layouts with fixed printable limits",()=>{
  const label=renderPrintSheet({...base,template:"labels",items:"Box A\nBox B"});
  const tickets=renderPrintSheet({...base,template:"tickets",items:"Visitor A\nVisitor B"});
  expect((label.match(/<rect x="/g)||[])).toHaveLength(24);
  expect((tickets.match(/<rect x="/g)||[])).toHaveLength(10);
  expect(()=>parsePrintItems({...base,template:"cards",items:Array(9).fill("card").join("\n")})).toThrow(/1–8/);
  expect(()=>parsePrintItems({...base,title:""})).toThrow(/Title/);
  expect(()=>parsePrintItems({...base,items:"X".repeat(91)})).toThrow(/90/);
  expect(()=>renderPrintSheet({...base,theme:"wrong" as "blue"})).toThrow(/palette/);
 });
});
describe("real offline JSON to TypeScript inference",()=>{
 it("handles arrays of partial objects, Unicode names, primitives and null",()=>{
  const input='{"users":[{"name":"Ada","role":"dev"},{"name":"Lin","active":true}],"说明":null,"ok":true,"count":2,"empty":[]}';
  const r=auditJsonToTypescript(input);
  expect(r.typeScript).toContain("export type Root = {");
  expect(r.typeScript).toContain("name: string;");
  expect(r.typeScript).toContain("role?: string;");
  expect(r.typeScript).toContain("active?: boolean;");
  expect(r.typeScript).toContain('"说明": null;');
  expect(r.typeScript).toContain("unknown[]");
  expect(r.paths).toContain("$.users[0].name\tstring");
  expect(r.arrayCount).toBe(2);
  expect(r.objectCount).toBeGreaterThan(1);
 });
 it("does not execute code, accepts strange keys as quoted names",()=>{
  const r=auditJsonToTypescript('{"foo-bar":"x","__proto__":"safe","<script>":1}');
  expect(r.typeScript).toContain('"foo-bar": string;');
  expect(r.typeScript).toContain('"__proto__": string;');
  expect(r.typeScript).toContain('"<script>": number;');
 });
 it("rejects invalid input and nesting/resource attacks",()=>{
  expect(()=>auditJsonToTypescript('{"bad":}')).toThrow(/Invalid JSON/);
  expect(()=>auditJsonToTypescript("")).toThrow(/150,000/);
  expect(()=>auditJsonToTypescript(JSON.stringify({rows:Array(501).fill(0)}))).toThrow(/500/);
  let deep="0";for(let i=0;i<15;i++)deep='{"x":'+deep+"}";
  expect(()=>auditJsonToTypescript(deep)).toThrow(/nesting/);
 });
});