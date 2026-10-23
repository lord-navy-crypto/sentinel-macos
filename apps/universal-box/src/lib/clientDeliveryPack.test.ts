import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {parseWorkspaceCsv} from "./csvCleanroom";
import {planClientDelivery,buildClientDelivery,type DeliveryFile,type DeliveryInput} from "./clientDeliveryPack";
const meta:DeliveryInput={
 project:"Website upgrade",recipient:"Northwind Client",reference:"PO-901",deliveryDate:"2026-10-21",
 note:"Files approved for first handover",
};
function fakeFile(name:string,value:string):DeliveryFile{
 const bytes=new TextEncoder().encode(value);
 return {name,size:bytes.byteLength,async arrayBuffer(){return new Uint8Array(bytes).buffer;}};
}
describe("Verified client handoff, true SHA-256 and content-preserving ZIP readback",()=>{
 it("produces a real archive, SHA-256 hashes, readable checklist and CSV inventory",async()=>{
  const files=[fakeFile("report.txt","hello"),fakeFile("contract.txt","Terms and conditions.")];
  const plan=planClientDelivery(meta,files);
  expect(plan.totalBytes).toBe(files.reduce((x,f)=>x+f.size,0));
  const progress:number[]=[];
  const result=await buildClientDelivery(meta,files,(done)=>progress.push(done));
  expect(progress).toEqual([1,2]);
  expect(result.records).toHaveLength(2);
  expect(result.records[0].sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  const zip=await JSZip.loadAsync(result.zip,{checkCRC32:true});
  const paths=["files/001-report.txt","files/002-contract.txt","README-delivery.txt",
   "reports/files.csv","reports/checksums.sha256","reports/manifest.json"];
  for(const p of paths)expect(zip.file(p),p).not.toBeNull();
  expect(await zip.file("files/001-report.txt")!.async("string")).toBe("hello");
  const manifest=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(manifest.verification).toMatch(/SHA-256/);
  expect(manifest.fileCount).toBe(2);
  const readme=await zip.file("README-delivery.txt")!.async("string");
  expect(readme).toContain("Northwind Client");
  expect(readme).toContain("NOT encrypted");
  const sums=await zip.file("reports/checksums.sha256")!.async("string");
  expect(sums).toContain(result.records[0].sha256+" *files/001-report.txt");
  const csv=await zip.file("reports/files.csv")!.async("string");
  expect(parseWorkspaceCsv(csv)[1][0]).toBe("report.txt");
  expect(parseWorkspaceCsv(csv)[1][3]).toBe(result.records[0].sha256);
 });
 it("sanitizes user-supplied file paths and preserves both duplicate filenames",async()=>{
  const inputs=[fakeFile("../financials.txt","one"),fakeFile("../financials.txt","two")];
  const result=await buildClientDelivery(meta,inputs);
  expect(new Set(result.records.map(x=>x.path)).size).toBe(2);
  expect(result.records.every(x=>!x.path.includes("../")&&!x.path.includes("\\"))).toBe(true);
  const zip=await JSZip.loadAsync(result.zip,{checkCRC32:true});
  for(const r of result.records)expect(zip.file(r.path)).not.toBeNull();
 });
 it("escapes formula-like client names in Excel inventory, without changing source filenames",async()=>{
  const result=await buildClientDelivery(meta,[fakeFile("=2+3.csv","a,b,c")]);
  const zip=await JSZip.loadAsync(result.zip);
  const csv=await zip.file("reports/files.csv")!.async("string");
  expect(csv).toContain("\"'=2+3.csv\"");
  expect(result.records[0].source).toBe("=2+3.csv");
 });
 it("rejects impossible dates, source-file count excess and input size limits",()=>{
  expect(()=>planClientDelivery({...meta,deliveryDate:"2026-02-30"},[fakeFile("a.txt","hi")]))
   .toThrow(/real calendar/);
  expect(()=>planClientDelivery({...meta,recipient:""},[fakeFile("a.txt","hi")]))
   .toThrow(/Recipient/);
  expect(()=>planClientDelivery(meta,[])).toThrow(/1–50/);
  expect(()=>planClientDelivery(meta,[{name:"big.bin",size:16_000_001}]))
   .toThrow(/16 MB/);
 });
 it("rejects source mutation during packaging, rather than producing an inaccurate checksum",async()=>{
  const changed:DeliveryFile={name:"changed.txt",size:100,
   async arrayBuffer(){return new TextEncoder().encode("short").buffer;}};
  await expect(buildClientDelivery(meta,[changed])).rejects.toThrow(/changed while packaging/);
 });
});
