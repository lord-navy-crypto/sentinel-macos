/** Local image enhancement: resampling improves display size, not lost source detail. */
export function enhancedDimensions(width:number,height:number,scale:1|2,maxWidth:number){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width*height>32_000_000)throw new Error("Source image exceeds 32 megapixels.");
  if(!Number.isFinite(maxWidth)||maxWidth<64||maxWidth>8192)throw new Error("Maximum width must be 64–8192.");
  const ratio=Math.min(scale,maxWidth/width,8192/width,8192/height,Math.sqrt(24_000_000/(width*height)));
  if(ratio<=0)throw new Error("Invalid image dimensions.");
  return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
/** Apply a bounded 3x3 unsharp kernel, preserving source alpha and edge pixels. */
export function sharpenPixels(data:Uint8ClampedArray,width:number,height:number,strength:number):Uint8ClampedArray{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    width*height>24_000_000||data.length!==width*height*4)throw new Error("Invalid image pixel buffer.");
  if(!Number.isFinite(strength)||strength<0||strength>1)throw new Error("Sharpen strength must be 0–1.");
  const output=new Uint8ClampedArray(data);
  if(strength===0||width<3||height<3)return output;
  for(let y=1;y<height-1;y++){
    for(let x=1;x<width-1;x++){
      const i=(y*width+x)*4;
      if(data[i+3]===0)continue;
      for(let channel=0;channel<3;channel++){
        const adjacent=data[i-4+channel]+data[i+4+channel]+data[i-width*4+channel]+data[i+width*4+channel];
        output[i+channel]=data[i+channel]+strength*(4*data[i+channel]-adjacent);
      }
    }
  }
  return output;
}
