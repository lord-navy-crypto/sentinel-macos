import {describe,expect,it} from "vitest";
import {drawingToSvg,shapeStroke} from "./drawingVector";
describe("Drawing shape geometry and offline vector output",()=>{
 it("makes persistent normalized line and rectangle outlines",()=>{
  const line=shapeStroke("line",[0.1,0.2],[0.8,0.9],"#ffffff",3);
  expect(line.points).toEqual([[0.1,0.2],[0.8,0.9]]);
  const rect=shapeStroke("rectangle",[0.1,0.2],[0.8,0.9],"#ffffff",3);
  expect(rect.points).toEqual([[0.1,0.2],[0.8,0.2],[0.8,0.9],[0.1,0.9],[0.1,0.2]]);
  expect(shapeStroke("line",[-2,2],[3,-1],"#ffffff",2).points).toEqual([[0,1],[1,0]]);
 });
 it("produces independent, safe, scalable SVG retaining actual lines",()=>{
  const out=drawingToSvg([
   {color:"#ff0000",width:2,points:[[0,0],[1,1]]},
   {color:"#00ff00",width:3,points:[[0.5,0.5]]},
  ]);
  expect(out).toContain('viewBox="0 0 1100 600"');
  expect(out).toContain('<polyline points="0,0 1100,600"');
  expect(out).toContain('stroke="#ff0000"');
  expect(out).toContain('<circle cx="550" cy="300" r="3"');
  expect(out).not.toMatch(/<script|<image|href=|foreignObject/iu);
 });
 it("rejects stroke properties that might pollute SVG markup",()=>{
  expect(()=>drawingToSvg([{color:'red" onclick="oops',width:2,points:[[0,0]]}])).toThrow(/Unsupported/);
  expect(()=>drawingToSvg([{color:"#ffffff",width:Infinity,points:[[0,0]]}])).toThrow(/Unsupported/);
  expect(()=>drawingToSvg([{color:"#ffffff",width:2,points:[[NaN,0]]}])).toThrow(/Invalid/);
  expect(()=>drawingToSvg(Array.from({length:101},()=>({color:"#ffffff",width:1,points:[[0,0]]})))).toThrow(/Too many/);
 });
});
