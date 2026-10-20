/** Deterministic offline RGBA image difference and pixel overlay. */
export type ImageDiffResult={changed:number;total:number;fraction:number;meanDifference:number;maxDifference:number;mask:Uint8ClampedArray};
function validateInputs(a:Uint8ClampedArray,b:Uint8ClampedArray,width:number,height:number){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>4_000_000)
   throw Error("Image comparison supports up to 4 million pixels at matching dimensions.");
 if(a.length!==width*height*4||b.length!==a.length)throw Error("RGBA images must have the same dimensions.");
}
export function diffImages(
 a:Uint8ClampedArray,b:Uint8ClampedArray,width:number,height:number,tolerance:number,
):ImageDiffResult{
 validateInputs(a,b,width,height);
 if(!Number.isSafeInteger(tolerance)||tolerance<0||tolerance>100)
   throw Error("Tolerance must be an integer from 0 to 100.");
 const mask=new Uint8ClampedArray(a.length);
 let changed=0,sum=0,max=0;
 for(let i=0;i<a.length;i+=4){
   // Input should be composited onto opaque white at the Canvas stage.
   const delta=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),
     Math.abs(a[i+2]-b[i+2]),Math.abs(a[i+3]-b[i+3]));
   sum+=delta;max=Math.max(max,delta);
   if(delta>tolerance){
     changed++;
     mask[i]=236;mask[i+1]=55;mask[i+2]=91;mask[i+3]=255;
   }else{
     const grey=Math.round((a[i]+a[i+1]+a[i+2])/3);
     mask[i]=grey;mask[i+1]=grey;mask[i+2]=grey;mask[i+3]=255;
   }
 }
 const total=width*height;
 return {changed,total,fraction:changed/total,meanDifference:sum/total,maxDifference:max,mask};
}
export function blendImages(
 a:Uint8ClampedArray,b:Uint8ClampedArray,width:number,height:number,secondWeight:number,
):Uint8ClampedArray{
 validateInputs(a,b,width,height);
 if(!Number.isFinite(secondWeight)||secondWeight<0||secondWeight>1)
   throw Error("Overlay weight must be 0–1.");
 const out=new Uint8ClampedArray(a.length),firstWeight=1-secondWeight;
 for(let i=0;i<a.length;i+=4){
   out[i]=Math.round(a[i]*firstWeight+b[i]*secondWeight);
   out[i+1]=Math.round(a[i+1]*firstWeight+b[i+1]*secondWeight);
   out[i+2]=Math.round(a[i+2]*firstWeight+b[i+2]*secondWeight);
   out[i+3]=255;
 }
 return out;
}
