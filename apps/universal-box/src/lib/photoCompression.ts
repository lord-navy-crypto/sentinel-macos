/** True local photo compression toward a target file size; no "guaranteed size" claims. */
import JSZip from "jszip";
import {imageWorkflowScale} from "./imageWorkflow";
export type PhotoSettings={format:"jpeg"|"webp";maxDimension:512|1024|2048;targetKB:number};
export type PhotoItem={name:string;file:File};
export type PhotoReport={source:string;originalBytes:number;outputBytes:number;outputName:string;targetMet:boolean;quality:number;width:number;height:number};
function sanitize(n:string){return n.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu,"-").replace(/\.[^.]+$/u,"").slice(0,65)||"photo";}
export function planPhotoBatch(files:readonly {name:string;size:number}[],settings:PhotoSettings){
 if(files.length<1||files.length>10)throw Error("Select 1–10 images.");
 if(!["jpeg","webp"].includes(settings.format)||![512,1024,2048].includes(settings.maxDimension)
  ||!Number.isSafeInteger(settings.targetKB)||settings.targetKB<40||settings.targetKB>4000)
  throw Error("Choose JPEG/WebP, 512/1024/2048 pixels and a 40–4000 KB target.");
 let total=0;
 for(const f of files){
  if(!/\.(png|jpe?g|webp)$/iu.test(f.name)||f.size<1||f.size>8_000_000)
   throw Error("Choose PNG/JPEG/WebP pictures up to 8 MB.");
  total+=f.size;
 }
 if(total>25_000_000)throw Error("Photo batch exceeds 25 MB combined.");
 return files.length;
}
async function blobFromCanvas(canvas:HTMLCanvasElement,mime:string,quality:number):Promise<Blob>{
 return new Promise((resolve,reject)=>canvas.toBlob(value=>{
  if(value?.type===mime)resolve(value);else reject(Error(mime+" encoding is unavailable in this WebView."));
 },mime,quality));
}
export async function compressOnePhoto(input:File,settings:PhotoSettings):Promise<{data:Uint8Array;report:Omit<PhotoReport,"outputName">}>{
 planPhotoBatch([{name:input.name,size:input.size}],settings);
 const sourceUrl=URL.createObjectURL(input),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(Error("Photo decoder cannot open this picture."));
   image.src=sourceUrl;
  });
  const dim=imageWorkflowScale(image.naturalWidth,image.naturalHeight,settings.maxDimension);
  const canvas=document.createElement("canvas");canvas.width=dim.width;canvas.height=dim.height;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas 2D unavailable.");
  if(settings.format==="jpeg"){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,dim.width,dim.height);}
  ctx.drawImage(image,0,0,dim.width,dim.height);
  const mime=settings.format==="jpeg"?"image/jpeg":"image/webp";
  let best:Blob|null=null,quality=0.92;
  // Keep best encoding closest to requested upper bound; don't silently claim the target is met.
  for(const q of [0.92,0.82,0.72,0.62,0.52,0.42]){
   const candidate=await blobFromCanvas(canvas,mime,q);
   if(!best||candidate.size<best.size){best=candidate;quality=q;}
   if(candidate.size<=settings.targetKB*1000){best=candidate;quality=q;break;}
  }
  canvas.width=0;canvas.height=0;
  if(!best)throw Error("Image could not be encoded.");
  const data=new Uint8Array(await best.arrayBuffer());
  if(data.length>8_000_000)throw Error("Photo output is larger than 8 MB.");
  return {data,report:{source:input.name,originalBytes:input.size,outputBytes:data.length,
   targetMet:data.length<=settings.targetKB*1000,quality,width:dim.width,height:dim.height}};
 }finally{URL.revokeObjectURL(sourceUrl);}
}
export async function compressPhotoBatch(files:readonly File[],settings:PhotoSettings):
 Promise<{zip:Uint8Array;reports:PhotoReport[]}>{
 planPhotoBatch(files,settings);
 const archive=new JSZip(),reports:PhotoReport[]=[];
 for(let i=0;i<files.length;i++){
  const file=files[i],result=await compressOnePhoto(file,settings);
  const path="images/"+String(i+1).padStart(3,"0")+"-"+sanitize(file.name)+(settings.format==="jpeg"?".jpg":".webp");
  archive.file(path,result.data);reports.push({...result.report,outputName:path});
 }
 archive.file("reports/manifest.json",JSON.stringify({
  generator:"Sentinel Box",operation:"Local target-size photo compression",settings,files:reports,
  warnings:reports.filter(x=>!x.targetMet).map(x=>x.source+" could not reach target without more reduction")
 },null,2));
 archive.file("reports/README.txt","Image optimization is approximate. The target KB may not be achievable. Compare real output bytes and inspect visual quality. PNG transparency becomes white with JPEG.\n");
 const zip=await archive.generateAsync({type:"uint8array",compression:"DEFLATE"});
 if(zip.length>20_000_000)throw Error("Photo ZIP exceeds 20 MB.");
 return {zip,reports};
}
