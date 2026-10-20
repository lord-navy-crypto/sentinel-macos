import {describe,expect,it} from "vitest";
import {enhancedDimensions,sharpenPixels} from "./imageEnhance";
describe("local image enhancement",()=>{
 it("allows bounded 2x enlargement",()=>{
   expect(enhancedDimensions(600,400,2,2400)).toEqual({width:1200,height:800});
   expect(enhancedDimensions(600,400,1,300)).toEqual({width:300,height:200});
 });
 it("rejects excessive inputs",()=>{
   expect(()=>enhancedDimensions(9000,9000,2,8192)).toThrow();
   expect(()=>enhancedDimensions(20,20,2,Infinity)).toThrow();
 });
 it("sharpens only RGB interior and preserves alpha",()=>{
   const pixels=new Uint8ClampedArray(3*3*4);
   for(let i=0;i<9;i++){pixels[i*4]=80;pixels[i*4+3]=255;}
   pixels[16]=100;
   const result=sharpenPixels(pixels,3,3,1);
   expect(result[16]).toBe(180);
   expect(result[19]).toBe(255);
   expect(result[0]).toBe(80);
   expect(pixels[16]).toBe(100);
 });
 it("returns unchanged values with no sharpening",()=>{
   const p=new Uint8ClampedArray([12,34,56,78]);
   expect(sharpenPixels(p,1,1,0)).toEqual(p);
 });
});
