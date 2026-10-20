import {describe,it,expect} from "vitest";
import {pdfLinkRectangleFromDrag} from "./pdfLinkPickerGeometry";
describe("drag to PDF hyperlink positioning",()=>{
 it("converts top-origin screen pixels to bottom-origin PDF crop coordinates",()=>{
  const geometry={view:[10,20,310,620] as [number,number,number,number],
   convertToPdfPoint:(x:number,y:number):[number,number]=>[10+x/2,620-y/2]};
  expect(pdfLinkRectangleFromDrag(geometry,{x:20,y:200},{x:100,y:260}))
   .toEqual({x:10,y:470,width:40,height:30});
 });
 it("does not assume PDF pages are unrotated",()=>{
  const rotated={view:[10,10,410,310] as [number,number,number,number],
   convertToPdfPoint:(x:number,y:number):[number,number]=>[10+y/2,10+x/2]};
  expect(pdfLinkRectangleFromDrag(rotated,{x:20,y:40},{x:60,y:120}))
   .toEqual({x:20,y:10,width:40,height:20});
 });
 it("normalizes dragging backward",()=>{
  const raw={view:[0,0,400,400] as [number,number,number,number],
   convertToPdfPoint:(x:number,y:number):[number,number]=>[x,y]};
  const first=pdfLinkRectangleFromDrag(raw,{x:10,y:30},{x:80,y:90});
  const backwards=pdfLinkRectangleFromDrag(raw,{x:80,y:90},{x:10,y:30});
  expect(first).toEqual(backwards);
 });
 it("rejects very small clicks and invalid positions",()=>{
  const mock={view:[0,0,100,100] as [number,number,number,number],
   convertToPdfPoint:(x:number,y:number):[number,number]=>[x,y]};
  expect(()=>pdfLinkRectangleFromDrag(mock,{x:10,y:10},{x:12,y:12})).toThrow();
  expect(()=>pdfLinkRectangleFromDrag(mock,{x:NaN,y:10},{x:20,y:20})).toThrow();
 });
});
