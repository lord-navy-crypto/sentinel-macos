import {describe,it,expect} from "vitest";
import {PHOTO_PRESETS,photoPresetSettings,planPhotoBatch,type PhotoPreset} from "./photoCompression";

describe("Photo quick presets for common offline uploads",()=>{
 it("supplies three safe concrete settings without implying guaranteed file size",()=>{
  const keys:PhotoPreset[]=["email","web","detail"];
  for(const key of keys){
   const settings=photoPresetSettings(key);
   expect(settings).toEqual(PHOTO_PRESETS[key].settings);
   expect(planPhotoBatch([{name:"profile.PNG",size:150_000}],settings)).toBe(1);
   expect(settings.targetKB).toBeGreaterThanOrEqual(40);
   expect(settings.targetKB).toBeLessThanOrEqual(4000);
  }
  expect(photoPresetSettings("email")).toEqual({format:"jpeg",maxDimension:1024,targetKB:250});
  expect(photoPresetSettings("web")).toEqual({format:"webp",maxDimension:1024,targetKB:400});
  expect(photoPresetSettings("detail")).toEqual({format:"jpeg",maxDimension:2048,targetKB:1500});
 });
 it("returns fresh settings so changing a manual field never mutates the shared preset",()=>{
  const first=photoPresetSettings("email");
  first.targetKB=900;
  const second=photoPresetSettings("email");
  expect(second.targetKB).toBe(250);
  expect(PHOTO_PRESETS.email.settings.targetKB).toBe(250);
  expect(()=>photoPresetSettings("unknown" as PhotoPreset)).toThrow(/Unsupported/);
 });
 it("retains safety checks for invalid original file size or names",()=>{
  const settings=photoPresetSettings("email");
  expect(()=>planPhotoBatch([{name:"file.txt",size:200}],settings)).toThrow(/Choose PNG/);
  expect(()=>planPhotoBatch([{name:"photo.png",size:8_000_001}],settings)).toThrow(/up to 8 MB/);
 });
});
