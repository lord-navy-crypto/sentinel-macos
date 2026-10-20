import {describe,it,expect} from "vitest";
import {centeredCrop,moveCrop,resizeCrop,pixelCrop} from "./cropGeometry";

describe("interactive image crop geometry",()=>{
 it("fits preset aspect ratios inside portrait and landscape images",()=>{
  for(const [w,h] of [[4000,3000],[1200,2400],[320,240]]){
   for(const [name,ratio] of [["1:1",1],["4:3",4/3],["16:9",16/9],["3:2",3/2]] as const){
    const box=centeredCrop(w,h,name);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.w).toBeLessThanOrEqual(1.00000001);
    expect(box.y+box.h).toBeLessThanOrEqual(1.00000001);
    expect((box.w*w)/(box.h*h)).toBeCloseTo(ratio,7);
   }
  }
 });
 it("clamps dragged rectangle to image boundaries",()=>{
  const box={x:.25,y:.25,w:.5,h:.5};
  expect(moveCrop(box,20,-20)).toMatchObject({x:.5,y:0,w:.5,h:.5});
 });
 it("resizes without leaving image or breaking locked aspect",()=>{
  const box=centeredCrop(1200,800,"16:9");
  const next=resizeCrop(box,"width",.95,1200,800,"16:9");
  expect(next.x+next.w).toBeLessThanOrEqual(1);
  expect(next.y+next.h).toBeLessThanOrEqual(1);
  expect(next.w*1200/(next.h*800)).toBeCloseTo(16/9);
 });
 it("returns full resolution pixel cropping and rejects invalid dimensions",()=>{
  expect(pixelCrop({x:0,y:0,w:1,h:1},300,200)).toEqual({left:0,top:0,width:300,height:200});
  expect(pixelCrop({x:.25,y:.25,w:.5,h:.5},400,200)).toEqual({left:100,top:50,width:200,height:100});
  expect(()=>centeredCrop(0,20,"free")).toThrow();
 });
});
