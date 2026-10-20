/** Convert a dragged rectangle on a rendered PDF.js viewport back into
 * the visible PDF CropBox's unrotated coordinate space (points).
 * The underlying PdfDocument already knows how the page is rotated.
 */
export type ScreenPoint={x:number;y:number};
export type PdfPoint={x:number;y:number};
export type PdfCoordinateConverter={
 convertToPdfPoint:(x:number,y:number)=>[number,number];
 view:[number,number,number,number];
};
export function pdfLinkRectangleFromDrag(
 viewport:PdfCoordinateConverter,
 a:ScreenPoint,b:ScreenPoint,
):{x:number;y:number;width:number;height:number}{
 if(![a.x,a.y,b.x,b.y,...viewport.view].every(Number.isFinite))
  throw Error("Invalid drag coordinates.");
 const p1=viewport.convertToPdfPoint(a.x,a.y);
 const p2=viewport.convertToPdfPoint(b.x,b.y);
 if(![...p1,...p2].every(Number.isFinite))throw Error("Cannot resolve PDF coordinates.");
 const originX=viewport.view[0],originY=viewport.view[1];
 const maxX=viewport.view[2]-originX,maxY=viewport.view[3]-originY;
 const x=Math.max(0,Math.min(p1[0],p2[0])-originX);
 const y=Math.max(0,Math.min(p1[1],p2[1])-originY);
 const width=Math.min(maxX-x,Math.abs(p2[0]-p1[0]));
 const height=Math.min(maxY-y,Math.abs(p2[1]-p1[1]));
 if(![x,y,width,height].every(Number.isFinite)||width<4||height<4)
  throw Error("Drag a clickable area at least 4 PDF points wide and high.");
 return {x:Math.round(x*10)/10,y:Math.round(y*10)/10,
  width:Math.round(width*10)/10,height:Math.round(height*10)/10};
}
