import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {auditDirectory,directoryAuditCsv,directoryAuditSvg,type DirectoryEntry} from "../lib/directoryAudit";
import {analyzeWavLevels,wavLevelsCsv} from "../lib/wavLevelAudit";
import {extractPptxSpeakerNotes,notesToText,type NotesReport} from "../lib/pptxNotesAudit";
import type {WavLevels} from "../lib/wavLevelAudit";

export type ResearchToolsMode="folder-space"|"wav-levels"|"pptx-notes";
const error=(e:unknown)=>e instanceof Error?e.message:String(e);
const showDb=(n:number|null)=>n===null?"−∞":n.toFixed(2);
export default function ResearchToolsDesk({mode}:{mode:ResearchToolsMode}){
 const [selection,setSelection]=useState<DirectoryEntry[]>([]);
 const [wav,setWav]=useState<WavLevels|null>(null),[wavName,setWavName]=useState("");
 const [notes,setNotes]=useState<NotesReport|null>(null),[pptxName,setPptxName]=useState("");
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const directory=useMemo(()=>{try{return {value:auditDirectory(selection),error:""};}
  catch(e){return {value:null,error:selection.length?error(e):""};}},[selection]);
 const svg=useMemo(()=>directory.value?directoryAuditSvg(directory.value):"",[directory.value]);
 function chosenFiles(e:ChangeEvent<HTMLInputElement>){
  const files=[...(e.target.files??[])];e.target.value="";setStatus("");
  try{
   if(files.length>2500)throw Error("Choose at most 2,500 files.");
   setSelection(files.map(f=>({name:f.name,relativePath:f.webkitRelativePath||f.name,size:f.size})));
  }catch(err){setSelection([]);setStatus("Selection: "+error(err));}
 }
 async function openWav(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value="";setStatus("");setWav(null);setWavName("");if(!f)return;
  setBusy(true);
  try{
   if(!/\.wav$/iu.test(f.name)||f.size>20_000_000)throw Error("Choose a PCM16 .wav file no larger than 20 MB.");
   const levels=analyzeWavLevels(new Uint8Array(await f.arrayBuffer()));
   setWav(levels);setWavName(f.name);
   setStatus("Completed local WAV sample analysis; no audio was modified or uploaded.");
  }catch(err){setStatus("WAV import: "+error(err));}finally{setBusy(false);}
 }
 async function openPptx(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value="";setStatus("");setNotes(null);setPptxName("");if(!f)return;
  setBusy(true);
  try{
   if(!/\.pptx$/iu.test(f.name)||f.size>18_000_000)throw Error("Choose a PPTX file no larger than 18 MB.");
   const result=await extractPptxSpeakerNotes(new Uint8Array(await f.arrayBuffer()));
   setNotes(result);setPptxName(f.name);
   setStatus("Inspected actual PowerPoint notes slides. Missing notes remain explicitly marked.");
  }catch(err){setStatus("PPTX import: "+error(err));}finally{setBusy(false);}
 }
 async function save(kind:"folder-csv"|"folder-svg"|"folder-json"|"wav-json"|"wav-csv"|"notes-txt"|"notes-json"){
  if(busy)return;setBusy(true);setStatus("");
  try{
   let name="",data="";
   switch(kind){
    case "folder-csv":if(!directory.value)throw Error("Select files first.");name="sentinel-folder-sizes.csv";data=directoryAuditCsv(directory.value);break;
    case "folder-svg":if(!directory.value)throw Error("Select files first.");name="sentinel-folder-chart.svg";data=directoryAuditSvg(directory.value);break;
    case "folder-json":if(!directory.value)throw Error("Select files first.");name="sentinel-folder-inventory.json";data=JSON.stringify(directory.value,null,2);break;
    case "wav-json":if(!wav)throw Error("Import WAV first.");name="sentinel-wav-levels.json";data=JSON.stringify({source:wavName,method:"PCM16 sample peak and RMS, not EBU R128 loudness",...wav},null,2);break;
    case "wav-csv":if(!wav)throw Error("Import WAV first.");name="sentinel-wav-windows.csv";data=wavLevelsCsv(wav);break;
    case "notes-txt":if(!notes)throw Error("Import PPTX first.");name="sentinel-pptx-speaker-notes.txt";data=notesToText(notes);break;
    case "notes-json":if(!notes)throw Error("Import PPTX first.");name="sentinel-pptx-notes.json";data=JSON.stringify({source:pptxName,...notes},null,2);break;
   }
   const ok=await exportFile(name,data);setStatus(ok?"Saved "+name+". Original input unchanged.":"Save cancelled.");
  }catch(err){setStatus("Export: "+error(err));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="research-tools-desk">
  <p className="eyebrow">SENTINEL BOX · ADVANCED FREE UTILITIES</p>
  {mode==="folder-space"&&<>
   <h3>Folder Space Inspector · 文件夹空间分析</h3>
   <p className="subtle">仅对手动选择的文件/文件夹做大小统计，按原始相对路径和扩展名聚合；不读取文件正文，不删除文件。选择文件夹时取决于浏览器 / WebView 对文件夹选择的支持，无法使用时可退回多文件选择。</p>
   <div className="tools-pair">
    <label className="field-label">选择本地文件夹<input data-testid="folder-audit-directory" className="field" type="file"
      ref={node=>{if(node)node.setAttribute("webkitdirectory","");}} multiple onChange={chosenFiles}/></label>
    <label className="field-label">或选择多个文件<input data-testid="folder-audit-files" className="field" type="file" multiple onChange={chosenFiles}/></label>
   </div>
   {directory.error&&<p role="alert">{directory.error}</p>}
   {directory.value&&<>
    <p className="subtle" data-testid="folder-audit-summary">{directory.value.files} files · {directory.value.folders} folders · {(directory.value.bytes/1_000_000).toFixed(2)} MB selected</p>
    <img data-testid="folder-audit-preview" alt="Local folder sizes illustrated as labeled bars"
      src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)} style={{width:"100%",maxWidth:960,borderRadius:8}}/>
    <div style={{maxHeight:180,overflow:"auto"}}>{directory.value.extensions.slice(0,12).map(x=><p key={x.path}>{x.path}: {x.files} files · {(x.bytes/1_000_000).toFixed(2)} MB</p>)}</div>
   </>}
   <div className="actions">
    <button data-testid="folder-audit-csv" className="primary-button" type="button" disabled={busy||!directory.value} onClick={()=>void save("folder-csv")}>导出 CSV</button>
    <button data-testid="folder-audit-svg" type="button" disabled={busy||!directory.value} onClick={()=>void save("folder-svg")}>导出 SVG 图</button>
    <button type="button" disabled={busy||!directory.value} onClick={()=>void save("folder-json")}>导出 JSON</button>
   </div>
  </>}
  {mode==="wav-levels"&&<>
   <h3>WAV Audio Level Analyzer · 音频响度与削波分析</h3>
   <p className="subtle">分析用户选择的 16-bit PCM WAV（最多 20 MB），计算采样峰值 dBFS、RMS dBFS、削波样本数、直流偏移和时间分段。不是 LUFS / EBU R128 标准响度检测，也不提供音频录制或格式转换。</p>
   <label className="field-label">导入 PCM16 WAV<input className="field" data-testid="wav-level-file" type="file" accept=".wav,audio/wav" onChange={e=>void openWav(e)}/></label>
   {wav&&<>
    <p data-testid="wav-level-stats" className="subtle">{wavName} · {wav.channels} channel(s) · {wav.sampleRate} Hz · {(wav.durationMs/1000).toFixed(2)} sec · Peak {showDb(wav.peakDbfs)} dBFS · RMS {showDb(wav.rmsDbfs)} dBFS · clipped samples {wav.clippedSamples}</p>
    <p className="subtle">Crest {showDb(wav.crestDb)} dB · DC offset {wav.dcOffsetPercent}%</p>
    <div style={{display:"flex",alignItems:"end",height:120,gap:2,overflow:"hidden",borderBottom:"1px solid #b5cad8"}}>{wav.windows.map((x,i)=><div key={i} title={x.startMs+"ms: "+showDb(x.peakDbfs)+" dBFS"}
     style={{flex:"1 1 0",minWidth:2,height:Math.max(2,Math.round(110*Math.pow(10,(x.peakDbfs??-100)/20)))+"px",background:"#3989be",borderRadius:2}}/>)}</div>
   </>}
   <div className="actions">
    <button data-testid="wav-level-json" type="button" className="primary-button" disabled={busy||!wav} onClick={()=>void save("wav-json")}>导出 JSON 报告</button>
    <button data-testid="wav-level-csv" type="button" disabled={busy||!wav} onClick={()=>void save("wav-csv")}>导出时间窗口 CSV</button>
   </div>
  </>}
  {mode==="pptx-notes"&&<>
   <h3>PowerPoint Presenter Notes · 演讲者备注提取</h3>
   <p className="subtle">从真正的 PPTX notesSlide 关系读取每页演讲备注正文，保留幻灯片顺序；没有备注的幻灯片明确标记。不会用幻灯片正文冒充备注，不执行宏或外部链接。复杂母版、隐藏备注、批注或嵌入对象不保证提取。</p>
   <label className="field-label">导入 .pptx 文件<input data-testid="pptx-notes-file" className="field" type="file" accept=".pptx" onChange={e=>void openPptx(e)}/></label>
   {notes&&<>
    <p data-testid="pptx-notes-summary" className="subtle">{pptxName} · {notes.slides} slides · {notes.withNotes} with speaker notes</p>
    <div style={{maxHeight:320,overflow:"auto"}}>{notes.notes.slice(0,60).map(x=><div key={x.slide} style={{borderBottom:"1px solid #d1dae2",padding:8}}><strong>Slide {x.slide}</strong><p style={{whiteSpace:"pre-wrap"}}>{x.text||"(no presenter notes)"}</p></div>)}</div>
   </>}
   <div className="actions">
    <button data-testid="pptx-notes-txt" className="primary-button" type="button" disabled={busy||!notes} onClick={()=>void save("notes-txt")}>导出备注 TXT</button>
    <button data-testid="pptx-notes-json" type="button" disabled={busy||!notes} onClick={()=>void save("notes-json")}>导出结构 JSON</button>
   </div>
  </>}
  {status&&<p role="status" data-testid="research-tools-status" className="subtle">{status}</p>}
  <p className="subtle">No background scan, no cloud upload, and no source-file modification. Review exported paths, file names, or notes before sharing.</p>
 </section>;
}
