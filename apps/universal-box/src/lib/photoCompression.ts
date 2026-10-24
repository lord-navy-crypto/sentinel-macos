/** True local photo compression toward a target file size; no "guaranteed size" claims. */
import JSZip from "jszip";
import {imageWorkflowScale} from "./imageWorkflow";
import {photoForCanvas} from "./heicPhotoInput";
export type PhotoSettings={format:"jpeg"|"webp";maxDimension:512|1024|2048;targetKB:number};
export type PhotoItem={name:string;file:File};
export type PhotoReport={source:string;originalBytes:number;outputBytes:number;outputName:string;targetMet:boolean;quality:number;width:number;height:number;sizeDeltaBytes:number;sizeDeltaPercent:number;smallerThanSource:boolean};
function sanitize(n:string){return n.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu,"-").replace(/\.[^.]+$/u,"").slice(0,65)||"photo";}
export function planPhotoBatch(files:readonly {name:string;size:number}[],settings:PhotoSettings){
 if(files.length<1||files.length>10)throw Error("Select 1–10 images.");
 if(!["jpeg","webp"].includes(settings.format)||![512,1024,2048].includes(settings.maxDimension)
  ||!Number.isSafeInteger(settings.targetKB)||settings.targetKB<40||settings.targetKB>4000)
  throw Error("Choose JPEG/WebP, 512/1024/2048 pixels and a 40–4000 KB target.");
 let total=0;
 for(const f of files){
  if(!/\.(png|jpe?g|webp|heic|heif)$/iu.test(f.name)||f.size<1||f.size>8_000_000)
   throw Error("Choose PNG/JPEG/WebP/HEIC pictures up to 8 MB.");
  total+=f.size;
 }
 if(total>25_000_000)throw Error("Photo batch exceeds 25 MB combined.");
 return files.length;
}
function checkPhotoCancel(signal?:AbortSignal){
 if(signal?.aborted)throw Error("Photo compression cancelled. No incomplete ZIP was saved.");
}
async function blobFromCanvas(canvas:HTMLCanvasElement,mime:string,quality:number,signal?:AbortSignal):Promise<Blob>{
 checkPhotoCancel(signal);
 return new Promise((resolve,reject)=>{
  let settled=false;
  const abort=()=>{
   if(settled)return;
   settled=true;
   signal?.removeEventListener("abort",abort);
   reject(Error("Photo compression cancelled. No incomplete ZIP was saved."));
  };
  signal?.addEventListener("abort",abort,{once:true});
  canvas.toBlob(value=>{
   if(settled)return;
   settled=true;signal?.removeEventListener("abort",abort);
   if(value?.type===mime)resolve(value);
   else reject(Error(mime+" encoding is unavailable in this WebView."));
  },mime,quality);
 });
}
export async function compressOnePhoto(input:File,settings:PhotoSettings,signal?:AbortSignal):Promise<{data:Uint8Array;report:Omit<PhotoReport,"outputName">}>{
 checkPhotoCancel(signal);
 planPhotoBatch([{name:input.name,size:input.size}],settings);
 const renderable=await photoForCanvas(input);
 checkPhotoCancel(signal);
 const sourceUrl=URL.createObjectURL(renderable),image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(Error("Photo decoder cannot open this picture."));
   image.src=sourceUrl;
  });
  checkPhotoCancel(signal);
  const dim=imageWorkflowScale(image.naturalWidth,image.naturalHeight,settings.maxDimension);
  const canvas=document.createElement("canvas");canvas.width=dim.width;canvas.height=dim.height;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas 2D unavailable.");
  if(settings.format==="jpeg"){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,dim.width,dim.height);}
  ctx.drawImage(image,0,0,dim.width,dim.height);
  const mime=settings.format==="jpeg"?"image/jpeg":"image/webp";
  let best:Blob|null=null,quality=0.92;
  // Keep best encoding closest to requested upper bound; don't silently claim the target is met.
  for(const q of [0.92,0.82,0.72,0.62,0.52,0.42]){
   checkPhotoCancel(signal);
   const candidate=await blobFromCanvas(canvas,mime,q,signal);
   if(!best||candidate.size<best.size){best=candidate;quality=q;}
   if(candidate.size<=settings.targetKB*1000){best=candidate;quality=q;break;}
  }
  canvas.width=0;canvas.height=0;
  if(!best)throw Error("Image could not be encoded.");
  const data=new Uint8Array(await best.arrayBuffer());
  checkPhotoCancel(signal);
  if(data.length>8_000_000)throw Error("Photo output is larger than 8 MB.");
  return {data,report:{source:input.name,originalBytes:input.size,outputBytes:data.length,
   targetMet:data.length<=settings.targetKB*1000,quality,width:dim.width,height:dim.height,
   sizeDeltaBytes:input.size-data.length,sizeDeltaPercent:Number(((input.size-data.length)*100/input.size).toFixed(2)),
   smallerThanSource:data.length<input.size}};
 }finally{URL.revokeObjectURL(sourceUrl);}
}
export async function compressPhotoBatch(files:readonly File[],settings:PhotoSettings,signal?:AbortSignal):
 Promise<{zip:Uint8Array;reports:PhotoReport[]}>{
 checkPhotoCancel(signal);
 planPhotoBatch(files,settings);
 const archive=new JSZip(),reports:PhotoReport[]=[];
 for(let i=0;i<files.length;i++){
  checkPhotoCancel(signal);
  const file=files[i],result=await compressOnePhoto(file,settings,signal);
  checkPhotoCancel(signal);
  const path="images/"+String(i+1).padStart(3,"0")+"-"+sanitize(file.name)+(settings.format==="jpeg"?".jpg":".webp");
  archive.file(path,result.data);reports.push({...result.report,outputName:path});
 }
 archive.file("reports/manifest.json",JSON.stringify({
  generator:"Sentinel Box",operation:"Local target-size photo compression",settings,files:reports,
  warnings:[...reports.filter(x=>!x.targetMet).map(x=>x.source+" could not reach target without more reduction"),
   ...reports.filter(x=>!x.smallerThanSource).map(x=>x.source+" result did not shrink compared with original")]
 },null,2));
 archive.file("reports/README.txt","Image optimization is approximate. The target KB may not be achievable. Compare real output bytes and inspect visual quality. PNG transparency becomes white with JPEG. HEIC input is decoded offline by the macOS system converter only; browsers without native support reject HEIC.\n");
 checkPhotoCancel(signal);
 const zip=await archive.generateAsync({type:"uint8array",compression:"DEFLATE"});
 checkPhotoCancel(signal);
 if(zip.length>20_000_000)throw Error("Photo ZIP exceeds 20 MB.");
 return {zip,reports};
}

/** Reopen the exact export bytes, CRC-check every member and cross-check image formats and
 * the user-visible byte report against the manifest before claiming successful processing.
 */
export async function verifyPhotoZipOutput(output:{zip:Uint8Array;reports:PhotoReport[]},
 settings:PhotoSettings,signal?:AbortSignal):Promise<JSZip>{
 checkPhotoCancel(signal);
 if(!output.reports.length||output.reports.length>10||output.zip.length>20_000_000)
  throw Error("Photo archive or report count is outside the supported limits.");
 const archive=await JSZip.loadAsync(output.zip,{checkCRC32:true});
 checkPhotoCancel(signal);
 const manifestFile=archive.file("reports/manifest.json");
 if(!manifestFile)throw Error("Photo ZIP is missing its report manifest.");
 let manifest:unknown;
 try{manifest=JSON.parse(await manifestFile.async("string"));}catch{throw Error("Photo ZIP manifest is unreadable.");}
 if(!manifest||typeof manifest!=="object")throw Error("Photo ZIP manifest is invalid.");
 const info=manifest as {files?:PhotoReport[];settings?:PhotoSettings};
 if(!Array.isArray(info.files)||info.files.length!==output.reports.length||
  info.settings?.format!==settings.format||info.settings?.targetKB!==settings.targetKB||
  info.settings?.maxDimension!==settings.maxDimension)
  throw Error("Photo ZIP manifest does not match prepared settings or report count.");
 const paths=new Set<string>();
 for(const [index,report] of output.reports.entries()){
  checkPhotoCancel(signal);
  const recorded=info.files[index];
  if(!recorded||recorded.source!==report.source||recorded.outputName!==report.outputName||
   recorded.outputBytes!==report.outputBytes||recorded.originalBytes!==report.originalBytes||
   recorded.width!==report.width||recorded.height!==report.height||
   recorded.targetMet!==report.targetMet)
   throw Error("Photo ZIP report mismatch at image "+(index+1)+".");
  if(paths.has(report.outputName)||!/^images\/[0-9]{3}-[^/]+\.(?:jpg|webp)$/u.test(report.outputName))
   throw Error("Photo ZIP image entry name is invalid or duplicated.");
  paths.add(report.outputName);
  const entry=archive.file(report.outputName);
  if(!entry)throw Error("Photo ZIP is missing "+report.outputName);
  const bytes=await entry.async("uint8array");
  checkPhotoCancel(signal);
  if(bytes.length!==report.outputBytes||bytes.length<12)throw Error("Photo ZIP image size does not match the report.");
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(settings.format==="jpeg"?!jpeg||!report.outputName.endsWith(".jpg"):!webp||!report.outputName.endsWith(".webp"))
   throw Error("Photo ZIP contains an image with the wrong actual output format.");
 }
 const actualImages=Object.keys(archive.files).filter(x=>x.startsWith("images/")&&!archive.files[x].dir);
 if(actualImages.length!==paths.size)throw Error("Photo ZIP contains unexpected or extra image entries.");
 checkPhotoCancel(signal);
 return archive;
}
