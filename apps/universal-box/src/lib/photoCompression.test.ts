import {describe,expect,it} from "vitest";
import {compressPhotoBatch,compressOnePhoto,planPhotoBatch} from "./photoCompression";

const SETTINGS={format:"jpeg" as const,maxDimension:512 as const,targetKB:200};
describe("P0 photo target-KB cancellation contract",()=>{
 it("aborts before decoder/Canvas use and never emits a partial ZIP",async()=>{
  const controller=new AbortController();
  const photo=new File([new Uint8Array([137,80,78,71,13,10,26,10])],"example.png",{type:"image/png"});
  controller.abort();
  await expect(compressPhotoBatch([photo],SETTINGS,controller.signal))
   .rejects.toThrow(/Photo compression cancelled.*No incomplete ZIP was saved/);
  await expect(compressOnePhoto(photo,SETTINGS,controller.signal))
   .rejects.toThrow(/Photo compression cancelled/);
 });
 it("retains the existing bounded batch plan on every normal, uncancelled call",()=>{
  const files=[{name:"合同扫描.jpeg",size:1234},{name:"photo.webp",size:3456}];
  expect(planPhotoBatch(files,SETTINGS)).toBe(2);
  expect(()=>planPhotoBatch([],SETTINGS)).toThrow(/Select 1–10/);
  expect(()=>planPhotoBatch([{name:"bad.pdf",size:100}],SETTINGS)).toThrow(/Choose PNG\/JPEG/);
 });
});
