/** Inspect signatures before converting a user-selected image; never trust extensions alone. */
export type SafeImageMime="image/png"|"image/jpeg"|"image/webp";
const extensionMime:Readonly<Record<string,SafeImageMime>>={
 png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
};
const ascii=(bytes:Uint8Array,offset:number,count:number)=>
 String.fromCharCode(...bytes.subarray(offset,offset+count));
export function sniffImageMime(bytes:Uint8Array):SafeImageMime|null{
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "image/png";
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
 if(bytes.length>=12&&ascii(bytes,0,4)==="RIFF"&&ascii(bytes,8,4)==="WEBP")
  return "image/webp";
 return null;
}
export function verifyImageSource(name:string,mime:string,header:Uint8Array):SafeImageMime{
 const extension=(/\.([a-z0-9]+)$/iu.exec(name)?.[1]??"").toLowerCase();
 const intended=extensionMime[extension];
 if(!intended)throw Error("Unsupported source format: choose static PNG, JPEG or WebP.");
 const actual=sniffImageMime(header);
 if(actual!==intended)throw Error("Image extension does not match its actual PNG/JPEG/WebP file signature.");
 if(mime&&mime!=="application/octet-stream"&&mime!==actual)
  throw Error("Browser MIME and file signature disagree.");
 if(actual==="image/webp"&&header.length>=21&&ascii(header,12,4)==="VP8X"&&(header[20]&0x02)!==0)
  throw Error("Animated WebP cannot be flattened silently. Use a static image.");
 return actual;
}
export function verifyImageOutput(format:SafeImageMime,header:Uint8Array):void{
 if(sniffImageMime(header)!==format)
  throw Error("Encoded output bytes are not the requested image format.");
}
export function validateImageCanvas(width:number,height:number):void{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)
  throw Error("Invalid output image dimensions.");
 if(width*height>16_000_000)
  throw Error("Output canvas exceeds 16 million pixels; reduce width or disable 2× upscale.");
}
