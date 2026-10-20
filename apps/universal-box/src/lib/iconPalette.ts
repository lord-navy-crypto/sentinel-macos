/** Offline icon-size presets and deterministic pixel colour samples. */
export const ICON_SIZES=[16,32,48,64,128,256,512] as const;
export function iconPlan(name:string):{filename:string;size:number}[]{
 const base=name.normalize("NFKC").replace(/\.[^.]+$/u,"")
   .replace(/[^\p{L}\p{N}._-]/gu,"-").replace(/^\.+/u,"").slice(0,50)||"icon";
 return ICON_SIZES.map(size=>({size,filename:base+"-"+size+"px.png"}));
}
export type PaletteColor={hex:string;count:number;fraction:number};
export function extractPalette(
 pixels:Uint8ClampedArray,width:number,height:number,maxColors=8,
):PaletteColor[]{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1
   ||width*height>8_000_000||pixels.length!==width*height*4)
   throw Error("Invalid RGBA image buffer; maximum 8 million pixels.");
 if(!Number.isInteger(maxColors)||maxColors<1||maxColors>12)throw Error("Request 1–12 colours.");
 const map=new Map<number,{n:number;r:number;g:number;b:number}>();
 const stride=Math.max(1,Math.ceil(width*height/20_000));
 let sampled=0;
 for(let i=0;i<width*height;i+=stride){
   const p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],a=pixels[p+3];
   if(a<128)continue;
   const bucket=((r>>>4)<<8)|((g>>>4)<<4)|(b>>>4);
   const existing=map.get(bucket)??{n:0,r:0,g:0,b:0};
   existing.n++;existing.r+=r;existing.g+=g;existing.b+=b;map.set(bucket,existing);
   sampled++;
 }
 if(!sampled)throw Error("No sufficiently opaque pixels to sample.");
 return [...map.values()].sort((a,b)=>b.n-a.n).slice(0,maxColors).map(x=>{
   const hex="#"+[x.r/x.n,x.g/x.n,x.b/x.n]
     .map(v=>Math.round(v).toString(16).padStart(2,"0")).join("");
   return {hex,count:x.n,fraction:x.n/sampled};
 });
}
