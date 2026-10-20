import {describe,it,expect} from "vitest";
import {diagnosticExport,summarizeDiagnostics,type DiagnosticCheck} from "./desktopDiagnostics";
describe("desktop capability report",()=>{
 const checks:DiagnosticCheck[]=[
  {id:"shell",title:"Shell",level:"ok",detail:"Tauri present"},
  {id:"clipboard",title:"Clipboard",level:"info",detail:"Permission not verified"},
  {id:"storage",title:"Storage",level:"attention",detail:"Not writable"}
 ];
 it("counts checks by actionable result",()=>expect(summarizeDiagnostics(checks)).toEqual({ok:1,attention:1,info:1}));
 it("exports minimal versioned report without profile data",()=>{
  const s=diagnosticExport(checks);
  const r=JSON.parse(s) as {product:string;version:string;checks:DiagnosticCheck[]};
  expect(r.version).toBe("0.31.0");
  expect(r.product).toBe("Universal Box");
  expect(r.checks).toEqual(checks);
  expect(s).not.toMatch(/(username|hostname|serialNumber|filePath)/i);
 });
});
