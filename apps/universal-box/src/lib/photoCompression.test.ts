import {describe,expect,it} from "vitest";
import {compressPhotoBatch,compressOnePhoto,planPhotoBatch,verifyPhotoZipOutput,type PhotoReport} from "./photoCompression";

import JSZip from "jszip";
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

describe("Prepared target-photo ZIP file integrity",()=>{
 const jpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,0,255,217]);
 const report:PhotoReport={source:"发票.png",originalBytes:400,outputBytes:jpeg.length,
  outputName:"images/001-发票.jpg",targetMet:true,quality:0.72,width:200,height:120,
  sizeDeltaBytes:400-jpeg.length,sizeDeltaPercent:96.5,smallerThanSource:true};
 async function packed(image:Uint8Array=jpeg,records:PhotoReport[]=[report],format:"jpeg"|"webp"="jpeg"){
  const zip=new JSZip();
  zip.file("images/001-发票."+(format==="jpeg"?"jpg":"webp"),image);
  zip.file("reports/manifest.json",JSON.stringify({files:records,settings:{...SETTINGS,format}}));
  return {zip:await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}),reports:records};
 }
 it("reopens actual JPEG bytes and matches the user-facing report to the ZIP manifest",async()=>{
  const result=await packed();
  const archive=await verifyPhotoZipOutput(result,SETTINGS);
  expect((await archive.file(report.outputName)!.async("uint8array"))).toEqual(jpeg);
 });
 it("rejects wrong or mislabeled formats, mismatched byte counts, and manifest drift",async()=>{
  const invalidSig=await packed(new Uint8Array(14).fill(42));
  await expect(verifyPhotoZipOutput(invalidSig,SETTINGS)).rejects.toThrow(/wrong actual output format/);
  const wrongSize=await packed(jpeg,[{...report,outputBytes:9}]);
  await expect(verifyPhotoZipOutput(wrongSize,SETTINGS)).rejects.toThrow(/size does not match/);
  const missing=await packed(jpeg,[{...report,outputName:"images/not-present.jpg"}]);
  await expect(verifyPhotoZipOutput(missing,SETTINGS)).rejects.toThrow(/missing/);
  await expect(verifyPhotoZipOutput(await packed(),{...SETTINGS,targetKB:300})).rejects.toThrow(/prepared settings/);
  const broken=await packed(jpeg,[{...report,source:"not-a-match"}]);
  await expect(verifyPhotoZipOutput({...broken,reports:[report]},SETTINGS)).rejects.toThrow(/report mismatch/);
 });
 it("rejects unexpected extra entries, CRC corruption and cancellation",async()=>{
  const z=new JSZip();
  z.file(report.outputName,jpeg);
  z.file("images/002-extra.jpg",jpeg);
  z.file("reports/manifest.json",JSON.stringify({files:[report],settings:SETTINGS}));
  const result={zip:await z.generateAsync({type:"uint8array",compression:"STORE"}),reports:[report]};
  await expect(verifyPhotoZipOutput(result,SETTINGS)).rejects.toThrow(/extra image/);
  const valid=await packed();
  const controller=new AbortController();controller.abort();
  await expect(verifyPhotoZipOutput(valid,SETTINGS,controller.signal)).rejects.toThrow(/cancelled/);
  const stored=new JSZip();
  stored.file(report.outputName,jpeg,{compression:"STORE"});
  stored.file("reports/manifest.json",JSON.stringify({files:[report],settings:SETTINGS}),{compression:"STORE"});
  const badBytes=await stored.generateAsync({type:"uint8array",compression:"STORE"});
  const offset=badBytes.findIndex((byte,i)=>i>20&&byte===255&&badBytes[i+1]===216);
  expect(offset).toBeGreaterThan(20); // Raw STORE member is present; CRC must reject altered bytes.
  badBytes[offset+3]^=0x7f;
  await expect(verifyPhotoZipOutput({zip:badBytes,reports:[report]},SETTINGS)).rejects.toThrow();
 });
});
