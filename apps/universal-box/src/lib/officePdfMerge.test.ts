import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {inspectOfficePdfMerge,mergeOfficePdfs,movePdfMergeSource} from "./officePdfMerge";
async function sample(name:string,pages:number,base=400){
 const pdf=await PDFDocument.create();
 for(let i=0;i<pages;i++)pdf.addPage([base+i,550+i]);
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
 it("reorders source files by explicit adjacent moves without mutating the original selection",async()=>{
  const a=await sample("first.pdf",2,400),b=await sample("second.pdf",1,650);
  const c=await sample("third.pdf",1,900),original=[a,b,c];
  const moved=movePdfMergeSource(original,0,1);
  expect(moved.map(x=>x.name)).toEqual(["second.pdf","first.pdf","third.pdf"]);
  expect(original.map(x=>x.name)).toEqual(["first.pdf","second.pdf","third.pdf"]);
  const again=movePdfMergeSource(moved,2,-1);
  expect(again.map(x=>x.name)).toEqual(["second.pdf","third.pdf","first.pdf"]);
  const plan=await inspectOfficePdfMerge(again);
  expect(plan.files.map(x=>x.name)).toEqual(["second.pdf","third.pdf","first.pdf"]);
  const merged=await mergeOfficePdfs(again);
  const readback=await PDFDocument.load(merged.bytes);
  expect(readback.getPageCount()).toBe(4);
  expect(readback.getPages().map(x=>x.getWidth())).toEqual([650,900,400,401]);
  expect(merged.sourceBytes).toBe(a.size+b.size+c.size);
 });
 it("keeps edge movements no-op and rejects invalid indices without changing sources",()=>{
  const items=["A","B","C"] as const;
  expect(movePdfMergeSource(items,0,-1)).toEqual(["A","B","C"]);
  expect(movePdfMergeSource(items,2,1)).toEqual(["A","B","C"]);
  expect(()=>movePdfMergeSource(items,3,1)).toThrow(/Invalid PDF/);
  expect(()=>movePdfMergeSource(items,-1,-1)).toThrow(/Invalid PDF/);
  expect(()=>movePdfMergeSource(items,0,0 as 1)).toThrow(/Invalid PDF/);
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
