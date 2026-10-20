import {type ChangeEvent,useEffect,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {tableToCsv,tableToJson,type DataTable} from "../lib/tableTools";
import {csvToXlsxTable,tableToXlsx,xlsxToTable} from "../lib/spreadsheetInterop";
import {diffImages,blendImages,type ImageDiffResult} from "../lib/imageDiff";
import {encodeHtmlEntities,decodeHtmlEntities,normalizeText} from "../lib/textCodec";

export type FreeFormatsMode="spreadsheet"|"image-diff"|"text-codec";
const modes:{id:FreeFormatsMode;name:string}[]=[
 {id:"spreadsheet",name:"Excel XLSX ↔ CSV"},
 {id:"image-diff",name:"Image Difference / 图片比较"},
 {id:"text-codec",name:"HTML Entities / Unicode"},
];
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const mb=(n:number)=>(n/1_000_000).toFixed(2)+" MB";

async function loadPixels(file:File):Promise<{width:number;height:number;pixels:Uint8ClampedArray}>{
 if(file.size<1||file.size>6_000_000||!/\.((jpe?g)|(png)|(webp))$/iu.test(file.name))
   throw Error("Choose PNG, JPEG or WebP files up to 6 MB each.");
 const objectUrl=URL.createObjectURL(file),image=new Image();
 try{
   await new Promise<void>((resolve,reject)=>{
     image.onload=()=>resolve();image.onerror=()=>reject(Error("Cannot decode "+file.name));
     image.src=objectUrl;
   });
   const width=image.naturalWidth,height=image.naturalHeight;
   if(!width||!height||width*height>4_000_000)
     throw Error("Images must contain 1–4 million pixels.");
   const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d",{willReadFrequently:true});
   if(!ctx)throw Error("This WebView does not support canvas pixels.");
   ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
   ctx.drawImage(image,0,0,width,height);
   const pixels=ctx.getImageData(0,0,width,height).data;
   canvas.width=0;canvas.height=0;
   return {width,height,pixels};
 }finally{URL.revokeObjectURL(objectUrl);}
}
async function pngBytes(width:number,height:number,pixels:Uint8ClampedArray):Promise<Uint8Array>{
 const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw Error("Canvas output is unavailable.");
 const imageData=ctx.createImageData(width,height);imageData.data.set(pixels);
 ctx.putImageData(imageData,0,0);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>{
   b&&b.type==="image/png"?resolve(b):reject(Error("PNG encoding unavailable."));
 },"image/png"));
 canvas.width=0;canvas.height=0;
 if(blob.size>20_000_000)throw Error("PNG output exceeds 20 MB.");
 return new Uint8Array(await blob.arrayBuffer());
}
export default function FreeFormatsDesk({initialMode="spreadsheet"}:{initialMode?:FreeFormatsMode}){
 const [mode,setMode]=useState<FreeFormatsMode>(initialMode);
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [csv,setCsv]=useState('Name,ID,Score\n"李华",00123,99\n"Grace Hopper",00007,100');
 const [sheet,setSheet]=useState<{table:DataTable;sheetName:string;sheetCount:number}|null>(null);
 const csvParsed=useMemo(()=>{
   try{return {value:csvToXlsxTable(csv),error:""};}
   catch(e){return {value:null,error:errorMessage(e)};}
 },[csv]);
 const [photoA,setPhotoA]=useState<File|null>(null),[photoB,setPhotoB]=useState<File|null>(null);
 const [tolerance,setTolerance]=useState(12),[diffMode,setDiffMode]=useState<"mask"|"blend">("mask"),[blend,setBlend]=useState(.5);
 const [imageResult,setImageResult]=useState<{bytes:Uint8Array;stats:ImageDiffResult;width:number;height:number}|null>(null);
 const [preview,setPreview]=useState("");
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 const [textSource,setTextSource]=useState("<div title=\"Hello & welcome\">中文</div>");
 const [textMode,setTextMode]=useState<"encode"|"decode"|"NFC"|"NFKC">("encode");
 const textResult=useMemo(()=>{
   try{
     const value=textMode==="encode"?encodeHtmlEntities(textSource):textMode==="decode"
       ?decodeHtmlEntities(textSource):normalizeText(textSource,textMode);
     return {value,error:""};
   }catch(e){return {value:"",error:errorMessage(e)};}
 },[textSource,textMode]);
 async function importCsv(event:ChangeEvent<HTMLInputElement>){
   const f=event.target.files?.[0];event.target.value="";
   if(!f)return;
   try{
     if(f.size>500_000||!/\.csv$/iu.test(f.name))throw Error("Import CSV ≤500 KB.");
     setCsv(await f.text());setStatus("CSV imported locally. No upload.");
   }catch(e){setStatus("CSV import failed: "+errorMessage(e));}
 }
 async function importXlsx(event:ChangeEvent<HTMLInputElement>){
   const f=event.target.files?.[0];event.target.value="";setSheet(null);
   if(!f)return;
   setBusy(true);setStatus("");
   try{
     if(!/\.xlsx$/iu.test(f.name)||f.size>4_000_000)throw Error("Choose .xlsx file ≤4 MB.");
     const output=await xlsxToTable(new Uint8Array(await f.arrayBuffer()));
     setSheet(output);setStatus("Imported first worksheet '"+output.sheetName+"' locally.");
   }catch(e){setStatus("XLSX read failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function saveXlsx(){
   if(!csvParsed.value||busy)return;
   setBusy(true);setStatus("");
   try{
     const bytes=await tableToXlsx(csvParsed.value);
     const saved=await exportFile("universal-box-data.xlsx",bytes);
     setStatus(saved?"Saved local XLSX ("+mb(bytes.length)+"). Values remain plain text; no formulas executed.":"Save cancelled.");
   }catch(e){setStatus("XLSX export failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function exportSheet(format:"csv"|"json"){
   if(!sheet)return;
   try{
     const bytes=format==="csv"?tableToCsv(sheet.table):tableToJson(sheet.table);
     const saved=await exportFile("universal-box-imported-sheet."+format,bytes);
     setStatus(saved?"Exported first worksheet as "+format.toUpperCase()+".":"Save cancelled.");
   }catch(e){setStatus("Export failed: "+errorMessage(e));}
 }
 function setPhoto(which:"a"|"b",event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0]??null;event.target.value="";
   if(which==="a")setPhotoA(file);else setPhotoB(file);
   setImageResult(null);setPreview("");setStatus("");
 }
 async function compare(){
   if(!photoA||!photoB||busy)return;
   setBusy(true);setStatus("");setImageResult(null);setPreview("");
   try{
     const [a,b]=await Promise.all([loadPixels(photoA),loadPixels(photoB)]);
     if(a.width!==b.width||a.height!==b.height)
       throw Error("Pixel comparison needs identical image dimensions. Resize them first.");
     const stats=diffImages(a.pixels,b.pixels,a.width,a.height,tolerance);
     const pixels=diffMode==="mask"?stats.mask:blendImages(a.pixels,b.pixels,a.width,a.height,blend);
     const bytes=await pngBytes(a.width,a.height,pixels);
     const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"image/png"}));
     setPreview(url);setImageResult({bytes,stats,width:a.width,height:a.height});
     setStatus("Compared two pictures locally. Diff counts reflect canvas-decoded pixels, not metadata.");
   }catch(e){setStatus("Comparison failed: "+errorMessage(e));}
   finally{setBusy(false);}
 }
 async function copy(value:string){
   try{await navigator.clipboard.writeText(value);setStatus("Copied.");}
   catch{setStatus("Clipboard unavailable. Select preview and copy manually.");}
 }
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX · FREE FORMATS LAB</p>
   <h2>Spreadsheets, visual comparison & text codes</h2>
   <p className="subtle">Three real offline utilities with no subscription, account, watermark, forced cloud upload or background file access. All exports create new user-selected files.</p>
   <div className="pill-row" role="group" aria-label="Free formats laboratory">
     {modes.map(item=><button key={item.id} type="button" className={mode===item.id?"pill active-pill":"pill"} onClick={()=>{setMode(item.id);setStatus("");}}>{item.name}</button>)}
   </div>
   {mode==="spreadsheet"&&<>
     <p className="subtle">Basic Excel XLSX interoperability: convert CSV into a standard single-sheet XLSX, or inspect the first sheet of an XLSX and export its cached values to CSV or JSON. Supports 1,000 data rows × 50 columns, 4 MB XLSX files. CSV text remains text (including leading zeroes and strings beginning with "="). No macro execution, formula recalculation, charts, formatting, merged layout or sheet editing.</p>
     <label className="field-label" htmlFor="excel-csv-file">Import CSV (≤500 KB)</label>
     <input className="field" id="excel-csv-file" type="file" accept=".csv,text/csv" onChange={e=>{void importCsv(e);}}/>
     <label className="field-label" htmlFor="excel-csv">CSV → XLSX source</label>
     <textarea className="field text-editor" id="excel-csv" rows={7} value={csv} maxLength={500000} onChange={e=>setCsv(e.target.value)}/>
     {csvParsed.error?<p className="subtle" role="alert">{csvParsed.error}</p>:csvParsed.value&&<>
       <p className="subtle">{csvParsed.value.rows.length} rows, {csvParsed.value.headers.length} columns ready to write.</p>
       <button className="primary-button" type="button" disabled={busy} onClick={()=>{void saveXlsx();}}>{busy?"Converting…":"Create and save XLSX"}</button>
     </>}
     <h3>Open Excel file → CSV / JSON</h3>
     <label className="field-label" htmlFor="excel-xlsx-file">Select .xlsx (≤4 MB)</label>
     <input className="field" id="excel-xlsx-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{void importXlsx(e);}}/>
     {sheet&&<>
       <p className="subtle">First sheet: {sheet.sheetName} · {sheet.table.rows.length} data rows · {sheet.table.headers.length} columns
         {sheet.sheetCount>1?" · "+sheet.sheetCount+" total worksheets (only first imported)":""}
       </p>
       <div style={{overflow:"auto",maxHeight:320}}>
         <table style={{width:"100%",borderCollapse:"collapse"}}>
           <thead><tr>{sheet.table.headers.slice(0,15).map((h,i)=><th key={i} style={{padding:8,textAlign:"left"}}>{h}</th>)}</tr></thead>
           <tbody>{sheet.table.rows.slice(0,15).map((row,i)=><tr key={i}>{row.slice(0,15).map((cell,j)=><td key={j} style={{padding:8,borderTop:"1px solid #ddd",overflowWrap:"anywhere"}}>{cell}</td>)}</tr>)}</tbody>
         </table>
       </div>
       {(sheet.table.rows.length>15||sheet.table.headers.length>15)&&<p className="subtle">Preview limited to 15 × 15; exported values include the complete imported first sheet.</p>}
       <div className="actions">
         <button className="secondary-button" type="button" onClick={()=>{void exportSheet("csv");}}>Save CSV</button>
         <button className="secondary-button" type="button" onClick={()=>{void exportSheet("json");}}>Save JSON</button>
       </div>
       <p className="subtle">Formulas are not calculated. Only existing cached values can be read. Date-formatted numbers may appear as Excel serial values.</p>
     </>}
   </>}
   {mode==="image-diff"&&<>
     <p className="subtle">Compare PNG, JPEG or WebP images pixel by pixel, identify changed areas or create an adjustable overlay. Both images must have identical dimensions, max 4 million pixels and 6 MB each. Transparent areas are composited on white. Different colour profiles, re-encoding and antialiasing may create differences.</p>
     <div className="tools-pair">
       <label className="field-label">Original picture A
         <input className="field" type="file" accept=".png,.jpg,.jpeg,.webp,image/*" onChange={e=>setPhoto("a",e)}/>
       </label>
       <label className="field-label">Comparison picture B
         <input className="field" type="file" accept=".png,.jpg,.jpeg,.webp,image/*" onChange={e=>setPhoto("b",e)}/>
       </label>
     </div>
     <p className="subtle">A: {photoA?.name??"(not selected)"} · B: {photoB?.name??"(not selected)"}</p>
     <div className="tools-pair">
       <label className="field-label">Output
         <select className="field" value={diffMode} onChange={e=>{setDiffMode(e.target.value as "mask"|"blend");setImageResult(null);setPreview("");}}>
           <option value="mask">Highlight differences in pink</option><option value="blend">Overlay both images</option>
         </select>
       </label>
       <label className="field-label">Per-pixel change threshold: {tolerance}
         <input className="field" type="range" min={0} max={100} value={tolerance} onChange={e=>{setTolerance(Number(e.target.value));setImageResult(null);setPreview("");}}/>
       </label>
       {diffMode==="blend"&&<label className="field-label">Second-image weight: {Math.round(blend*100)}%
         <input className="field" type="range" min={0} max={1} step={.05} value={blend} onChange={e=>{setBlend(Number(e.target.value));setImageResult(null);setPreview("");}}/>
       </label>}
     </div>
     <button type="button" className="primary-button" disabled={!photoA||!photoB||busy} onClick={()=>{void compare();}}>{busy?"Reading and comparing…":"Compare locally"}</button>
     {imageResult&&<>
       <p className="subtle">{imageResult.width} × {imageResult.height} pixels · {imageResult.stats.changed.toLocaleString()} of {imageResult.stats.total.toLocaleString()} pixels differ ({(imageResult.stats.fraction*100).toFixed(2)}%) · mean maximum-channel change {imageResult.stats.meanDifference.toFixed(2)}/255</p>
       {preview&&<img src={preview} alt="Locally generated pixel difference mask or blended overlay" style={{display:"block",maxWidth:"100%",maxHeight:460,objectFit:"contain",border:"1px solid #cbd5e1",borderRadius:8}}/>}
       <button className="secondary-button" type="button" onClick={()=>{
         void exportFile("universal-box-image-"+(diffMode==="mask"?"diff":"overlay")+".png",imageResult.bytes)
           .then(saved=>setStatus(saved?"Saved a new PNG; originals unchanged.":"Save cancelled."))
           .catch(e=>setStatus(errorMessage(e)));
       }}>Save comparison PNG</button>
     </>}
   </>}
   {mode==="text-codec"&&<>
     <p className="subtle">Convert common HTML entities or normalize Unicode locally. Text is never rendered as active HTML. Decoding supports five XML entities, selected common HTML names and numeric character references; unfamiliar named entities are left unchanged. Unicode NFKC can deliberately change typographic and compatibility characters, so review its output.</p>
     <label className="field-label" htmlFor="entity-source">Text input</label>
     <textarea className="field text-editor" id="entity-source" rows={7} maxLength={100000} value={textSource} onChange={e=>setTextSource(e.target.value)}/>
     <label className="field-label">Transform
       <select className="field" value={textMode} onChange={e=>setTextMode(e.target.value as "encode"|"decode"|"NFC"|"NFKC")}>
         <option value="encode">Encode common HTML-sensitive characters</option>
         <option value="decode">Decode common HTML entities</option>
         <option value="NFC">Unicode NFC normalization</option>
         <option value="NFKC">Unicode NFKC compatibility normalization</option>
       </select>
     </label>
     {textResult.error?<p className="subtle" role="alert">{textResult.error}</p>:<>
       <label className="field-label" htmlFor="entity-result">Result (plain text)</label>
       <textarea className="field text-editor" id="entity-result" readOnly rows={7} value={textResult.value.slice(0,20000)}/>
       {textResult.value.length>20000&&<p className="subtle">Preview shortened. Export/copy includes complete output.</p>}
       <div className="actions">
         <button className="secondary-button" type="button" onClick={()=>{void copy(textResult.value);}}>Copy complete result</button>
         <button className="primary-button" type="button" onClick={()=>{
           void exportFile("universal-box-text-codec.txt",textResult.value)
             .then(saved=>setStatus(saved?"Saved TXT.":"Save cancelled."))
             .catch(e=>setStatus(errorMessage(e)));
         }}>Save TXT</button>
       </div>
     </>}
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
