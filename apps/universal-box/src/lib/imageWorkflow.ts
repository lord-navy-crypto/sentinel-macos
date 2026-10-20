/** Stage plan for an offline, multi-image resize → convert → rename → ZIP workflow. */
export type ImageWorkflowFormat="png"|"jpeg"|"webp";
export type ImageWorkflowFile={name:string;size:number;type:string};
export type ImageWorkflowOptions={
 format:ImageWorkflowFormat;maxDimension:512|1024|2048;quality:number;
 prefix:string;includeManifest:boolean;
};
export type PlannedImage={index:number;sourceName:string;outputName:string};
const EXTENSIONS:Record<ImageWorkflowFormat,string>={png:"png",jpeg:"jpg",webp:"webp"};
const MIME:Record<ImageWorkflowFormat,string>={png:"image/png",jpeg:"image/jpeg",webp:"image/webp"};
export function imageWorkflowMime(format:ImageWorkflowFormat):string{
 if(!MIME[format])throw Error("Unsupported image format.");
 return MIME[format];
}
export function imageWorkflowScale(width:number,height:number,maxDimension:number):{width:number;height:number}{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1
   ||width*height>8_000_000)throw Error("Input image must contain 1–8 million pixels.");
 if(![512,1024,2048].includes(maxDimension))throw Error("Select a supported maximum dimension.");
 const ratio=Math.min(1,maxDimension/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
export function planImageWorkflow(files:ImageWorkflowFile[],options:ImageWorkflowOptions):PlannedImage[]{
 if(files.length<1||files.length>12)throw Error("Select 1–12 local images.");
 if(![512,1024,2048].includes(options.maxDimension))throw Error("Invalid max dimension.");
 if(!Number.isFinite(options.quality)||options.quality<0.5||options.quality>1)throw Error("Quality must be from 0.5 to 1.");
 if(!MIME[options.format])throw Error("Choose PNG, JPEG or WebP output.");
 if(options.prefix.length>30)throw Error("Filename prefix exceeds 30 characters.");
 let total=0;
 for(const f of files){
   if(f.size<1||f.size>6_000_000||!/\.((jpe?g)|(png)|(webp))$/iu.test(f.name))
     throw Error("Choose PNG/JPEG/WebP images up to 6 MB each.");
   if(f.type&&!["image/jpeg","image/png","image/webp"].includes(f.type))
     throw Error("A selected image's MIME type is unsupported.");
   total+=f.size;
 }
 if(total>30_000_000)throw Error("Selected files exceed 30 MB combined.");
 const prefix=options.prefix.normalize("NFKC").replace(/[^\p{L}\p{N}._-]/gu,"-").replace(/^\.+/u,"").slice(0,30)||"image";
 return files.map((f,index)=>({
   index,sourceName:f.name,
   outputName:prefix+"-"+String(index+1).padStart(3,"0")+"."+EXTENSIONS[options.format],
 }));
}
