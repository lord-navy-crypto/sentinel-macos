import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {
  LINE_DEFAULTS,batchLines,convertSubtitles,inspectUrl,
  type LineOptions,type SubtitleFormat,
} from "../lib/universalLab";
import {contactSheetLayout} from "../lib/contactSheet";

export type UniversalLabMode="lines"|"subtitles"|"photo-sheet"|"url-inspector";
const tabs:{id:UniversalLabMode;label:string}[]=[
  {id:"lines",label:"Batch text / 文本批处理"},
  {id:"subtitles",label:"SRT ↔ VTT 字幕"},
  {id:"photo-sheet",label:"Photo contact sheet / 图片拼版"},
  {id:"url-inspector",label:"URL inspector / 参数解析"},
];
function message(error:unknown){return error instanceof Error?error.message:String(error);}
export default function UniversalLabDesk({initialMode="lines"}:{initialMode?:UniversalLabMode}){
 const [mode,setMode]=useState<UniversalLabMode>(initialMode);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [textSource,setTextSource]=useState("Alpha\nBeta\nAlpha\nGamma");
 const [lineOptions,setLineOptions]=useState<LineOptions>(LINE_DEFAULTS);
 const lineResult=useMemo(()=>{
   try{return {value:batchLines(textSource,lineOptions),error:""};}
   catch(error){return {value:null,error:message(error)};}
 },[textSource,lineOptions]);
 const [subtitleSource,setSubtitleSource]=useState("1\n00:00:01,000 --> 00:00:03,500\nHello world!\n\n2\n00:00:04,000 --> 00:00:06,500\nStudy together.");
 const [subtitleFrom,setSubtitleFrom]=useState<SubtitleFormat>("srt");
 const [subtitleTo,setSubtitleTo]=useState<SubtitleFormat>("vtt");
 const [shift,setShift]=useState("0");
 const subtitleResult=useMemo(()=>{
   try{
     if(!/^-?\d+$/u.test(shift.trim()))throw new Error("Shift must be a whole number of milliseconds.");
     return {value:convertSubtitles(subtitleSource,subtitleFrom,subtitleTo,Number(shift)),error:""};
   }catch(error){return {value:null,error:message(error)};}
 },[subtitleSource,subtitleFrom,subtitleTo,shift]);
 const [urlSource,setUrlSource]=useState("https://example.org/?utm_source=newsletter&id=123&id=456");
 const urlResult=useMemo(()=>{
   try{return {value:inspectUrl(urlSource),error:""};}
   catch(error){return {value:null,error:message(error)};}
 },[urlSource]);
 const [images,setImages]=useState<File[]>([]);
 const [columns,setColumns]=useState(3);
 const [cellWidth,setCellWidth]=useState(300);
 const [cellHeight,setCellHeight]=useState(220);
 const [margin,setMargin]=useState(12);
 const [captions,setCaptions]=useState(true);
 const [imageFormat,setImageFormat]=useState<"png"|"jpeg">("png");

 const geometry=useMemo(()=>{
   try{return {value:contactSheetLayout({
     count:images.length,columns,cellWidth,cellHeight,margin,captions,
   }),error:""};}
   catch(error){return {value:null,error:message(error)};}
 },[images,columns,cellWidth,cellHeight,margin,captions]);
 const updateLine=(key:keyof LineOptions,value:LineOptions[keyof LineOptions])=>
   setLineOptions(old=>({...old,[key]:value}));
 async function copy(text:string){
   try{await navigator.clipboard.writeText(text);setStatus("Copied locally to clipboard.");}
   catch{setStatus("Clipboard unavailable. Select and copy the preview manually.");}
 }
 async function saveText(filename:string,text:string){
   try{const saved=await exportFile(filename,text);setStatus(saved?"Saved locally. Original input unchanged.":"Save cancelled.");}
   catch(error){setStatus("Export failed: "+message(error));}
 }
 async function importSubtitles(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   if(!file)return;
   if(file.size>2_000_000){setStatus("Maximum subtitle input is 2 MB.");return;}
   const ext=file.name.toLowerCase().endsWith(".vtt")?"vtt":file.name.toLowerCase().endsWith(".srt")?"srt":null;
   if(!ext){setStatus("Choose a .srt or .vtt file.");return;}
   try{setSubtitleSource(await file.text());setSubtitleFrom(ext);setSubtitleTo(ext==="srt"?"vtt":"srt");setStatus("Imported subtitles locally.");}
   catch(error){setStatus("Could not read subtitle file: "+message(error));}
 }
 function chooseImages(event:ChangeEvent<HTMLInputElement>){
   const selected=[...(event.target.files??[])];event.target.value="";
   setImages(selected);
   setStatus(selected.length>12?"Select at most 12 pictures.":"");
 }
 async function generateSheet(){
   if(busy||!geometry.value)return;
   setBusy(true);setStatus("");
   const urls:string[]=[];
   try{
     const {width,height,slots}=geometry.value;
     if(images.some(file=>file.size<1||file.size>8_000_000)||images.reduce((sum,file)=>sum+file.size,0)>24_000_000)
       throw new Error("Images must be 1 byte–8 MB each and 24 MB combined.");
     if(images.some(file=>!/\.(png|jpe?g|webp)$/iu.test(file.name)))
       throw new Error("Only PNG, JPEG and WebP images are supported.");
     const canvas=document.createElement("canvas");
     canvas.width=width;canvas.height=height;
     const ctx=canvas.getContext("2d");
     if(!ctx)throw new Error("Canvas is unavailable.");
     ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
     for(let i=0;i<images.length;i++){
       const objectUrl=URL.createObjectURL(images[i]);urls.push(objectUrl);
       const image=new Image();
       await new Promise<void>((resolve,reject)=>{
         image.onload=()=>resolve();image.onerror=()=>reject(new Error("Cannot decode "+images[i].name));image.src=objectUrl;
       });
       if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>8_000_000)
         throw new Error(images[i].name+" exceeds the 8-million-pixel decode limit. Resize it first.");
       const slot=slots[i],scale=Math.min(slot.width/image.naturalWidth,slot.height/image.naturalHeight);
       const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
       ctx.fillStyle="#edf2f7";ctx.fillRect(slot.x,slot.y,slot.width,slot.height);
       ctx.drawImage(image,slot.x+(slot.width-w)/2,slot.y+(slot.height-h)/2,w,h);
       if(captions){
         ctx.fillStyle="#172a41";ctx.font="15px system-ui,sans-serif";
         const label=images[i].name.length>48?images[i].name.slice(0,45)+"…":images[i].name;
         ctx.fillText(label,slot.x,slot.labelY,slot.width);
       }
       URL.revokeObjectURL(objectUrl);urls.pop();
     }
     const mime=imageFormat==="png"?"image/png":"image/jpeg";
     const blob=await new Promise<Blob>((resolve,reject)=>
       canvas.toBlob(out=>out?resolve(out):reject(new Error("Canvas encoding failed.")),mime,imageFormat==="jpeg"?.88:undefined));
     if(blob.type!==mime)throw new Error("This WebView cannot encode the selected image format.");
     if(blob.size>20_000_000)throw new Error("The contact sheet exceeds the 20 MB save limit.");
     const saved=await exportFile("universal-box-contact-sheet."+(imageFormat==="jpeg"?"jpg":"png"),new Uint8Array(await blob.arrayBuffer()));
     setStatus(saved?"Saved an offline "+width+" × "+height+" image contact sheet. Originals unchanged.":"Save cancelled.");
     canvas.width=0;canvas.height=0;
   }catch(error){setStatus("Contact sheet failed: "+message(error));}
   finally{urls.forEach(url=>URL.revokeObjectURL(url));setBusy(false);}
 }
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX LAB · LOCAL UTILITIES</p>
   <h2>Universal Box Lab / 更多免费小工具</h2>
   <p className="subtle">Four offline utilities without forced accounts, subscriptions, quotas from a remote service, background uploads or changing originals. Local memory and input safety limits still apply.</p>
   <div className="pill-row" role="group" aria-label="Universal Box Lab tool">
     {tabs.map(tab=><button type="button" key={tab.id} className={tab.id===mode?"pill active-pill":"pill"}
       onClick={()=>{setMode(tab.id);setStatus("");}}>{tab.label}</button>)}
   </div>
   {mode==="lines"&&<>
     <p className="subtle">Deduplicate, sort, trim, change case and wrap up to 20,000 copied text lines. Existing input is never modified; optional prefix/suffix apply to every retained line.</p>
     <label className="field-label" htmlFor="line-source">Source text</label>
     <textarea id="line-source" className="field text-editor" rows={8} maxLength={200000} value={textSource} onChange={e=>setTextSource(e.target.value)}/>
     <div className="tools-pair">
       <label><input type="checkbox" checked={lineOptions.trim} onChange={e=>updateLine("trim",e.target.checked)}/> Trim each line</label>
       <label><input type="checkbox" checked={lineOptions.removeBlank} onChange={e=>updateLine("removeBlank",e.target.checked)}/> Remove empty lines</label>
       <label><input type="checkbox" checked={lineOptions.unique} onChange={e=>updateLine("unique",e.target.checked)}/> Deduplicate exact lines</label>
       <label className="field-label">Sort
         <select className="field" value={lineOptions.sort} onChange={e=>updateLine("sort",e.target.value as LineOptions["sort"])}>
           <option value="none">Keep order</option><option value="ascending">A → Z</option><option value="descending">Z → A</option>
         </select>
       </label>
       <label className="field-label">Case
         <select className="field" value={lineOptions.caseMode} onChange={e=>updateLine("caseMode",e.target.value as LineOptions["caseMode"])}>
           <option value="none">Keep case</option><option value="lower">Lowercase</option><option value="upper">Uppercase</option>
         </select>
       </label>
       <label className="field-label">Prefix <input className="field" maxLength={100} value={lineOptions.prefix} onChange={e=>updateLine("prefix",e.target.value)}/></label>
       <label className="field-label">Suffix <input className="field" maxLength={100} value={lineOptions.suffix} onChange={e=>updateLine("suffix",e.target.value)}/></label>
     </div>
     {lineResult.error?<p role="alert" className="subtle">{lineResult.error}</p>:lineResult.value&&<>
       <p className="subtle">{lineResult.value.before} input lines → {lineResult.value.after} output lines.</p>
       <label className="field-label" htmlFor="line-result">Result</label>
       <textarea id="line-result" className="field text-editor" rows={8} readOnly value={lineResult.value.text.slice(0,20000)}/>
       {lineResult.value.text.length>20000&&<p className="subtle">Preview shortened. Save/copy includes complete output.</p>}
       <div className="actions">
         <button className="primary-button" type="button" onClick={()=>{void saveText("universal-box-lines.txt",lineResult.value!.text);}}>Save TXT</button>
         <button className="secondary-button" type="button" onClick={()=>{void copy(lineResult.value!.text);}}>Copy result</button>
       </div>
     </>}
   </>}
   {mode==="subtitles"&&<>
     <p className="subtle">Convert subtitle timing between SRT and WebVTT or shift every cue by a fixed number of milliseconds. Keeps multiline text and non-ASCII characters. Complex WebVTT styles, cue positioning and regions are rejected rather than silently removed. This does not transcribe audio or video.</p>
     <label className="field-label" htmlFor="subtitle-picker">Import .srt or .vtt file (≤2 MB)</label>
     <input id="subtitle-picker" className="field" type="file" accept=".srt,.vtt,text/vtt" onChange={e=>{void importSubtitles(e);}}/>
     <div className="tools-pair">
       <label className="field-label">From
         <select className="field" value={subtitleFrom} onChange={e=>setSubtitleFrom(e.target.value as SubtitleFormat)}>
           <option value="srt">SubRip SRT</option><option value="vtt">WebVTT</option>
         </select>
       </label>
       <label className="field-label">To
         <select className="field" value={subtitleTo} onChange={e=>setSubtitleTo(e.target.value as SubtitleFormat)}>
           <option value="srt">SubRip SRT</option><option value="vtt">WebVTT</option>
         </select>
       </label>
       <label className="field-label">Shift all cues (milliseconds; negative = earlier)
         <input className="field" type="number" min={-3600000} max={3600000} step={100} value={shift} onChange={e=>setShift(e.target.value)}/>
       </label>
     </div>
     <label className="field-label" htmlFor="subtitle-source">Subtitle source</label>
     <textarea id="subtitle-source" className="field text-editor" rows={9} maxLength={2000000} value={subtitleSource} onChange={e=>setSubtitleSource(e.target.value)}/>
     {subtitleResult.error?<p role="alert" className="subtle">{subtitleResult.error}</p>:subtitleResult.value&&<>
       <p className="subtle">{subtitleResult.value.cues} cues validated.</p>
       <label className="field-label" htmlFor="subtitle-result">Converted preview</label>
       <textarea id="subtitle-result" className="field text-editor" rows={9} readOnly value={subtitleResult.value.text.slice(0,20000)}/>
       {subtitleResult.value.text.length>20000&&<p className="subtle">Preview shortened; saved content includes all cues.</p>}
       <div className="actions">
         <button className="primary-button" type="button" onClick={()=>{void saveText("universal-box-subtitles."+subtitleTo,subtitleResult.value!.text);}}>Save {subtitleTo.toUpperCase()}</button>
         <button className="secondary-button" type="button" onClick={()=>{void copy(subtitleResult.value!.text);}}>Copy</button>
       </div>
     </>}
   </>}
   {mode==="photo-sheet"&&<>
     <p className="subtle">Combine 1–12 local PNG/JPEG/WebP pictures into a labelled grid. White/grey background, keep image proportions, no upload. Very large originals must be resized in the existing Image Desk first.</p>
     <label className="field-label" htmlFor="contact-images">Select 1–12 images (8 MB each, 24 MB combined)</label>
     <input id="contact-images" className="field" type="file" multiple accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={chooseImages}/>
     {images.length>0&&<p className="subtle">{images.map(f=>f.name).join(" · ")}</p>}
     <div className="tools-pair">
       <label className="field-label">Columns (1–6)
         <input className="field" type="number" min={1} max={6} value={columns} onChange={e=>setColumns(Number(e.target.value))}/>
       </label>
       <label className="field-label">Image cell width
         <input className="field" type="number" min={120} max={700} value={cellWidth} onChange={e=>setCellWidth(Number(e.target.value))}/>
       </label>
       <label className="field-label">Image cell height
         <input className="field" type="number" min={120} max={700} value={cellHeight} onChange={e=>setCellHeight(Number(e.target.value))}/>
       </label>
       <label className="field-label">Spacing (4–48)
         <input className="field" type="number" min={4} max={48} value={margin} onChange={e=>setMargin(Number(e.target.value))}/>
       </label>
       <label className="field-label">Format
         <select className="field" value={imageFormat} onChange={e=>setImageFormat(e.target.value as "png"|"jpeg")}>
           <option value="png">PNG</option><option value="jpeg">JPEG</option>
         </select>
       </label>
       <label><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)}/> Caption filenames</label>
     </div>
     {images.length>0&&(geometry.error?<p className="subtle" role="alert">{geometry.error}</p>:geometry.value&&
       <p className="subtle">Planned size: {geometry.value.width} × {geometry.value.height}px · {geometry.value.rows} rows.</p>)}
     <button className="primary-button" type="button" disabled={busy||!geometry.value} onClick={()=>{void generateSheet();}}>
       {busy?"Creating local image…":"Generate & save contact sheet"}
     </button>

   </>}
   {mode==="url-inspector"&&<>
     <p className="subtle">Understand the components of a link without visiting it. Query parameter names and values are decoded for inspection, with duplicates kept in their original order. This does not perform security or phishing checks.</p>
     <label className="field-label" htmlFor="inspect-url">Full HTTP(S) URL</label>
     <textarea id="inspect-url" className="field text-editor" rows={3} maxLength={5000} value={urlSource} onChange={e=>setUrlSource(e.target.value)}/>
     {urlResult.error?<p role="alert" className="subtle">{urlResult.error}</p>:urlResult.value&&<>
       <div className="tools-pair">
         <p><strong>Scheme</strong>: {urlResult.value.scheme}</p>
         <p><strong>Host</strong>: {urlResult.value.host}</p>
         <p><strong>Origin</strong>: {urlResult.value.origin}</p>
         <p><strong>Path</strong>: {urlResult.value.path}</p>
         <p><strong>Fragment</strong>: {urlResult.value.fragment||"(none)"}</p>
       </div>
       <h3>Query parameters · {urlResult.value.params.length}</h3>
       <div style={{overflowX:"auto",maxHeight:340,overflowY:"auto"}}>
         <table style={{width:"100%",borderCollapse:"collapse"}}>
           <thead><tr><th scope="col" style={{textAlign:"left",padding:8}}>Key</th><th scope="col" style={{textAlign:"left",padding:8}}>Value</th></tr></thead>
           <tbody>{urlResult.value.params.map((p,i)=><tr key={i}>
             <td style={{padding:8,borderTop:"1px solid #dfe5ee",overflowWrap:"anywhere"}}>{p.key}</td>
             <td style={{padding:8,borderTop:"1px solid #dfe5ee",overflowWrap:"anywhere"}}>{p.value}</td>
           </tr>)}</tbody>
         </table>
       </div>
       <button className="secondary-button" type="button" onClick={()=>{void copy(JSON.stringify(urlResult.value,null,2));}}>Copy JSON report</button>
     </>}
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
