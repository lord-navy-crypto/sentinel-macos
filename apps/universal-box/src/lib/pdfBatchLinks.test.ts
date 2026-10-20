import {describe,it,expect} from "vitest";
import {PDFDocument,PDFString} from "pdf-lib";
import {
 inspectPdfExternalLinks,parseBatchPdfPages,previewPdfBatchLinks,
 batchEditPdfExternalLinks,pdfLinkInventoryCsv,normalizePdfLinkUrl,
} from "./pdfLinks";
async function sample():Promise<Uint8Array>{
 const pdf=await PDFDocument.create();
 for(let page=0;page<2;page++){
  const node=pdf.addPage([400,400]).node;
  for(let i=0;i<3;i++)node.addAnnot(pdf.context.register(pdf.context.obj({
   Type:"Annot",Subtype:"Link",
   Rect:[10+i*60,30,50+i*60,55],
   A:{S:"URI",URI:PDFString.of(i<2?"https://old.example/docs":"https://keep.example/")},
  })));
  node.addAnnot(pdf.context.register(pdf.context.obj({
   Type:"Annot",Subtype:"Text",Rect:[3,3,9,9],Contents:PDFString.of("Keep note"),
  })));
 }
 return pdf.save();
}
describe("batch hyperlink operations",()=>{
 it("parses strictly scoped page lists with no surprise ranges",()=>{
  expect(parseBatchPdfPages("all",3)).toBe("all");
  expect(parseBatchPdfPages("3,1,1",3)).toEqual([1,3]);
  for(const invalid of ["0","4","1-3","1,evil","",",,"]){
   expect(()=>parseBatchPdfPages(invalid,3)).toThrow();
  }
 });
 it("previews exact matching links and replaces only selected pages",async()=>{
  const source=await sample();
  const old=await inspectPdfExternalLinks(source);
  const plan={action:"replace" as const,sourceUrl:"https://old.example/docs",targetUrl:"https://new.example/docs",pages:[2]};
  expect(previewPdfBatchLinks(old,plan)).toHaveLength(2);
  const {bytes,changed}=await batchEditPdfExternalLinks(source,plan);
  expect(changed).toBe(2);
  expect((await inspectPdfExternalLinks(bytes)).map(l=>l.url)).toEqual([
   "https://old.example/docs","https://old.example/docs","https://keep.example/",
   "https://new.example/docs","https://new.example/docs","https://keep.example/",
  ]);
  expect((await inspectPdfExternalLinks(source))[3].url).toBe("https://old.example/docs");
 });
 it("removes multiple same-page links descending without changing unrelated annotations",async()=>{
  const {bytes,changed}=await batchEditPdfExternalLinks(await sample(),{
   action:"remove",sourceUrl:"https://old.example/docs",pages:"all",
  });
  expect(changed).toBe(4);
  expect((await inspectPdfExternalLinks(bytes)).map(l=>l.url)).toEqual([
   "https://keep.example/","https://keep.example/",
  ]);
  const result=await PDFDocument.load(bytes);
  expect(result.getPages().map(p=>p.node.Annots()?.size())).toEqual([2,2]);
 });
 it("rejects unsafe replacement and zero-match batch without changing originals",async()=>{
  const original=await sample();
  await expect(batchEditPdfExternalLinks(original,{
   action:"replace",sourceUrl:"https://old.example/docs",
   targetUrl:"javascript:alert(1)",pages:"all",
  })).rejects.toThrow();
  await expect(batchEditPdfExternalLinks(original,{
   action:"remove",sourceUrl:"https://no-match.example/",pages:"all",
  })).rejects.toThrow(/No matching/);
  expect((await inspectPdfExternalLinks(original)).length).toBe(6);
 });
 it("exports safe CSV link inventory, never executes URLs",()=>{
  const csv=pdfLinkInventoryCsv([{
   page:1,annotationIndex:2,url:"=HYPERLINK(\"malicious\")",
   permitted:false,rect:{x:1,y:2,width:3,height:4},
  }]);
  expect(csv).toContain('"\'=HYPERLINK(""malicious"")"');
  expect(()=>normalizePdfLinkUrl("file:///etc/passwd")).toThrow();
 });
});
