import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {imagePageGeometry,imagesToPdf} from "./pdfConverters";

const tinyPng=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K3sAAAAASUVORK5CYII="),x=>x.charCodeAt(0));

describe("local image-to-PDF conversion",()=>{
  it("keeps images proportional on A4, US Letter, and fit pages",()=>{
    const a=imagePageGeometry(1200,800,"a4");
    expect(a.pageWidth).toBeCloseTo(595.28);
    expect(a.pageHeight).toBeCloseTo(841.89);
    expect(a.width/a.height).toBeCloseTo(1.5);
    expect(a.x).toBeGreaterThanOrEqual(0);
    const us=imagePageGeometry(200,300,"letter");
    expect(us.pageWidth).toBe(612);
    const fit=imagePageGeometry(400,800,"fit");
    expect(fit.width/fit.height).toBeCloseTo(.5);
    expect(fit.pageHeight).toBeLessThanOrEqual(841);
    expect(()=>imagePageGeometry(100000,100000,"fit")).toThrow();
  });
  it("creates new valid pages for multiple images, without overwriting originals",async()=>{
    const before=new Uint8Array(tinyPng);
    const bytes=await imagesToPdf([
      {name:"a.png",mime:"image/png",bytes:tinyPng},
      {name:"b.png",mime:"image/png",bytes:tinyPng},
    ],"letter");
    const document=await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getWidth()).toBe(612);
    expect(tinyPng).toEqual(before);
  });
  it("enforces batch and file-size limits",async()=>{
    await expect(imagesToPdf([],"a4")).rejects.toThrow(/1–12/);
    await expect(imagesToPdf(Array.from({length:13},()=>({name:"a.png",mime:"image/png" as const,bytes:tinyPng})),"a4")).rejects.toThrow(/1–12/);
    await expect(imagesToPdf([{name:"bad.png",mime:"image/png",bytes:new Uint8Array()}],"a4")).rejects.toThrow(/Each image/);
  });
});
