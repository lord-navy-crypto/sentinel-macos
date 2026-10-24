import {describe,it,expect} from "vitest";
import {planScanRaster,SCAN_PRESETS,recompressScannedPdf} from "./scanPdfCompression";
import {PDFDocument} from "pdf-lib";
describe("Scanned PDF dpi/jpg compression raster plan safety",()=>{
 it("respects target DPI for an A4 page with no upscaling beyond selected preset",()=>{
  const size=planScanRaster(595.28,841.89,120);
  expect(size.width).toBe(992);
  expect(size.height).toBe(1403);
  expect(size.width*size.height).toBeLessThanOrEqual(3_500_000);
 });
 it("caps pixels for very large scanned pages without exhausting canvas memory",()=>{
  const size=planScanRaster(2400,2400,150);
  expect(size.width*size.height).toBeLessThanOrEqual(3_500_000);
  expect(size.width).toBeLessThan(3000);
 });
 it("rejects unknown DPI settings and impossible pages",()=>{
  expect(()=>planScanRaster(612,792,300)).toThrow(/preset/);
  expect(()=>planScanRaster(0,792,120)).toThrow(/dimensions/);
  expect(()=>planScanRaster(4000,5000,96)).toThrow(/dimensions/);
 });
 it("rejects an already-cancelled compression without writing any partial PDF",async()=>{
  const doc=await PDFDocument.create();
  doc.addPage([612,792]);
  const input=await doc.save();
  const controller=new AbortController();controller.abort();
  await expect(recompressScannedPdf(new Uint8Array(input),{preset:"balanced"},undefined,controller.signal))
   .rejects.toThrow(/cancelled\. Nothing was saved/);
 });
 it("provides explicit measured quality choices",()=>{
  expect(SCAN_PRESETS.small.jpegQuality).toBeLessThan(SCAN_PRESETS.balanced.jpegQuality);
  expect(SCAN_PRESETS.balanced.jpegQuality).toBeLessThan(SCAN_PRESETS.quality.jpegQuality);
  expect(SCAN_PRESETS.quality.dpi).toBe(150);
 });
});
