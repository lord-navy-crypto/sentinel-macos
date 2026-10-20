/** Geometry is normalized to the rotated image's full pixel rectangle. */
export type CropBox={x:number;y:number;w:number;h:number};
export type CropAspect="free"|"1:1"|"4:3"|"16:9"|"3:2";
export const ASPECTS:Record<CropAspect,number|null>={
  free:null,"1:1":1,"4:3":4/3,"16:9":16/9,"3:2":3/2,
};
function clamp(value:number,min:number,max:number):number{
 return Math.max(min,Math.min(max,value));
}
export function centeredCrop(imageWidth:number,imageHeight:number,aspect:CropAspect):CropBox{
 if(!(imageWidth>0&&imageHeight>0))throw new Error("Invalid image dimensions.");
 const ratio=ASPECTS[aspect];
 if(ratio===null)return {x:.1,y:.1,w:.8,h:.8};
 let width=imageWidth*.8,height=width/ratio;
 if(height>imageHeight*.8){height=imageHeight*.8;width=height*ratio;}
 return {x:(1-width/imageWidth)/2,y:(1-height/imageHeight)/2,w:width/imageWidth,h:height/imageHeight};
}
export function moveCrop(box:CropBox,deltaX:number,deltaY:number):CropBox{
 return {...box,x:clamp(box.x+deltaX,0,1-box.w),y:clamp(box.y+deltaY,0,1-box.h)};
}
export function resizeCrop(
 box:CropBox,axis:"width"|"height",fraction:number,
 imageWidth:number,imageHeight:number,aspect:CropAspect
):CropBox{
 const ratio=ASPECTS[aspect];
 let w=axis==="width"?clamp(fraction,.05,1):box.w;
 let h=axis==="height"?clamp(fraction,.05,1):box.h;
 if(ratio!==null){
   if(axis==="width")h=w*imageWidth/(ratio*imageHeight);
   else w=h*ratio*imageHeight/imageWidth;
   if(w>1){h/=w;w=1;}
   if(h>1){w/=h;h=1;}
 }
 const cx=box.x+box.w/2,cy=box.y+box.h/2;
 return {x:clamp(cx-w/2,0,1-w),y:clamp(cy-h/2,0,1-h),w,h};
}
export function pixelCrop(box:CropBox,width:number,height:number){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error("Invalid output size.");
 const left=clamp(Math.floor(box.x*width),0,width-1);
 const top=clamp(Math.floor(box.y*height),0,height-1);
 const right=clamp(Math.ceil((box.x+box.w)*width),left+1,width);
 const bottom=clamp(Math.ceil((box.y+box.h)*height),top+1,height);
 return {left,top,width:right-left,height:bottom-top};
}
