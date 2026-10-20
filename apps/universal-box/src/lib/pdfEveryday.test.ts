import {describe,it,expect} from "vitest";
import {PDFDocument} from "pdf-lib";
import {
 inspectPdfEveryday,savePdfMetadata,cropPdfPages,insertBlankPdfPages,
 inspectPdfTextFields,fillPdfTextFields,
} from "./pdfEveryday";

async function sample():Promise<Uint8Array>{
 const doc=await PDFDocument.create();
 doc.addPage([612,792]);doc.addPage([400,500]);
 doc.setTitle("Original");doc.setAuthor("Author");
 return doc.save();
}
describe("v0.27 local small PDF editing",()=>{
 it("inspects document properties and per-page sizes without changing original",async()=>{
   const bytes=await sample();
   const info=await inspectPdfEveryday(bytes);
   expect(info.pages).toBe(2);
   expect(info.title).toBe("Original");
   expect(info.author).toBe("Author");
   expect(info.dimensions.map(p=>[p.width,p.height])).toEqual([[612,792],[400,500]]);
 });
 it("edits standard metadata, preserving page count and all original bytes unmodified",async()=>{
   const input=await sample(),original=Uint8Array.from(input);
   const result=await savePdfMetadata(input,{
     title:"新的文档 & Test",author:"小王",subject:"Physics notes",keywords:"project, research, 公共资源",
   });
   const info=await inspectPdfEveryday(result);
   expect(info.title).toBe("新的文档 & Test");
   expect(info.author).toBe("小王");
   expect(info.keywords).toContain("research");
   expect(info.pages).toBe(2);
   expect(input).toEqual(original);
   await expect(savePdfMetadata(input,{title:"a\nb",author:"",subject:"",keywords:""})).rejects.toThrow(/control/);
 });
 it("sets only one selected PDF CropBox; crop is not content redaction",async()=>{
   const input=await sample();
   const result=await cropPdfPages(input,{left:10,right:20,top:5,bottom:15},2);
   const doc=await PDFDocument.load(result);
   expect(doc.getPage(0).getCropBox()).toMatchObject({x:0,y:0,width:612,height:792});
   const box=doc.getPage(1).getCropBox();
   expect(box.x).toBeCloseTo(40);
   expect(box.y).toBeCloseTo(75);
   expect(box.width).toBeCloseTo(280);
   expect(box.height).toBeCloseTo(400);
   await expect(cropPdfPages(input,{left:0,right:0,top:0,bottom:0},"all")).rejects.toThrow(/nonzero/);
   await expect(cropPdfPages(input,{left:46,right:0,top:0,bottom:0},"all")).rejects.toThrow(/0–45/);
   await expect(cropPdfPages(input,{left:10,right:0,top:0,bottom:0},3)).rejects.toThrow(/outside/);
 });
 it("inserts A4 or same-size blank pages at exact boundaries",async()=>{
   const input=await sample();
   const atStart=await PDFDocument.load(await insertBlankPdfPages(input,0,2,"a4"));
   expect(atStart.getPageCount()).toBe(4);
   expect(atStart.getPage(0).getSize().width).toBeCloseTo(595.28);
   expect(atStart.getPage(2).getSize().width).toBe(612);
   const afterLast=await PDFDocument.load(await insertBlankPdfPages(input,2,1,"same-as-first"));
   expect(afterLast.getPageCount()).toBe(3);
   expect(afterLast.getPage(2).getSize()).toMatchObject({width:612,height:792});
   await expect(insertBlankPdfPages(input,3,1,"a4")).rejects.toThrow(/Position/);
   await expect(insertBlankPdfPages(input,1,11,"letter")).rejects.toThrow(/1–10/);
 });
 it("finds and fills standard printable ASCII AcroForm text fields, refusing unsupported content",async()=>{
   const doc=await PDFDocument.create();
   const page=doc.addPage([612,792]),form=doc.getForm();
   const name=form.createTextField("applicant.name");
   name.addToPage(page,{x:70,y:670,width:240,height:28});
   name.setText("Old");
   const immutable=form.createTextField("readonly");
   immutable.addToPage(page,{x:70,y:600,width:240,height:28});immutable.setText("Locked");immutable.enableReadOnly();
   const source=await doc.save();
   const fields=await inspectPdfTextFields(source);
   expect(fields.find(f=>f.name==="applicant.name")?.text).toBe("Old");
   expect(fields.find(f=>f.name==="readonly")?.readOnly).toBe(true);
   const saved=await fillPdfTextFields(source,{"applicant.name":"New Person"});
   const verified=(await PDFDocument.load(saved)).getForm().getTextField("applicant.name");
   expect(verified.getText()).toBe("New Person");
   await expect(fillPdfTextFields(source,{"readonly":"Changed"})).rejects.toThrow(/read-only/);
   await expect(fillPdfTextFields(source,{"applicant.name":"中文"})).rejects.toThrow(/ASCII/);
   await expect(fillPdfTextFields(source,{"missing.field":"X"})).rejects.toThrow(/not found/);
 });
});
