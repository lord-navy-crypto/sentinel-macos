import type {GraphPoint,GraphMode,GraphWindow} from "./graphModel";
export type GraphTrace={curve:number;point:GraphPoint;distancePx:number};
/**
 * CSV contains ONLY generated curve numbers and finite numeric coordinates.
 * Formulas remain in the user-owned graph inputs; never turn expression strings
 * into CSV cells that spreadsheet software might evaluate as formulas.
 */
export function graphSegmentsToCsv(segments:GraphPoint[][][],mode:GraphMode):string{
 if(!["cartesian","parametric","polar"].includes(mode))throw Error("Unknown graph mode.");
 if(segments.length>4)throw Error("Graph supports at most four curves.");
 const lines=["curve,mode,segment,x,y"];
 let rows=0;
 segments.forEach((curve,index)=>curve.forEach((part,segment)=>{
  part.forEach(p=>{
   if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error("Graph has a non-finite sample.");
   if(++rows>5000)throw Error("Too many graph samples.");
   lines.push([index+1,mode,segment+1,p.x.toPrecision(15),p.y.toPrecision(15)].join(","));
  });
 }));
 if(!rows)throw Error("No valid graph samples to export.");
 return lines.join("\r\n")+"\r\n";
}
export function nearestGraphTrace(
 segments:GraphPoint[][][],window:GraphWindow,pixelX:number,pixelY:number,
 canvasWidth:number,canvasHeight:number,limitPx=24,
):GraphTrace|null{
 if(!Number.isFinite(pixelX)||!Number.isFinite(pixelY)||canvasWidth<=0||canvasHeight<=0)
  return null;
 if(!Number.isFinite(limitPx)||limitPx<0)return null;
 const scaleX=canvasWidth/(window.xMax-window.xMin);
 const scaleY=canvasHeight/(window.yMax-window.yMin);
 if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||scaleX<=0||scaleY<=0)return null;
 let best:GraphTrace|null=null;
 segments.forEach((curve,index)=>curve.forEach(part=>part.forEach(point=>{
  const px=(point.x-window.xMin)*scaleX,py=(window.yMax-point.y)*scaleY;
  const distancePx=Math.hypot(px-pixelX,py-pixelY);
  if(Number.isFinite(distancePx)&&distancePx<=limitPx&&(!best||distancePx<best.distancePx))
   best={curve:index+1,point,distancePx};
 })));
 return best;
}
