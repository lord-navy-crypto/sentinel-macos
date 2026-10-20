import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {anchorLocation,applyPdfFreedom,parsePdfColor,parsePdfSelection} from "./pdfFreedom";

async function fixture(){
  const pdf=await PDFDocument.create();
  pdf.addPage([600,800]);
  pdf.addPage([600,800]);
  pdf.addPage([600,800]);
  return new Uint8Array(await pdf.save());
}
const base={pages:"all",fontSize:24,color:"#304a90",opacity:.5,anchor:"bottom-right" as const};

describe("PDF Freedom Studio (offline non-destructive overlays)",()=>{
  it("parses exact 1-indexed page ranges, rejects out-of-range or duplicates safely",()=>{
    expect(parsePdfSelection("2,1,3-",5)).toEqual([0,1,2,3,4]);
    expect(parsePdfSelection("all",3)).toEqual([0,1,2]);
    expect(parsePdfSelection("1-",3)).toEqual([0,1,2]);
    expect(()=>parsePdfSelection("",5)).toThrow();
    expect(()=>parsePdfSelection("0",5)).toThrow();
    expect(()=>parsePdfSelection("4-2",5)).toThrow();
    expect(()=>parsePdfSelection("6",5)).toThrow();
    expect(()=>parsePdfSelection("all",301)).toThrow();
  });
  it("parses colours and anchor placement consistently",()=>{
    expect(parsePdfColor("#FF0000")).toEqual({red:1,green:0,blue:0});
    expect(()=>parsePdfColor("red")).toThrow();
    expect(anchorLocation(600,800,100,20,"bottom-right")).toEqual({x:476,y:24});
    expect(anchorLocation(600,800,100,20,"center")).toEqual({x:250,y:390});
    expect(()=>anchorLocation(50,50,80,10,"center")).toThrow();
  });
  it("stamps text on selected pages and preserves number of original pages",async()=>{
    const before=await fixture();
    const output=await applyPdfFreedom(before,{mode:"stamp",text:"Approved",pages:"2",fontSize:18,color:"#000000",opacity:1,anchor:"top-left"});
    const pdf=await PDFDocument.load(output);
    expect(pdf.getPageCount()).toBe(3);
    expect(output.length).toBeGreaterThan(before.length);
    expect(pdf.getPage(0).getWidth()).toBe(600);
  });
  it("supports watermark and selected-page sequential numbering",async()=>{
    const before=await fixture();
    const watermark=await applyPdfFreedom(before,{mode:"watermark",text:"DRAFT",...base});
    expect((await PDFDocument.load(watermark)).getPageCount()).toBe(3);
    const numbered=await applyPdfFreedom(before,{mode:"numbers",prefix:"Page ",suffix:"",start:5,pages:"1,3",fontSize:12,color:"#000000",opacity:1,anchor:"bottom-center"});
    expect((await PDFDocument.load(numbered)).getPageCount()).toBe(3);
  });
  it("validates fonts, page ranges, text and transparency before saving",async()=>{
    const bytes=await fixture();
    await expect(applyPdfFreedom(bytes,{mode:"stamp",text:"中文",...base})).rejects.toThrow(/TTF/);
    await expect(applyPdfFreedom(bytes,{mode:"stamp",text:"line\nline",...base})).rejects.toThrow(/single-line/);
    await expect(applyPdfFreedom(bytes,{mode:"stamp",text:"ok",...base,opacity:0})).rejects.toThrow(/Opacity/);
    await expect(applyPdfFreedom(bytes,{mode:"stamp",text:"ok",...base,pages:"10"})).rejects.toThrow(/outside/);
    await expect(applyPdfFreedom(bytes,{mode:"numbers",prefix:"p.",suffix:"",start:-1,...base})).rejects.toThrow(/start/);
  });
  it("places raster PNG signatures without changing the input byte array",async()=>{
    const original=await fixture(),backup=new Uint8Array(original);
    const png=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K3sAAAAASUVORK5CYII="),x=>x.charCodeAt(0));
    const result=await applyPdfFreedom(original,{mode:"image",pages:"1",imageBytes:png,imageType:"png",widthPercent:20,opacity:1,anchor:"bottom-right"});
    expect((await PDFDocument.load(result)).getPageCount()).toBe(3);
    expect(original).toEqual(backup);
    await expect(applyPdfFreedom(original,{mode:"image",pages:"1",imageBytes:png,imageType:"png",widthPercent:95,opacity:1,anchor:"center"})).rejects.toThrow(/width/);
  });
});
