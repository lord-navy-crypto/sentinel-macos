import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {inspectOfficePdfMerge,mergeOfficePdfs} from "./officePdfMerge";
async function sample(name:string,pages:number){
 const pdf=await PDFDocument.create();
 for(let i=0;i<pages;i++)pdf.addPage([400+i,550+i]);
 const bytes=new Uint8Array(await pdf.save());
 return {name,size:bytes.length,arrayBuffer:async()=>new Uint8Array(bytes).buffer};
}
describe("Office PDF merge preflight and actual output",()=>{
 it("verifies all sources and merged pages in selected order",async()=>{
  const files=[await sample("合同.pdf",2),await sample("invoice.pdf",3)];
  const plan=await inspectOfficePdfMerge(files);
  expect(plan.files.map(x=>x.pages)).toEqual([2,3]);
  expect(plan.totalPages).toBe(5);
  expect(plan.sourceBytes).toBe(files[0].size+files[1].size);
  const merged=await mergeOfficePdfs(files);
  expect(merged.pages).toBe(5);
  expect(merged.bytes[0]).toBe(37); // genuine %PDF header
  const doc=await PDFDocument.load(merged.bytes);
  expect(doc.getPageCount()).toBe(5);
  expect(doc.getPage(0).getWidth()).toBe(400);
  expect(doc.getPage(2).getWidth()).toBe(400);
 });
 it("rejects a corrupt or mislabeled second PDF before any merge save",async()=>{
  const good=await sample("good.pdf",1);
  const bad={name:"wrong.pdf",size:8,arrayBuffer:async()=>new TextEncoder().encode("not PDF!").buffer};
  await expect(inspectOfficePdfMerge([good,bad])).rejects.toThrow(/Cannot read wrong.pdf/);
  await expect(inspectOfficePdfMerge([{...good,name:"wrong.txt"}])).rejects.toThrow(/real PDF/);
 });
 it("enforces count, total sizes and safety caps",async()=>{
  const one=await sample("one.pdf",1);
  await expect(inspectOfficePdfMerge([])).rejects.toThrow(/1–20/);
  await expect(inspectOfficePdfMerge(Array.from({length:21},()=>one))).rejects.toThrow(/1–20/);
  await expect(inspectOfficePdfMerge([{...one,size:8_000_001}])).rejects.toThrow(/8 MB/);
  await expect(inspectOfficePdfMerge([{...one,size:18_000_001}])).rejects.toThrow(/8 MB/);
 });
});
