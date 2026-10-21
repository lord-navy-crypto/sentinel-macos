import {describe,it,expect} from "vitest";
import {PDFDocument,StandardFonts} from "pdf-lib";
import {optimizePdfStructure} from "./pdfStructureOptimize";
async function sample(pages:number):Promise<Uint8Array>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
 for(let i=0;i<pages;i++){
  const page=doc.addPage([595,842]);
  page.drawText("Study notes page "+(i+1),{font,size:12,x:55,y:700});
 }
 return doc.save({useObjectStreams:false});
}
describe("Actual PDF structure optimization with size comparison",()=>{
 it("retains pages and page geometry, only marks savings if bytes shrink",async()=>{
  const source=await sample(30),result=await optimizePdfStructure(source);
  expect(result.pages).toBe(30);
  expect(result.originalBytes).toBe(source.length);
  expect(result.candidateBytes).toBeGreaterThan(100);
  expect(result.improved).toBe(result.candidateBytes<source.length);
  if(result.improved){
   expect(result.optimized).not.toBeNull();
   expect(result.optimized!.length).toBe(result.candidateBytes);
   const verify=await PDFDocument.load(result.optimized!);
   expect(verify.getPageCount()).toBe(30);
   expect(verify.getPages()[0].getSize()).toMatchObject({width:595,height:842});
  }else{
   expect(result.optimized).toBeNull();
   expect(result.savedBytes).toBe(0);
  }
 });
 it("rejects signed-looking PDFs before rewriting any structure",async()=>{
  const source=await sample(1);
  const marked=new Uint8Array(source.length+30);
  marked.set(source);marked.set(new TextEncoder().encode("\n% /ByteRange [0 100 200 300]\n"),source.length);
  await expect(optimizePdfStructure(marked)).rejects.toThrow(/signed/);
 });
 it("refuses malformed, encrypted or tiny inputs rather than assuming compression",async()=>{
  await expect(optimizePdfStructure(new Uint8Array(30))).rejects.toThrow(/100 bytes/);
  await expect(optimizePdfStructure(new Uint8Array(140))).rejects.toThrow();
 });
});
