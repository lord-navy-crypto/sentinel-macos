/** Explicit HEIC import for the existing photo compressor, not a separate cloud converter. */
import {invoke,isTauri} from "@tauri-apps/api/core";
export const isHeicName=(name:string)=>/\.(heic|heif)$/iu.test(name);
const PNG_HEAD=[137,80,78,71,13,10,26,10];
export async function photoForCanvas(file:File):Promise<File>{
 if(!isHeicName(file.name))return file;
 if(!isTauri())throw Error("HEIC decoding needs the installed macOS Sentinel Box app; browser preview does not pretend it can read HEIC.");
 if(file.size<20||file.size>8_000_000)throw Error("HEIC photo must be 20 bytes–8 MB.");
 const bytes=await invoke<number[]>("decode_heic_to_png",{bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});
 if(!Array.isArray(bytes)||bytes.length<24||bytes.length>24_000_000||
    !PNG_HEAD.every((x,i)=>bytes[i]===x))
  throw Error("Native HEIC conversion did not return a valid bounded PNG image.");
 return new File([new Uint8Array(bytes)],file.name.replace(/\.(?:heic|heif)$/iu,".png"),{type:"image/png"});
}
