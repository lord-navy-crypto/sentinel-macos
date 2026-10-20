import {type ChangeEvent,useMemo,useState} from "react";
import JSZip from "jszip";
import {exportFile} from "../lib/output";
import {editPcmWav,inspectPcmWav,type WavInfo} from "../lib/wavTools";
import {inspectZip,type ZipInspection} from "../lib/zipInspector";
import {extractPalette,iconPlan,ICON_SIZES,type PaletteColor} from "../lib/iconPalette";

export type MediaFilesMode="audio"|"zip-inspect"|"icons"|"palette";
const modes:{id:MediaFilesMode;name:string}[]=[
 {id:"audio",name:"WAV Studio / 音频剪切"},
 {id:"zip-inspect",name:"ZIP Inspector / 压缩包检查"},
 {id:"icons",name:"Icon Batch / 图标批量转换"},
 {id:"palette",name:"Color Palette / 图片取色"},
];
function errorMessage(e:unknown){return e instanceof Error?e.message:String(e);}
function mb(n:number){return (n/1_000_000).toFixed(2)+" MB";}
async function openImage(file:File):Promise<{image:HTMLImageElement;url:string}>{
 if(file.size<1||file.size>6_000_000||!/\\.(png|jpe?g|webp)$/iu.test(file.name))
   throw Error("Choose a PNG, JPEG or WebP picture within 6 MB.");
 const url=URL.createObjectURL(file);
 const image=new Image();
 try{
   await new Promise<void>((resolve,reject)=>{
     image.onload=()=>resolve();
     image.onerror=()=>reject(Error("Image cannot be decoded in this WebView."));
     image.src=url;
   });
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>8_000_000)
     throw Error("Images must be 8 million pixels or fewer.");
   return {image,url};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
function canvasPng(canvas:HTMLCanvasElement):Promise<Uint8Array>{
 return new Promise((resolve,reject)=>{
   canvas.toBlob(async blob=>{
     if(!blob||blob.type!=="image/png"){reject(Error("PNG output is unsupported in this WebView."));return;}
     try{resolve(new Uint8Array(await blob.arrayBuffer()));}catch(e){reject(e);}
   },"image/png");
 });
}
export default function MediaFilesDesk({initialMode="audio"}:{initialMode?:MediaFilesMode}){
 const [mode,setMode]=useState<MediaFilesMode>(initialMode);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [wavName,setWavName]=useState("");
 const [wavBytes,setWavBytes]=useState<Uint8Array|null>(null);
 const [wavInfo,setWavInfo]=useState<WavInfo|null>(null);
 const [start,setStart]=useState("0"),[end,setEnd]=useState("0");
 const [normalize,setNormalize]=useState(false);
 const [fade,setFade]=useState(0);
 const [zipName,setZipName]=useState("");
 const [zipResult,setZipResult]=useState<ZipInspection|null>(null);
 const [picture,setPicture]=useState<File|null>(null);
 const [palette,setPalette]=useState<PaletteColor[]>([]);
 const [paletteLimit,setPaletteLimit]=useState(6);
 const [paletteWidth,setPaletteWidth]=useState(0);
 const [paletteHeight,setPaletteHeight]=useState(0);
 const selectedWav=useMemo(()=>{
   if(!wavBytes||!wavInfo)return null;
   const from=Number(start),to=Number(end);
   if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>wavInfo.durationMs/1000+.000001)
     return null;
   return {from,to};
 },[wavBytes,wavInfo,start,end]);
 async function loadWav(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   setStatus("");setWavBytes(null);setWavInfo(null);setWavName("");
   if(!file)return;
   setBusy(true);
   try{
     if(file.size>20_000_000)throw Error("Maximum input WAV is 20 MB.");
     const bytes=new Uint8Array(await file.arrayBuffer());
     const info=inspectPcmWav(bytes);
     setWavBytes(bytes);setWavInfo(info);setWavName(file.name);
     setStart("0");setEnd((info.durationMs/1000).toFixed(3));
     setStatus("Decoded WAV structure locally. No server upload.");
   }catch(e){setStatus("WAV import failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveWav(){
   if(!wavBytes||!selectedWav||busy)return;
   setBusy(true);setStatus("");
   try{
     const output=editPcmWav(wavBytes,{
       startMs:selectedWav.from*1000,endMs:selectedWav.to*1000,normalize,fadeMs:fade,
     });
     const saved=await exportFile("universal-box-edited.wav",output.bytes);
     setStatus(saved?"Saved WAV · "+mb(output.bytes.length)+" · gain "+output.gain.toFixed(2)+"×. Original unchanged.":"Save cancelled.");
   }catch(e){setStatus("Audio export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function loadZip(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   setZipName("");setZipResult(null);setStatus("");
   if(!file)return;
   setBusy(true);
   try{
     if(file.size>20_000_000)throw Error("20 MB maximum ZIP input.");
     const bytes=new Uint8Array(await file.arrayBuffer());
     const output=inspectZip(bytes);
     setZipName(file.name);setZipResult(output);
     setStatus("ZIP directory inspected locally. No files were extracted, opened or run.");
   }catch(e){setStatus("ZIP inspection failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function copy(text:string){
   try{await navigator.clipboard.writeText(text);setStatus("Copied to clipboard.");}
   catch{setStatus("Clipboard unavailable: select text and copy manually.");}
 }
 function choosePicture(event:ChangeEvent<HTMLInputElement>){
   setPicture(event.target.files?.[0]??null);setPalette([]);setStatus("");
   event.target.value="";
 }
 async function saveIcons(){
   if(!picture||busy)return;
   setBusy(true);setStatus("");
   let url="";
   try{
     const loaded=await openImage(picture);url=loaded.url;
     const {image}=loaded,zip=new JSZip(),canvas=document.createElement("canvas");
     const ctx=canvas.getContext("2d");
     if(!ctx)throw Error("Canvas 2D context is unavailable.");
     for(const icon of iconPlan(picture.name)){
       canvas.width=icon.size;canvas.height=icon.size;
       ctx.clearRect(0,0,icon.size,icon.size);
       const factor=Math.min(icon.size/image.naturalWidth,icon.size/image.naturalHeight);
       const w=image.naturalWidth*factor,h=image.naturalHeight*factor;
       ctx.drawImage(image,(icon.size-w)/2,(icon.size-h)/2,w,h);
       zip.file(icon.filename,await canvasPng(canvas));
     }
     canvas.width=0;canvas.height=0;
     const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
     if(bytes.length>20_000_000)throw Error("ZIP exceeds 20 MB output limit.");
     const saved=await exportFile("universal-box-icons.zip",bytes);
     setStatus(saved?"Saved "+ICON_SIZES.length+" transparent PNG icon sizes in ZIP. Original image preserved.":"Save cancelled.");
   }catch(e){setStatus("Icon generator failed: "+errorMessage(e));}
   finally{if(url)URL.revokeObjectURL(url);setBusy(false);}
 }
 async function generatePalette(){
   if(!picture||busy)return;
   setBusy(true);setStatus("");setPalette([]);
   let url="";
   try{
     const loaded=await openImage(picture);url=loaded.url;
     const {image}=loaded,canvas=document.createElement("canvas");
     const factor=Math.min(1,Math.sqrt(1_000_000/(image.naturalWidth*image.naturalHeight)));
     canvas.width=Math.max(1,Math.floor(image.naturalWidth*factor));
     canvas.height=Math.max(1,Math.floor(image.naturalHeight*factor));
     const ctx=canvas.getContext("2d",{willReadFrequently:true});
     if(!ctx)throw Error("Canvas 2D context is unavailable.");
     ctx.drawImage(image,0,0,canvas.width,canvas.height);
     const p=extractPalette(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,paletteLimit);
     setPalette(p);setPaletteWidth(image.naturalWidth);setPaletteHeight(image.naturalHeight);
     setStatus("Analysed local pixels. Colours are approximate buckets, not exact design-system values.");
     canvas.width=0;canvas.height=0;
   }catch(e){setStatus("Palette extraction failed: "+errorMessage(e));}
   finally{if(url)URL.revokeObjectURL(url);setBusy(false);}
 }
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX · MEDIA & FILES</p>
   <h2>Audio, archive & image utilities / 媒体与文件工具</h2>
   <p className="subtle">No account, subscription, forced cloud upload or automatic file modifications. Processing is local. Tools have explicit format/size limits to prevent runaway memory use.</p>
   <div className="pill-row" role="group" aria-label="Media and files tool">
     {modes.map(item=><button type="button" key={item.id} className={item.id===mode?"pill active-pill":"pill"} onClick={()=>{setMode(item.id);setStatus("");}}>{item.name}</button>)}
   </div>
   {mode==="audio"&&<>
     <p className="subtle">Trim, normalize and add short edge fades to local uncompressed <strong>16-bit PCM WAV</strong> (mono/stereo, 8–192 kHz). Other audio codecs, MP3 and 24/32-bit WAV aren't supported in this version. Normalization is conservatively limited to 4× gain and skips nearly silent tracks.</p>
     <label className="field-label" htmlFor="media-wav">Select WAV file (≤20 MB)</label>
     <input className="field" id="media-wav" type="file" accept=".wav,audio/wav,audio/x-wav" onChange={e=>{void loadWav(e);}}/>
     {wavInfo&&<>
       <p className="subtle">{wavName} · {wavInfo.channels} channel(s) · {wavInfo.sampleRate.toLocaleString()} Hz · {(wavInfo.durationMs/1000).toFixed(3)} seconds · {mb(wavInfo.dataBytes)} PCM</p>
       <div className="tools-pair">
         <label className="field-label">Start (seconds)
           <input className="field" type="number" min={0} max={wavInfo.durationMs/1000} step=".001" value={start} onChange={e=>setStart(e.target.value)}/>
         </label>
         <label className="field-label">End (seconds)
           <input className="field" type="number" min={0} max={wavInfo.durationMs/1000} step=".001" value={end} onChange={e=>setEnd(e.target.value)}/>
         </label>
         <label className="field-label">Edge fade (0–1500 ms)
           <input className="field" type="number" min={0} max={1500} step={50} value={fade} onChange={e=>setFade(Number(e.target.value))}/>
         </label>
       </div>
       <label><input type="checkbox" checked={normalize} onChange={e=>setNormalize(e.target.checked)}/> Normalize toward −0.45 dBFS (max 4×)</label>
       {!selectedWav&&<p role="alert" className="subtle">Select a non-empty range within the audio duration.</p>}
       <div className="actions"><button type="button" className="primary-button" disabled={!selectedWav||busy} onClick={()=>{void saveWav();}}>{busy?"Processing…":"Save edited WAV"}</button></div>
     </>}
   </>}
   {mode==="zip-inspect"&&<>
     <p className="subtle">Read ZIP metadata without decompressing entries. Detect dangerous file paths, symbolic links, encryption, unusual size/ratio and unsupported ZIP compression. It is <strong>not</strong> a malware scanner and cannot guarantee that archives are safe to extract. ZIP64 and split archives are unsupported.</p>
     <label className="field-label" htmlFor="media-zip">Inspect .zip (≤20 MB)</label>
     <input className="field" id="media-zip" type="file" accept=".zip,application/zip" onChange={e=>{void loadZip(e);}}/>
     {zipResult&&<>
       <p className="subtle">{zipName} · {zipResult.entries.length} entries · declared compressed {mb(zipResult.totalCompressed)} · declared expanded {mb(zipResult.totalExpanded)}</p>
       {zipResult.warnings.length>0?<div role="alert">{zipResult.warnings.map((w,i)=><p key={i} className="subtle"><strong>Warning:</strong> {w}</p>)}</div>:<p className="subtle">No flagged metadata anomalies detected. This does not prove the contents are safe.</p>}
       <div style={{overflowX:"auto",maxHeight:410,overflowY:"auto"}}>
         <table style={{width:"100%",borderCollapse:"collapse"}}>
           <thead><tr><th style={{textAlign:"left",padding:8}}>Entry</th><th style={{textAlign:"left",padding:8}}>Expanded</th><th style={{textAlign:"left",padding:8}}>Checks</th></tr></thead>
           <tbody>{zipResult.entries.slice(0,150).map((e,i)=><tr key={i}>
             <td style={{padding:8,borderTop:"1px solid #dfe5ee",overflowWrap:"anywhere"}}>{e.name}</td>
             <td style={{padding:8,borderTop:"1px solid #dfe5ee"}}>{e.uncompressedBytes.toLocaleString()} B</td>
             <td style={{padding:8,borderTop:"1px solid #dfe5ee"}}>{e.warnings.length?e.warnings.join(" · "):"No flagged metadata"}</td>
           </tr>)}</tbody>
         </table>
       </div>
       {zipResult.entries.length>150&&<p className="subtle">Preview first 150 entries; full report includes all entries.</p>}
       <div className="actions">
         <button className="primary-button" type="button" onClick={()=>{void exportFile("universal-box-zip-report.json",JSON.stringify(zipResult,null,2)).then(saved=>setStatus(saved?"Saved ZIP report.":"Save cancelled.")).catch(e=>setStatus(errorMessage(e)));}}>Save JSON report</button>
         <button className="secondary-button" type="button" onClick={()=>{void copy(JSON.stringify(zipResult,null,2));}}>Copy report</button>
       </div>
     </>}
   </>}
   {(mode==="icons"||mode==="palette")&&<>
     <p className="subtle">{mode==="icons"?"Create seven square transparent PNG icons (16, 32, 48, 64, 128, 256, 512 px) from a local picture. Fit content proportionally and ZIP the files; no proprietary design app needed.":"Extract approximate most frequent colours from a local photo. Transparent pixels are ignored and samples are grouped into nearby RGB buckets."} PNG, JPEG or WebP only (≤6 MB and 8 million pixels).</p>
     <label className="field-label" htmlFor="media-photo">Choose source image</label>
     <input className="field" id="media-photo" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={choosePicture}/>
     {picture&&<p className="subtle">{picture.name} · {mb(picture.size)}</p>}
     {mode==="icons"?
       <button className="primary-button" disabled={!picture||busy} type="button" onClick={()=>{void saveIcons();}}>{busy?"Encoding PNG ZIP…":"Save seven icon sizes as ZIP"}</button>:
       <>
         <label className="field-label">Top colours (1–12)
           <input className="field" type="number" min={1} max={12} step={1} value={paletteLimit} onChange={e=>{setPaletteLimit(Number(e.target.value));setPalette([]);}}/>
         </label>
         <div className="actions"><button className="primary-button" disabled={!picture||busy} type="button" onClick={()=>{void generatePalette();}}>{busy?"Sampling pixels…":"Extract colours"}</button></div>
         {palette.length>0&&<>
           <p className="subtle">Source {paletteWidth} × {paletteHeight}px · approximate sampled pixel share</p>
           <div className="tool-grid">{palette.map((c,i)=><div key={c.hex+i} style={{padding:12,border:"1px solid #dfe5ee",borderRadius:8}}>
             <div style={{backgroundColor:c.hex,height:56,borderRadius:6,border:"1px solid #ccd5df"}}/>
             <p><strong>{c.hex}</strong> · {(c.fraction*100).toFixed(1)}%</p>
           </div>)}</div>
           <button className="secondary-button" type="button" onClick={()=>{void copy(palette.map(x=>x.hex).join("\n"));}}>Copy HEX values</button>
         </>}
       </>}
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
