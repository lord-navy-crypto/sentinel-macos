import {describe,it,expect} from "vitest";
import {validatePastedImage,validateDecodedDimensions} from "./clipboardImage";

describe("Explicit clipboard image to PNG preflight",()=>{
 it("accepts only locally decoded raster images within 12MB",()=>{
  for(const type of ["image/png","image/jpeg","image/webp"]){
   expect(()=>validatePastedImage({size:1000,type})).not.toThrow();
  }
  for(const type of ["image/svg+xml","image/gif","application/octet-stream","text/html"]){
   expect(()=>validatePastedImage({size:1000,type})).toThrow(/PNG/);
  }
  expect(()=>validatePastedImage({size:0,type:"image/png"})).toThrow(/12 MB/);
  expect(()=>validatePastedImage({size:12_000_001,type:"image/png"})).toThrow(/12 MB/);
  expect(()=>validatePastedImage({size:NaN,type:"image/png"})).toThrow(/12 MB/);
 });
 it("limits decoded pixels to protect canvases from decompression bombs",()=>{
  expect(()=>validateDecodedDimensions(4000,3000)).not.toThrow();
  expect(()=>validateDecodedDimensions(4001,3000)).toThrow(/12 million/);
  expect(()=>validateDecodedDimensions(0,10)).toThrow(/invalid/);
  expect(()=>validateDecodedDimensions(400.3,200)).toThrow(/invalid/);
  expect(()=>validateDecodedDimensions(Number.MAX_SAFE_INTEGER,20)).toThrow(/12 million/);
 });
});
