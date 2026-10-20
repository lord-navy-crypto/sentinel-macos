import {describe,it,expect} from "vitest";
import {PDFDocument,PDFName,PDFString} from "pdf-lib";
import {inspectPdfExternalLinks,editPdfExternalLink,addPdfExternalLink,normalizePdfLinkUrl,validatePdfLinkBox} from "./pdfLinks";

async function createPdf():Promise<Uint8Array>{
 const doc=await PDFDocument.create();
 const page=doc.addPage([612,792]);
 page.drawText("Clickable link below",{x:40,y:710,size:15});
 const link=doc.context.obj({
  Type:"Annot",Subtype:"Link",Rect:[40,680,230,735],
  Border:[0,0,0],A:{Type:"Action",S:"URI",URI:PDFString.of("https://example.org/start")},
 });
 page.node.addAnnot(doc.context.register(link));
 const another=doc.context.obj({
  Type:"Annot",Subtype:"Link",Rect:[250,680,400,735],
  Border:[0,0,0],A:{Type:"Action",S:"URI",URI:PDFString.of("https://other.example/docs")},
 });
 page.node.addAnnot(doc.context.register(another));
 return doc.save();
}
describe("Universal Box offline PDF hyperlinks",()=>{
 it("detects external URI annotations and their clickable rectangles",async()=>{
  const pdf=await createPdf();
  const result=await inspectPdfExternalLinks(pdf);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({page:1,annotationIndex:0,url:"https://example.org/start",permitted:true,
   rect:{x:40,y:680,width:190,height:55}});
 });
 it("replaces only one link without changing other link targets or visible text",async()=>{
  const original=await createPdf();
  const result=await editPdfExternalLink(original,{action:"replace",page:1,annotationIndex:0,url:"https://new.example/abc?x=1"});
  const links=await inspectPdfExternalLinks(result);
  expect(links.map(x=>x.url)).toEqual(["https://new.example/abc?x=1","https://other.example/docs"]);
  expect((await inspectPdfExternalLinks(original))[0].url).toBe("https://example.org/start");
 });
 it("removes only selected URI annotation",async()=>{
  const result=await editPdfExternalLink(await createPdf(),{action:"remove",page:1,annotationIndex:0});
  const links=await inspectPdfExternalLinks(result);
  expect(links.map(x=>x.url)).toEqual(["https://other.example/docs"]);
 });
 it("adds an invisible clickable zone without changing page count",async()=>{
  const original=await createPdf();
  const changed=await addPdfExternalLink(original,{page:1,x:40,y:40,width:110,height:20,url:"https://added.example/about"});
  const links=await inspectPdfExternalLinks(changed);
  expect(links).toHaveLength(3);
  expect(links[2].rect).toEqual({x:40,y:40,width:110,height:20});
  expect((await PDFDocument.load(changed)).getPageCount()).toBe(1);
 });
 it("refuses executable, file, credential-bearing links and invalid geometry",async()=>{
  for(const uri of ["javascript:alert(1)","file:///etc/passwd","data:text/plain,hi","ftp://site.example/","https://user:pass@example.com/"]){
   expect(()=>normalizePdfLinkUrl(uri)).toThrow();
  }
  expect(()=>validatePdfLinkBox({page:1,x:590,y:20,width:40,height:20,url:"https://example.org"},612,792)).toThrow();
  await expect(editPdfExternalLink(await createPdf(),{action:"replace",page:1,annotationIndex:20,url:"https://example.org"})).rejects.toThrow();
 });
 it("preserves unrelated PDF annotation kinds",async()=>{
  const doc=await PDFDocument.create();
  const page=doc.addPage([100,100]);
  page.node.addAnnot(doc.context.register(doc.context.obj({
   Type:"Annot",Subtype:"Text",Rect:[5,5,15,15],Contents:PDFString.of("A note"),
  })));
  const withLink=await addPdfExternalLink(await doc.save(),{page:1,x:30,y:30,width:20,height:20,url:"https://example.org/"});
  const output=await PDFDocument.load(withLink);
  const annotations=output.getPage(0).node.Annots();
  expect(annotations?.size()).toBe(2);
  const first=annotations?.lookup(0);
  expect(first?.toString()).toContain("/Text");
  const added=annotations?.lookup(1);
  expect(added?.toString()).toContain("/Link");
 });
});
