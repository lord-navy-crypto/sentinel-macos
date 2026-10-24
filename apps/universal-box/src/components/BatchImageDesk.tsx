import {useEffect,useState} from "react";
import JSZip from "jszip";
import {exportFile} from "../lib/output";
import {enhancedDimensions,sharpenPixels} from "../lib/imageEnhance";
import {verifyImageSource,verifyImageOutput,validateImageCanvas} from "../lib/imageConversionSafety";

type ImageOutput = "image/jpeg"|"image/png"|"image/webp";
type ConversionRecord={
 source:string;target:string;sourceBytes:number;outputBytes:number;deltaBytes:number;
 sourceWidth:number;sourceHeight:number;width:number;height:number;
};
type ImagePreview={name:string;url:string;width:number;height:number;sourceBytes:number;outputBytes:number};
type PreparedBatch={archive:Uint8Array;records:ConversionRecord[];previews:ImagePreview[]};
function cleanBase(value:string):string {
 return value.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,55)||"image";
}
async function convertImage(file:File,format:ImageOutput,maxWidth:number,quality:number,upscale:1|2,sharpen:number):
 Promise<{blob:Blob;width:number;height:number;sourceWidth:number;sourceHeight:number}>{
 if(file.size<1||file.size>8_000_000)throw Error("Choose a source image between 1 byte and 8 MB.");
 verifyImageSource(file.name,file.type,new Uint8Array(await file.slice(0,64).arrayBuffer()));
 const img=new Image();
 const url=URL.createObjectURL(file);
 try {
  await new Promise<void>((resolve,reject)=>{
   img.onload=()=>resolve();
   img.onerror=()=>reject(Error("Cannot decode "+file.name));
   img.src=url;
  });
  if(img.naturalWidth*img.naturalHeight>32_000_000)throw Error("Image exceeds 32 megapixels: "+file.name);
  const {width,height}=enhancedDimensions(img.naturalWidth,img.naturalHeight,upscale,maxWidth);
  validateImageCanvas(width,height);
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  try{
   const context=canvas.getContext("2d");
   if(!context)throw Error("Canvas unavailable");
   if(format==="image/jpeg"){context.fillStyle="#fff";context.fillRect(0,0,width,height);}
   context.imageSmoothingEnabled=true;
   context.imageSmoothingQuality="high";
   context.drawImage(img,0,0,width,height);
   if(sharpen>0){
    const pixels=context.getImageData(0,0,width,height);
    pixels.data.set(sharpenPixels(pixels.data,width,height,sharpen));
    context.putImageData(pixels,0,0);
   }
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error("Encoding failed")),format,quality));
   if(blob.type!==format)throw Error("This WebView cannot encode "+format);
   verifyImageOutput(format,new Uint8Array(await blob.slice(0,16).arrayBuffer()));
   return {blob,width,height,sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight};
  }finally{canvas.width=0;canvas.height=0;}
 }finally{URL.revokeObjectURL(url);}
}
export default function BatchImageDesk(){
 const [files,setFiles]=useState<File[]>([]);
 const [format,setFormat]=useState<ImageOutput>("image/jpeg");
 const [width,setWidth]=useState(1600);
 const [quality,setQuality]=useState(.8);
 const [upscale,setUpscale]=useState<1|2>(1);
 const [sharpen,setSharpen]=useState(0);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [prepared,setPrepared]=useState<PreparedBatch|null>(null);
 // Revoke preview URLs after replacement and on unmount; no implicit uploads or disk modifications.
 useEffect(()=>()=>{for(const entry of prepared?.previews??[])URL.revokeObjectURL(entry.url);},[prepared]);
 function invalidate(){setPrepared(null);setStatus("");}
 async function prepare(){
  if(!files.length||busy)return;
  setBusy(true);setStatus("");setPrepared(null);
  const allocated:string[]=[];
  try{
   const zip=new JSZip();
   const extension=format==="image/jpeg"?"jpg":format==="image/webp"?"webp":"png";
   let sum=0;
   const records:ConversionRecord[]=[];
   const previews:ImagePreview[]=[];
   for(let i=0;i<files.length;i++){
    const file=files[i];
    const converted=await convertImage(file,format,width,quality,upscale,sharpen);
    sum+=converted.blob.size;
    if(sum>18_000_000)throw Error("Combined images exceed the 18 MB ZIP processing budget. Use fewer images.");
    const outputName=String(i+1).padStart(2,"0")+"-"+cleanBase(file.name)+"."+extension;
    const encoded=new Uint8Array(await converted.blob.arrayBuffer());
    verifyImageOutput(format,encoded.subarray(0,16));
    zip.file(outputName,encoded);
    records.push({source:file.name,target:outputName,sourceBytes:file.size,
     outputBytes:encoded.length,deltaBytes:encoded.length-file.size,
     width:converted.width,height:converted.height,sourceWidth:converted.sourceWidth,sourceHeight:converted.sourceHeight});
    const url=URL.createObjectURL(converted.blob);
    allocated.push(url);
    previews.push({name:outputName,url,width:converted.width,height:converted.height,
     sourceBytes:file.size,outputBytes:encoded.length});
    setStatus("Preparing preview "+(i+1)+" / "+files.length+"…");
   }
   zip.file("sentinel-box-image-conversion-report.json",
    JSON.stringify({format,quality,maximumWidth:width,records},null,2)+"\n");
   const archive=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:3}});
   if(archive.length>20_000_000)throw Error("ZIP exceeds the 20 MB native export limit.");
   const reread=await JSZip.loadAsync(archive,{checkCRC32:true});
   for(const item of records){
    const zipped=reread.file(item.target);
    if(!zipped)throw Error("Missing converted image: "+item.target);
    const content=await zipped.async("uint8array");
    if(content.length!==item.outputBytes)throw Error("Converted image size mismatch: "+item.target);
    verifyImageOutput(format,content.subarray(0,16));
   }
   setPrepared({archive,records,previews});
   setStatus("All "+records.length+" images are ready. Review actual output dimensions and sizes, then save the ZIP. Originals remain unchanged.");
  }catch(e){
   for(const url of allocated)URL.revokeObjectURL(url);
   setStatus("Image preview failed: "+String(e instanceof Error?e.message:e));
  }finally{setBusy(false);}
 }
 async function savePrepared(){
  if(!prepared||busy)return;
  setBusy(true);setStatus("");
  try{
   const saved=await exportFile("daily-desk-batch-images.zip",prepared.archive);
   setStatus(saved?"Saved "+prepared.records.length+" reviewed images in a verified ZIP. Originals remain unchanged.":"Save cancelled; preview remains available.");
  }catch(e){setStatus("Saving ZIP failed: "+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>Batch image converter, enhancement · ZIP export</h3>
  <p className="subtle">Select up to 12 static PNG/JPEG/WebP images, optionally enlarge 2× and sharpen. Prepare a local preview first, compare real dimensions and file sizes, then save exactly those reviewed results as a ZIP. Inputs are checked against real signatures; misleading extensions and animated WebP are rejected. Maximum output canvas: 16 megapixels. Originals are never uploaded or modified.</p>
  <p className="subtle" data-testid="image-compatibility-note">Compatibility: JPEG does not support transparency; transparent areas are placed on a white background. Re-encoding can discard EXIF, color profiles, animation and metadata; JPEG/WebP can lose pixel detail. Unsupported encoders fail explicitly instead of exporting a mislabeled PNG. Increasing resolution interpolates pixels but cannot restore missing detail.</p>
  <label htmlFor="batch-image-files" className="field-label">Choose images (12 maximum, 8 MB each)</label>
  <input id="batch-image-files" type="file" className="field" accept="image/png,image/jpeg,image/webp" multiple disabled={busy}
   onChange={event=>{
    const selected=Array.from(event.target.files??[]);
    event.target.value="";
    invalidate();
    if(selected.length>12){setFiles([]);setStatus("Choose at most 12 images.");return;}
    setFiles(selected);
   }}/>
  {files.length>0&&<p className="subtle">{files.length} image(s) selected: {files.map(f=>f.name).join(", ")}</p>}
  <div className="tools-pair">
   <label className="field-label">Output format<select className="field" value={format} disabled={busy} onChange={event=>{setFormat(event.target.value as ImageOutput);invalidate();}}>
    <option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option>
   </select></label>
   <label className="field-label">Maximum width (px)<input type="number" min={64} max={8192} className="field" value={width} disabled={busy}
    onChange={event=>{setWidth(Math.max(64,Math.min(8192,Number(event.target.value)||1600)));invalidate();}}/></label>
   <label className="field-label">Quality · {Math.round(quality*100)}%<input type="range" min={.35} max={1} step={.05} value={quality} disabled={busy}
    onChange={event=>{setQuality(Number(event.target.value));invalidate();}}/></label>
   <label className="field-label">Resolution<select className="field" value={upscale} disabled={busy}
    onChange={event=>{setUpscale(Number(event.target.value) as 1|2);invalidate();}}>
    <option value={1}>Original / downscale</option><option value={2}>Up to 2× enlarged</option>
   </select></label>
   <label className="field-label">Sharpen · {Math.round(sharpen*100)}%<input type="range" min={0} max={1} step={.1} value={sharpen} disabled={busy}
    onChange={event=>{setSharpen(Number(event.target.value));invalidate();}}/></label>
  </div>
  {files.length>0&&<p className="subtle" data-testid="image-input-total">Selected source bytes: {files.reduce((n,f)=>n+f.size,0).toLocaleString()} · Output may be larger or smaller depending on the format and quality.</p>}
  <div className="actions">
   <button data-testid="image-prepare-preview" type="button" className="primary-button" disabled={busy||!files.length}
    onClick={()=>{void prepare();}}>{busy?"Preparing preview…":"Preview converted images"}</button>
   <button data-testid="image-save-reviewed" type="button" className="secondary-button" disabled={busy||!prepared}
    onClick={()=>{void savePrepared();}}>Save reviewed ZIP</button>
  </div>
  {prepared&&<section data-testid="image-size-report" className="panel" aria-label="Prepared images before saving">
   <h4>Real file size & dimension comparison · 保存前预览</h4>
   <p className="subtle">Actual converted bytes are ready in memory. Images in the ZIP match these previews and are not converted a second time during saving.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12}}>
    {prepared.previews.map((item,i)=><div data-testid="image-output-preview" key={item.name} className="task-row" style={{display:"block"}}>
     <img src={item.url} alt={"Converted preview for "+prepared.records[i].source}
      style={{display:"block",width:"100%",height:135,objectFit:"contain",background:"#f7f9ff"}}/>
     <p style={{overflowWrap:"anywhere"}}>{prepared.records[i].source} → {item.name}</p>
     <p className="subtle">{prepared.records[i].sourceWidth}×{prepared.records[i].sourceHeight} → {item.width}×{item.height} px</p>
     <p className="subtle">{item.sourceBytes.toLocaleString()} → {item.outputBytes.toLocaleString()} bytes
      {" · "}{prepared.records[i].deltaBytes<0?"saved":prepared.records[i].deltaBytes>0?"increased":"unchanged"}
      {" "}{Math.abs(prepared.records[i].deltaBytes).toLocaleString()} bytes</p>
    </div>)}
   </div>
  </section>}
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}
