import type {DeskStroke} from "./workspace";
export type ShapeMode="pen"|"line"|"rectangle";
type Point=[number,number];
const W=1100,H=600;
function safePoint(p:Point):Point{
 if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error("Invalid drawing point.");
 return [Math.min(1,Math.max(0,p[0])),Math.min(1,Math.max(0,p[1]))];
}
export function shapeStroke(mode:Exclude<ShapeMode,"pen">,first:Point,last:Point,
 color:string,width:number):DeskStroke{
 const a=safePoint(first),b=safePoint(last);
 const points:Point[]=mode==="line"?[a,b]:mode==="rectangle"
  ?[a,[b[0],a[1]],b,[a[0],b[1]],a]
  :[];
 if(!points.length)throw Error("Unsupported drawing tool.");
 return {color,width,points};
}
/** Vector output stores paths, not a raster image: user artwork only, no external content. */
export function drawingToSvg(strokes:DeskStroke[]):string{
 if(strokes.length>100)throw Error("Too many strokes for SVG export.");
 const items:string[]=['<rect width="1100" height="600" fill="#111b2b"/>'];
 for(const stroke of strokes){
  if(!/^#[a-fA-F0-9]{6}$/u.test(stroke.color)||!Number.isFinite(stroke.width)||
   stroke.width<1||stroke.width>24||stroke.points.length>400)
   throw Error("Unsupported drawing stroke properties.");
  const points=stroke.points.map(p=>{
   const [x,y]=safePoint(p);
   return [Number((x*W).toFixed(3)),Number((y*H).toFixed(3))];
  });
  if(!points.length)continue;
  if(points.length===1){
   items.push('<circle cx="'+points[0][0]+'" cy="'+points[0][1]+'" r="'+stroke.width+
    '" fill="'+stroke.color+'"/>');
  }else{
   items.push('<polyline points="'+points.map(p=>p.join(",")).join(" ")+'" fill="none" stroke="'+
    stroke.color+'" stroke-width="'+stroke.width*2+
    '" stroke-linecap="round" stroke-linejoin="round"/>');
  }
 }
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="600" viewBox="0 0 1100 600">'+
  items.join("")+'</svg>\n';
}
