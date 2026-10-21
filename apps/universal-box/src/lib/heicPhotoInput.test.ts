import {describe,it,expect} from "vitest";
import {planPhotoBatch} from "./photoCompression";
import {isHeicName} from "./heicPhotoInput";
describe("Native HEIC participation in existing photo compression",()=>{
 it("selects iPhone HEIC/HEIF variants without inventing browser codec support",()=>{
  expect(isHeicName("IMG_9876.HEIC")).toBe(true);
  expect(isHeicName("IMG_9876.heif")).toBe(true);
  expect(isHeicName("photo.png")).toBe(false);
  expect(isHeicName("heic.txt")).toBe(false);
 });
 it("includes HEIC in the existing bounded batch plan",()=>{
  const settings={format:"jpeg" as const,maxDimension:1024 as const,targetKB:300};
  const count=planPhotoBatch([{name:"IMG_1.HEIC",size:55000},{name:"poster.PNG",size:12000}],settings);
  expect(count).toBe(2);
 });
 it("preserves safety limits on source bytes and target settings",()=>{
  const settings={format:"webp" as const,maxDimension:2048 as const,targetKB:250};
  expect(()=>planPhotoBatch([{name:"phone.heic",size:8000001}],settings)).toThrow(/up to 8 MB/);
  expect(()=>planPhotoBatch([{name:"phone.heic",size:550}],{...settings,targetKB:3})).toThrow(/40–4000/);
  expect(()=>planPhotoBatch(Array.from({length:11},(_,i)=>({name:i+".heic",size:500})),settings)).toThrow(/1–10/);
 });
});
