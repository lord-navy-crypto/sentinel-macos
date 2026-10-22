/** Explicit paste/upload -> decoded bitmap -> genuine local PNG bytes; no clipboard surveillance. */
export const CLIP_IMAGE_MAX_INPUT_BYTES=12_000_000;
export const CLIP_IMAGE_MAX_PIXELS=12_000_000;
export const CLIP_IMAGE_MAX_OUTPUT_BYTES=20_000_000;
export type ImagePasteInput=Pick<Blob,"size"|"type">;
export function validatePastedImage(input:ImagePasteInput):void{
 if(!["image/png","image/jpeg","image/webp"].includes(input.type.toLowerCase()))
  throw Error("Paste or select a PNG, JPEG or WebP image (not SVG or executable content).");
 if(!Number.isSafeInteger(input.size)||input.size<1||input.size>CLIP_IMAGE_MAX_INPUT_BYTES)
  throw Error("Image must be 1 byte–12 MB.");
}
export function validateDecodedDimensions(width:number,height:number):void{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
    width<1||height<1||width*height>CLIP_IMAGE_MAX_PIXELS)
  throw Error("Image dimensions are invalid or exceed 12 million pixels.");
}
export async function imageBlobToPng(source:Blob):Promise<{bytes:Uint8Array;width:number;height:number}>{
 validatePastedImage(source);
 const url=URL.createObjectURL(source);
 const img=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   img.onload=()=>resolve();
   img.onerror=()=>reject(Error("The selected image could not be decoded locally."));
   img.src=url;
  });
  const width=img.naturalWidth,height=img.naturalHeight;
  validateDecodedDimensions(width,height);
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext("2d");
  if(!context)throw Error("Canvas 2D is not available.");
  context.drawImage(img,0,0,width,height);
  const blob=await new Promise<Blob>((resolve,reject)=>
   canvas.toBlob(value=>value?.type==="image/png"?resolve(value):reject(Error("PNG output is unavailable.")),"image/png"));
  canvas.width=0;canvas.height=0;
  if(blob.size>CLIP_IMAGE_MAX_OUTPUT_BYTES)
   throw Error("Converted PNG exceeds the 20 MB export limit.");
  return {bytes:new Uint8Array(await blob.arrayBuffer()),width,height};
 }finally{URL.revokeObjectURL(url);}
}
