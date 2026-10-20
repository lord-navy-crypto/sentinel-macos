import {type ChangeEvent,useMemo,useState} from "react";
import JSZip from "jszip";
import {exportFile} from "../lib/output";
import {inspectZip,type ZipInspection} from "../lib/zipInspector";
import {planSafeZipExtraction,safeSelectiveZip} from "../lib/safeZipExtract";
import {
 imageWorkflowMime,imageWorkflowScale,planImageWorkflow,
 type ImageWorkflowFormat,type ImageWorkflowOptions,
} from "../lib/imageWorkflow";
import {planQuickZip} from "../lib/quickZipPack";

export type WorkflowMode="zip-selective"|"image-batch"|"zip-pack";
const TABS:{id:WorkflowMode;label:string}[]=[
 {id:"zip-selective",label:"Safe ZIP selective export / 选择性解压"},
 {id:"image-batch",label:"Image workflow / 图片批量处理"},
 {id:"zip-pack",label:"Batch ZIP pack / 一键批量压缩"},
];
function message(e:unknown){return e instanceof Error?e.message:String(e);}
function blobPng(canvas:HTMLCanvasElement,mime:string,quality:number):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{
   if(!blob||blob.type!==mime){reject(Error("This WebView cannot encode "+mime));return;}
   try{resolve(new Uint8Array(await blob.arrayBuffer()));}
   catch(e){reject(e);}
 },mime,quality));
}
async function loadImage(file:File):Promise<{image:HTMLImageElement;objectUrl:string}>{
 const objectUrl=URL.createObjectURL(file),image=new Image();
 try{
   await new Promise<void>((resolve,reject)=>{
     image.onload=()=>resolve();image.onerror=()=>reject(Error("Cannot decode "+file.name));
     image.src=objectUrl;
   });
   imageWorkflowScale(image.naturalWidth,image.naturalHeight,2048);
   return {image,objectUrl};
 }catch(e){URL.revokeObjectURL(objectUrl);throw e;}
}
export default function WorkflowDesk({initialMode="zip-selective"}:{initialMode?:WorkflowMode}){
 const [mode,setMode]=useState<WorkflowMode>(initialMode);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [sourceArchive,setSourceArchive]=useState<Uint8Array|null>(null);
 const [archiveName,setArchiveName]=useState("");
 const [archiveIndex,setArchiveIndex]=useState<ZipInspection|null>(null);
 const [selectedNames,setSelectedNames]=useState<string[]>([]);
 const [images,setImages]=useState<File[]>([]);
 const [packFiles,setPackFiles]=useState<File[]>([]);
 const [options,setOptions]=useState<ImageWorkflowOptions>({
   format:"jpeg",maxDimension:1024,quality:.85,prefix:"image",includeManifest:true,
 });
 const imagePlan=useMemo(()=>{
   try{return {value:planImageWorkflow(images,options),error:""};}
   catch(e){return {value:null,error:message(e)};}
 },[images,options]);
 const packPlan=useMemo(()=>{try{return {value:planQuickZip(packFiles),error:""};}catch(e){return {value:null,error:message(e)};}},[packFiles]);
 const zipPlan=useMemo(()=>{
   if(!sourceArchive||!selectedNames.length)return {value:null,error:""};
   try{return {value:planSafeZipExtraction(sourceArchive,selectedNames),error:""};}
   catch(e){return {value:null,error:message(e)};}
 },[sourceArchive,selectedNames]);
 const update=<K extends keyof ImageWorkflowOptions>(key:K,value:ImageWorkflowOptions[K])=>
   setOptions(old=>({...old,[key]:value}));
 async function loadZipFile(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   setSourceArchive(null);setArchiveIndex(null);setSelectedNames([]);setArchiveName("");setStatus("");
   if(!file)return;
   setBusy(true);
   try{
     if(file.size>20_000_000)throw Error("ZIP exceeds the 20 MB input limit.");
     const buffer=new Uint8Array(await file.arrayBuffer());
     const index=inspectZip(buffer);
     setSourceArchive(buffer);setArchiveIndex(index);setArchiveName(file.name);
     setStatus("Inspected ZIP metadata locally. Choose the files you want to repackage.");
   }catch(e){setStatus("ZIP read failed: "+message(e));}
   finally{setBusy(false);}
 }
 function toggleName(name:string,on:boolean){
   setSelectedNames(prev=>{
     if(on)return prev.includes(name)?prev:[...prev,name];
     return prev.filter(item=>item!==name);
   });
 }
 async function exportSelected(){
   if(!sourceArchive||!zipPlan.value||busy)return;
   setBusy(true);setStatus("");
   try{
     const result=await safeSelectiveZip(sourceArchive,selectedNames,text=>setStatus(text));
     const saved=await exportFile("universal-box-selected-safe.zip",result.bytes);
     setStatus(saved?"Saved "+result.count+" CRC-verified files under new safe names, with a manifest. Source ZIP unchanged.":"Save cancelled.");
   }catch(e){setStatus("Selective extraction failed: "+message(e));}
   finally{setBusy(false);}
 }
 async function exportPack(){
   if(!packPlan.value||busy)return;
   setBusy(true);setStatus("");
   try{
     const zip=new JSZip();
     for(const item of packPlan.value){
       setStatus("Packing "+(item.index+1)+"/"+packPlan.value.length);
       zip.file(item.output,new Uint8Array(await packFiles[item.index].arrayBuffer()));
     }
     zip.file("universal-box-manifest.json",JSON.stringify(packPlan.value.map(({source,output,size})=>({source,output,size})),null,2));
     const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
     if(bytes.length>20_000_000)throw Error("ZIP exceeds the 20 MB output limit.");
     const saved=await exportFile("universal-box-batch.zip",bytes);
     setStatus(saved?"Saved a new ZIP containing "+packFiles.length+" selected files; originals unchanged.":"Save cancelled.");
   }catch(e){setStatus("Pack failed: "+message(e));}
   finally{setBusy(false);}
 }
 function selectImageFiles(event:ChangeEvent<HTMLInputElement>){
   setImages([...(event.target.files??[])]);event.target.value="";setStatus("");
 }
 async function exportImages(){
   if(!imagePlan.value||busy)return;
   setBusy(true);setStatus("");
   const output=new JSZip(),manifest:{source:string;output:string;inputPixels:string;outputPixels:string}[]=[];
   let canvas:HTMLCanvasElement|null=null;
   try{
     canvas=document.createElement("canvas");
     const ctx=canvas.getContext("2d");
     if(!ctx)throw Error("Canvas 2D context unavailable.");
     const mime=imageWorkflowMime(options.format);
     for(const item of imagePlan.value){
       setStatus("Resize → convert → rename: "+(item.index+1)+"/"+imagePlan.value.length);
       const {image,objectUrl}=await loadImage(images[item.index]);
       try{
         const dims=imageWorkflowScale(image.naturalWidth,image.naturalHeight,options.maxDimension);
         canvas.width=dims.width;canvas.height=dims.height;
         ctx.clearRect(0,0,dims.width,dims.height);
         if(options.format==="jpeg"){
           ctx.fillStyle="#ffffff";ctx.fillRect(0,0,dims.width,dims.height);
         }
         ctx.drawImage(image,0,0,dims.width,dims.height);
         const bytes=await blobPng(canvas,mime,options.quality);
         if(bytes.length>8_000_000)throw Error("Converted picture exceeds 8 MB: "+item.sourceName);
         output.file(item.outputName,bytes);
         manifest.push({
           source:item.sourceName,output:item.outputName,
           inputPixels:image.naturalWidth+"x"+image.naturalHeight,
           outputPixels:dims.width+"x"+dims.height,
         });
       }finally{URL.revokeObjectURL(objectUrl);}
     }
     if(options.includeManifest)
       output.file("workflow-manifest.json",JSON.stringify({steps:["resize","convert","rename","zip"],files:manifest},null,2));
     setStatus("Combining converted images into ZIP…");
     const result=await output.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
     if(result.length>20_000_000)throw Error("Batch ZIP exceeds 20 MB output limit.");
     const saved=await exportFile("universal-box-image-workflow.zip",result);
     setStatus(saved?"Saved "+manifest.length+" transformed images with no cloud upload; originals unchanged.":"Save cancelled.");
   }catch(e){setStatus("Image workflow failed: "+message(e));}
   finally{
     if(canvas){canvas.width=0;canvas.height=0;}
     setBusy(false);
   }
 }
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX · BATCH WORKFLOWS</p>
   <h2>Workflow Studio / 批处理工作室</h2>
   <p className="subtle">Two real offline workflows: safely extract selected ZIP contents into a new ZIP, or resize → convert → rename → bundle images in one operation. No hidden server calls, automatic overwrites or background directory access.</p>
   <div className="pill-row" role="group" aria-label="Batch workflow">
     {TABS.map(item=><button className={item.id===mode?"pill active-pill":"pill"} type="button" key={item.id} onClick={()=>{setMode(item.id);setStatus("");}}>{item.label}</button>)}
   </div>
   {mode==="zip-pack"&&<>
     <p className="subtle">Choose 1–50 files (up to 16 MB total), then pack into a new local ZIP with a filename manifest. Existing files are never deleted, overwritten or uploaded. Compressed media may not shrink much.</p>
     <label className="field-label" htmlFor="zip-pack-files">Select files for ZIP</label>
     <input className="field" id="zip-pack-files" type="file" multiple onChange={e=>{setPackFiles([...(e.target.files??[])]);e.target.value="";setStatus("");}}/>
     {packPlan.error&&<p role="alert" className="subtle">{packPlan.error}</p>}
     {packPlan.value&&<p className="subtle">{packPlan.value.length} files · {packPlan.value.reduce((n,f)=>n+f.size,0).toLocaleString()} bytes · Manifest included</p>}
     <button type="button" className="primary-button" disabled={!packPlan.value||busy} onClick={()=>{void exportPack();}}>{busy?"Packing…":"Save selected files as ZIP"}</button>
   </>}
   {mode==="zip-selective"&&<>
     <p className="subtle">First inspect ZIP headers; choose up to 30 normal files (12 MB declared total, 7 MB each). Reject suspicious archive paths, symlinks, encrypted entries, duplicate paths, unsupported formats and very high compression ratios. Verify decompressed sizes and CRC-32. Selected files are renamed as safe numbered filenames and exported to a NEW ZIP with a JSON name mapping. Nothing is written to arbitrary archive-supplied paths. This is not malware scanning.</p>
     <label className="field-label" htmlFor="safe-zip-file">Import ZIP (≤20 MB)</label>
     <input className="field" id="safe-zip-file" type="file" accept=".zip,application/zip" onChange={e=>{void loadZipFile(e);}}/>
     {archiveIndex&&<>
       <p className="subtle">{archiveName} · {archiveIndex.entries.length} entries · {archiveIndex.totalExpanded.toLocaleString()} declared expanded bytes.</p>
       {archiveIndex.warnings.map((w,i)=><p key={i} className="subtle" role="alert">Warning: {w}</p>)}
       <div style={{maxHeight:360,overflowY:"auto",border:"1px solid #dfe5ee",borderRadius:8,padding:10}}>
         {archiveIndex.entries.filter(e=>!e.name.endsWith("/")).slice(0,200).map((entry,i)=>{
           const disabled=busy||entry.unsafePath||entry.symlink||entry.encrypted||entry.uncompressedBytes>7_000_000;
           return <label key={i} style={{display:"block",padding:6,overflowWrap:"anywhere"}}>
             <input type="checkbox" checked={selectedNames.includes(entry.name)} disabled={disabled}
               onChange={e=>toggleName(entry.name,e.target.checked)}/>
             {" "}{entry.name} · {entry.uncompressedBytes.toLocaleString()} B
             {entry.warnings.length>0&&<span className="subtle"> · {entry.warnings.join(", ")}</span>}
           </label>;
         })}
       </div>
       {archiveIndex.entries.filter(e=>!e.name.endsWith("/")).length>200&&<p className="subtle">First 200 files shown; use the read-only ZIP Inspector for the full archive listing.</p>}
       <p className="subtle">{selectedNames.length} chosen files · {zipPlan.value?zipPlan.value.totalSize.toLocaleString()+" declared bytes":""}</p>
       {zipPlan.error&&<p className="subtle" role="alert">{zipPlan.error}</p>}
       <button className="primary-button" type="button" disabled={busy||!zipPlan.value} onClick={()=>{void exportSelected();}}>
         {busy?"Processing…":"Verify, extract & save selected ZIP"}
       </button>
     </>}
   </>}
   {mode==="image-batch"&&<>
     <p className="subtle">Choose up to 12 PNG/JPEG/WebP images, then run multiple steps automatically: proportional downscale → format conversion → numbered safe filenames → ZIP. JPEG uses a white background for transparency; PNG/WebP retain transparency where supported. Re-encoding changes metadata, but is not a forensic anonymity guarantee.</p>
     <label className="field-label" htmlFor="batch-images-input">Select 1–12 images (≤6 MB each / 30 MB total)</label>
     <input className="field" id="batch-images-input" type="file" multiple accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={selectImageFiles}/>
     {images.length>0&&<p className="subtle">{images.map(file=>file.name).join(" · ")}</p>}
     <div className="tools-pair">
       <label className="field-label">Output format
         <select className="field" value={options.format} onChange={e=>update("format",e.target.value as ImageWorkflowFormat)}>
           <option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option>
         </select>
       </label>
       <label className="field-label">Maximum width or height
         <select className="field" value={options.maxDimension} onChange={e=>update("maxDimension",Number(e.target.value) as 512|1024|2048)}>
           <option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px</option>
         </select>
       </label>
       <label className="field-label">Filename prefix
         <input className="field" maxLength={30} value={options.prefix} onChange={e=>update("prefix",e.target.value)}/>
       </label>
       <label className="field-label">JPEG/WebP quality: {Math.round(options.quality*100)}%
         <input className="field" type="range" min={.5} max={1} step={.05} value={options.quality} onChange={e=>update("quality",Number(e.target.value))}/>
       </label>
       <label><input type="checkbox" checked={options.includeManifest} onChange={e=>update("includeManifest",e.target.checked)}/> Include transformation report JSON</label>
     </div>
     {imagePlan.error&&images.length>0&&<p className="subtle" role="alert">{imagePlan.error}</p>}
     {imagePlan.value&&<p className="subtle">{imagePlan.value.length} outputs planned: {imagePlan.value.map(item=>item.outputName).join(" · ")}</p>}
     <button className="primary-button" type="button" disabled={busy||!imagePlan.value} onClick={()=>{void exportImages();}}>
       {busy?"Running workflow…":"Resize → convert → rename → save ZIP"}
     </button>
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
