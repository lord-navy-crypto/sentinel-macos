import {useEffect,useRef,useState,type ChangeEvent,type DragEvent as ReactDragEvent} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {exportFile} from "../lib/output";
import JSZip from "jszip";
import {markdownToDocx} from "../lib/documentExport";
import {decodeAudioToWav,validateAudioImport} from "../lib/speechAudio";
import {speechCues,exportTimedCaptions,type SpeechTiming} from "../lib/speechCaptions";
import {compressPhotoBatch,planPhotoBatch,PHOTO_PRESETS,photoPresetSettings,type PhotoPreset,type PhotoSettings,type PhotoReport} from "../lib/photoCompression";
import {exportPortableText,planPortable,type SourceCharset,type OutputCharset,type LineStyle,type PortableInput,type PortableSettings} from "../lib/portableText";

export type SpeechPortableMode="speech"|"photo-target"|"portable-text";
type Transcript={text:string;locale:string;on_device:boolean;segments?:SpeechTiming[]};
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
const availableLanguage=[
 ["zh-CN","中文（简体）"],["zh-TW","中文（繁體）"],["en-US","English (US)"],["en-GB","English (UK)"],
 ["ja-JP","日本語"],["fr-FR","Français"],["de-DE","Deutsch"],["es-ES","Español"]
];
export default function SpeechPortableDesk({mode}:{mode:SpeechPortableMode}){
 const [audio,setAudio]=useState<{wav:Uint8Array;name:string;seconds:number}|null>(null);
 const [transcript,setTranscript]=useState<Transcript|null>(null),[edited,setEdited]=useState("");
 const [locale,setLocale]=useState("zh-CN"),[recording,setRecording]=useState(false);
 const [maxCueChars,setMaxCueChars]=useState(48),[maxCueSeconds,setMaxCueSeconds]=useState(5);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const timer=useRef<number|null>(null),recordChunks=useRef<Blob[]>([]);
 const [photos,setPhotos]=useState<File[]>([]);
 const [photoSettings,setPhotoSettings]=useState<PhotoSettings>({format:"jpeg",maxDimension:1024,targetKB:250});
 const [photoReports,setPhotoReports]=useState<PhotoReport[]>([]);
 const [preparedPhotos,setPreparedPhotos]=useState<Awaited<ReturnType<typeof compressPhotoBatch>>|null>(null);
 const [photoPreviewUrl,setPhotoPreviewUrl]=useState("");
 useEffect(()=>()=>{if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);},[photoPreviewUrl]);
 const [texts,setTexts]=useState<PortableInput[]>([]);
 const [textSettings,setTextSettings]=useState<PortableSettings>({source:"auto",target:"utf-8-bom",lines:"crlf"});
 const [textReports,setTextReports]=useState<{source:string;encoding:string;outputBytes:number}[]>([]);
 function stopTracks(){
  if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null;}
  stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
 }
 useEffect(()=>()=>{if(recorder.current?.state==="recording")recorder.current.stop();stopTracks();},[]);
 async function decodeInput(buffer:ArrayBuffer,name:string){
  setBusy(true);setStatus("");
  try{
   const result=await decodeAudioToWav(buffer);
   setAudio({...result,name});setTranscript(null);setEdited("");setStatus("已本机解码 "+name+" 为 16kHz PCM WAV；旧转写已清除，尚未开始识别。");
  }catch(e){setStatus("音频解码失败（旧的可用音频与转写保留）："+err(e));}
  finally{setBusy(false);}
 }
 async function importAudioFile(file:File){
  if(busy||recording)return;
  try{
   validateAudioImport(file);
   await decodeInput(await file.arrayBuffer(),file.name);
  }catch(e){setStatus("音频导入失败，先前内容未修改："+err(e));}
 }
 function importAudio(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.target.files??[]);
  event.target.value="";
  if(!selected.length)return;
  if(selected.length!==1){setStatus("一次只能选择一份音频；旧内容保留。");return;}
  void importAudioFile(selected[0]);
 }
 function dropAudio(event:ReactDragEvent<HTMLDivElement>){
  event.preventDefault();
  const selected=Array.from(event.dataTransfer.files);
  if(selected.length!==1){setStatus("一次只能拖入一份音频；旧内容保留。");return;}
  void importAudioFile(selected[0]);
 }
 function clearCurrentAudio(){
  if(busy||recording)return;
  setAudio(null);setTranscript(null);setEdited("");
  setStatus("当前音频及转写已从会话中清空；磁盘文件未更改。");
 }
 async function startRecord(){
  if(recording||busy)return;setStatus("");
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
   setStatus("Microphone recording is not supported by this browser/WebView. Select an existing audio file instead.");return;
  }
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   stream.current=media;
   const preferred=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(m=>MediaRecorder.isTypeSupported(m));
   const record=new MediaRecorder(media,preferred?{mimeType:preferred}:undefined);
   recordChunks.current=[];recorder.current=record;
   record.ondataavailable=e=>{if(e.data.size>0)recordChunks.current.push(e.data);};
   record.onerror=()=>{stopTracks();setRecording(false);setStatus("Microphone recorder failed.");};
   record.onstop=()=>{
    stopTracks();setRecording(false);recorder.current=null;
    const blob=new Blob(recordChunks.current,{type:record.mimeType});recordChunks.current=[];
    if(blob.size<44){setStatus("No usable recording was captured.");return;}
    void blob.arrayBuffer().then(data=>decodeInput(data,"microphone-recording")).catch(e=>setStatus("Recording decode failed: "+err(e)));
   };
   record.start(300);setRecording(true);
   timer.current=window.setTimeout(()=>{if(record.state==="recording")record.stop();},90_000);
   setStatus("Microphone recording: only captured after explicit permission; automatic stop at 90 seconds.");
  }catch(e){stopTracks();setRecording(false);setStatus("Microphone permission or recording failed: "+err(e));}
 }
 function stopRecord(){const current=recorder.current;if(current?.state==="recording")current.stop();}
 async function recognize(){
  if(!audio||busy)return;
  setBusy(true);setStatus("");setTranscript(null);
  try{
   if(!isTauri())throw Error("Speech-to-text requires the Sentinel Box macOS desktop app; browser preview never performs cloud recognition.");
   const result=await invoke<Transcript>("transcribe_on_device_wav",{wav:Array.from(audio.wav),locale});
   if(!result.on_device||!result.text.trim())throw Error("No on-device transcription was returned.");
   setTranscript(result);setEdited(result.text);
   setStatus("Transcribed using the local Apple Speech model. Please review the transcript for errors.");
  }catch(e){setStatus("Local speech recognition: "+err(e));}
  finally{setBusy(false);}
 }
 async function saveSpeech(kind:"txt"|"docx"|"wav"|"srt"|"vtt"){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const bytes=kind==="wav"?audio?.wav:kind==="docx"?await markdownToDocx(edited):kind==="srt"||kind==="vtt"?exportTimedCaptions(speechCues(transcript?.segments??[],maxCueChars,maxCueSeconds),kind):edited;
   if(!bytes||(kind==="txt"||kind==="docx")&&!edited.trim())throw Error("No recorded audio or transcript to export.");
   const saved=await exportFile(kind==="wav"?"sentinel-box-audio-16khz.wav":kind==="srt"||kind==="vtt"?"sentinel-box-timed-captions."+kind:"sentinel-box-transcript."+kind,bytes);
   setStatus(saved?"Saved locally. Audio source was never overwritten.":"Save cancelled.");
  }catch(e){setStatus("Export error: "+err(e));}finally{setBusy(false);}
 }
 function invalidatePreparedPhotos(){
  setPreparedPhotos(null);setPhotoReports([]);setPhotoPreviewUrl("");
 }
 function selectPhotos(selected:File[],append:boolean){
  if(busy)return;
  if(!selected.length)return;
  try{
   const proposed=append?[...photos,...selected]:selected;
   planPhotoBatch(proposed,photoSettings);
   setPhotos(proposed);invalidatePreparedPhotos();
   setStatus("已检查 "+proposed.length+" 张图片（含格式与大小限制）；清单更改后旧压缩预览已清除。");
  }catch(e){setStatus("未加入图片，原清单不变："+err(e));}
 }
 function pickPhotos(event:ChangeEvent<HTMLInputElement>){
  const selected=[...(event.target.files??[])];event.target.value="";
  selectPhotos(selected,false);
 }
 function dropPhotos(event:ReactDragEvent<HTMLDivElement>){
  event.preventDefault();
  selectPhotos([...(event.dataTransfer.files??[])],true);
 }
 function removePhoto(index:number){
  if(busy)return;
  setPhotos(existing=>existing.filter((_,i)=>i!==index));
  invalidatePreparedPhotos();setStatus("已移除图片，旧预览已清除；原文件未修改。");
 }
 function clearPhotos(){
  if(busy)return;
  setPhotos([]);invalidatePreparedPhotos();setStatus("已清空照片清单和旧压缩预览。");
 }
 function changePhotoSettings(update:Partial<PhotoSettings>){
  if(busy)return;
  setPhotoSettings(prev=>({...prev,...update}));invalidatePreparedPhotos();setStatus("");
 }
 function applyPhotoPreset(preset:PhotoPreset){
  if(busy)return;
  setPhotoSettings(photoPresetSettings(preset));invalidatePreparedPhotos();
  setStatus("已应用"+PHOTO_PRESETS[preset].label+"预设；目标大小仅供尝试，压缩完成后显示真实字节数。");
 }
 async function previewPhotos(){
  if(busy||!photos.length)return;
  setBusy(true);setStatus("");setPhotoPreviewUrl("");setPreparedPhotos(null);setPhotoReports([]);
  try{
   const result=await compressPhotoBatch(photos,photoSettings);
   setPreparedPhotos(result);setPhotoReports(result.reports);
   const first=result.reports[0];
   const zip=await JSZip.loadAsync(result.zip);
   const file=zip.file(first.outputName);
   if(!file)throw Error("Preview photo is missing from the generated ZIP.");
   const data=await file.async("uint8array");
   const mime=photoSettings.format==="jpeg"?"image/jpeg":"image/webp";
   setPhotoPreviewUrl(URL.createObjectURL(new Blob([new Uint8Array(data)],{type:mime})));
   setStatus("Compressed "+result.reports.length+" photos locally. Review actual bytes, image clarity and target size, then save.");
  }catch(e){setStatus("Photo preview failed: "+err(e));invalidatePreparedPhotos();}
  finally{setBusy(false);}
 }
 async function savePhotos(){
  if(busy||!photos.length)return;setBusy(true);setStatus("");
  try{
   const result=preparedPhotos??await compressPhotoBatch(photos,photoSettings);
   let ok:boolean;
   if(photos.length===1){
    // One input means one actual picture file, not an unnecessary ZIP wrapper.
    const item=result.reports[0];
    if(!item)throw Error("Compressed photo report is unavailable.");
    const archive=await JSZip.loadAsync(result.zip);
    const entry=archive.file(item.outputName);
    if(!entry)throw Error("Compressed image is missing from the archive.");
    const data=await entry.async("uint8array");
    if(data.length!==item.outputBytes)throw Error("Compressed image size does not match the report.");
    const fileName=item.outputName.split("/").pop()||"compressed-photo.jpg";
    ok=await exportFile(fileName,new Uint8Array(data));
   }else{
    ok=await exportFile("sentinel-box-compressed-photos.zip",result.zip);
   }
   setPhotoReports(result.reports);
   setStatus(ok?(photos.length===1?
    "已直接保存一张真实压缩图片（非 ZIP），原件未更改；请检查画质与报告中的实际字节数。":
    "已保存批量图片 ZIP 和逐张体积报告，原件未更改。"):"已取消保存。");
  }catch(e){setStatus("Photo compression failed: "+err(e));}
  finally{setBusy(false);}
 }
 async function pickTexts(event:ChangeEvent<HTMLInputElement>){
  const selected=[...(event.target.files??[])];event.target.value="";setTexts([]);setTextReports([]);setStatus("");
  try{
   planPortable(selected,textSettings);
   const result:PortableInput[]=[];
   for(const f of selected)result.push({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())});
   setTexts(result);
  }catch(e){setStatus("Text import failed: "+err(e));}
 }
 async function saveTexts(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const result=await exportPortableText(texts,textSettings);
   const ok=await exportFile("sentinel-box-windows-mac-text.zip",result.zip);
   setTextReports(result.reports);
   setStatus(ok?"Saved UTF text and line-ending conversions as new files. Sources unchanged.":"Save cancelled.");
  }catch(e){setStatus("Cross-OS conversion failed: "+err(e));}
  finally{setBusy(false);}
 }
 let photoError="";try{if(photos.length)planPhotoBatch(photos,photoSettings);}catch(e){photoError=err(e);}
 let portableError="";try{if(texts.length)planPortable(texts.map(x=>({name:x.name,size:x.bytes.length})),textSettings);}catch(e){portableError=err(e);}
 return <section className="panel" data-testid="speech-portable-panel">
  <p className="eyebrow">SENTINEL BOX · VOICE, IMAGES & CROSS-OS FILES</p>
  {mode==="speech"&&<>
   <h2>语音转文字 · On-device Speech to Text</h2>
   <p className="subtle">录制麦克风或导入本地音频，统一转为 16 kHz 单声道 WAV，再使用 macOS Apple Speech 转写。**强制本机识别**：语言模型或权限不可用时拒绝识别，绝不悄悄使用在线服务。每段最长 90 秒。</p>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="speech-record-start" disabled={recording||busy} onClick={()=>void startRecord()}>开始录音（需允许麦克风）</button>
    <button type="button" className="secondary-button" data-testid="speech-record-stop" disabled={!recording} onClick={stopRecord}>结束录音</button>
   </div>
   {recording&&<p role="status" data-testid="speech-recording-active">录音进行中 · 90 秒自动停止</p>}
   <div className="panel" data-testid="speech-audio-drop" role="region" aria-label="拖入音频文件"
    onDragOver={event=>event.preventDefault()} onDrop={dropAudio}>
    <label className="field-label">选择或拖入一份音频（WAV、MP3、M4A 等，44 bytes–12 MB，≤90 秒，实际支持由设备决定）
     <input type="file" data-testid="speech-audio-file" className="field" disabled={busy||recording}
      accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg,.aac,.flac,.caf" onChange={importAudio}/>
    </label>
    <p className="subtle">仅在用户选择或拖入后本地解码。文件损坏、过大或格式不兼容时保留上次成功解码的音频和文字。</p>
   </div>
   {audio&&<button type="button" className="secondary-button" data-testid="speech-clear-session"
    disabled={busy||recording} onClick={clearCurrentAudio}>清空当前音频与转写</button>}
   {audio&&<p className="subtle" data-testid="speech-audio-ready">可用本地音频：{audio.name} · {audio.seconds.toFixed(2)} 秒 · PCM16/16kHz</p>}
   <label className="field-label">转写语言（设备是否支持离线模型由 Apple Speech 决定）
    <select className="field" data-testid="speech-locale" value={locale} onChange={e=>setLocale(e.target.value)}>
     {availableLanguage.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
   </label>
   {!isTauri()&&<p data-testid="speech-native-only" className="subtle">当前浏览器预览只可录音、解码与导出 WAV；真正的语音识别只在安装的 macOS Sentinel Box 中提供。</p>}
   <div className="actions">
    <button className="primary-button" data-testid="speech-transcribe" type="button"
     disabled={!audio||busy||recording||!isTauri()} onClick={()=>void recognize()}>Apple Speech 本机转文字</button>
    <button className="secondary-button" data-testid="speech-save-wav" type="button"
     disabled={!audio||busy||recording} onClick={()=>void saveSpeech("wav")}>保存标准 PCM WAV</button>
   </div>
   {transcript&&<><p className="subtle" data-testid="speech-result-meta">离线识别 · {transcript.locale} · 真实音频分段 {transcript.segments?.length??0} · 请校对文字</p>
    {transcript.segments&&transcript.segments.length>0&&<div className="tools-pair">
      <label className="field-label">字幕每条最大字符
        <input data-testid="speech-cue-chars" className="field" type="number" min={15} max={100} value={maxCueChars} onChange={e=>setMaxCueChars(Number(e.target.value))}/>
      </label>
      <label className="field-label">字幕最大时长（秒）
        <input data-testid="speech-cue-seconds" className="field" type="number" min={1} max={10} value={maxCueSeconds} onChange={e=>setMaxCueSeconds(Number(e.target.value))}/>
      </label>
      <p className="subtle" data-testid="speech-timing-note">字幕时间来自 Apple Speech 原始音频分段，不会根据编辑后的 TXT 重新猜测时间。编辑文字仅影响 TXT/Word；请导出字幕后另行校对。</p>
    </div>}
    <label className="field-label">可编辑转写结果<textarea rows={10} className="field text-editor"
     data-testid="speech-transcript" maxLength={100000} value={edited} onChange={e=>setEdited(e.target.value)}/></label>
    <div className="actions">
     <button type="button" data-testid="speech-save-txt" className="primary-button" onClick={()=>void saveSpeech("txt")}>导出 TXT</button>
     <button type="button" data-testid="speech-save-docx" className="secondary-button" onClick={()=>void saveSpeech("docx")}>导出 Word DOCX</button>
     {transcript.segments&&transcript.segments.length>0&&<>
       <button type="button" data-testid="speech-save-srt" className="secondary-button" onClick={()=>void saveSpeech("srt")}>导出时间戳 SRT</button>
       <button type="button" data-testid="speech-save-vtt" className="secondary-button" onClick={()=>void saveSpeech("vtt")}>导出 WebVTT</button>
     </>}
    </div>
   </>}
  </>}
  {mode==="photo-target"&&<>
   <h2>照片目标体积压缩 · Local Target-size Image Compressor</h2>
   <p className="subtle">批量选择最多 10 张 PNG/JPEG/WebP/HEIC，压缩为 JPEG 或 WebP；自动迭代质量并按实际文件字节判断是否达到目标。不是只给图片改扩展名，也不能保证每张都能压到指定体积。</p>
   <p className="subtle">单张图片直接保存 JPG/WebP，2–10 张继续导出 ZIP。可点一个用途预设，也可以自己修改设置；不会保证一定压到目标体积。</p>
   <div className="actions" role="group" aria-label="照片快速预设">
    {(Object.keys(PHOTO_PRESETS) as PhotoPreset[]).map(key=><button type="button"
     key={key} className="secondary-button" data-testid={`photo-preset-${key}`}
     title={PHOTO_PRESETS[key].description} disabled={busy} onClick={()=>applyPhotoPreset(key)}>
     {PHOTO_PRESETS[key].label}</button>)}
   </div>
   <p className="subtle">预设：邮件 1024px/JPEG/250KB；网页 1024px/WebP/400KB；保留细节 2048px/JPEG/1500KB。均为尝试上限，实际结果在预览中查看。</p>
   <div className="panel" data-testid="photo-drop-zone" aria-label="拖入图片并追加到照片清单"
      onDragOver={event=>event.preventDefault()} onDrop={dropPhotos}>
    <label className="field-label">选择照片（替换现有选择），或从 Finder 拖入图片以追加；最多 10 张、单张 ≤8 MB，总计 ≤25 MB
     <input className="field" data-testid="photo-files" type="file" multiple disabled={busy}
       accept=".png,.jpg,.jpeg,.webp,.heic,.heif,image/*" onChange={pickPhotos}/></label>
    <p className="subtle">拖入会追加到当前清单；若超出图片数量、文件格式或大小限制，保留现有清单不变。照片始终本地处理。</p>
   </div>
   {photos.length>0&&<div data-testid="photo-input-list" className="panel">
    <p><strong>待处理图片（{photos.length}/10）</strong> · 每次更改清单会清除上次预览</p>
    {photos.map((file,index)=><div className="task-row" key={index} data-testid="photo-input-entry">
     <span className="task-copy">{index+1}. {file.name} · {(file.size/1000).toFixed(1)} KB</span>
     <button type="button" className="secondary-button" data-testid={`photo-remove-${index}`}
      disabled={busy} onClick={()=>removePhoto(index)} aria-label={`移除第${index+1}张图片`}>移除</button>
    </div>)}
    <button type="button" className="secondary-button" data-testid="photo-clear-all"
     disabled={busy} onClick={clearPhotos}>清空照片清单</button>
   </div>}
   <div className="tools-pair">
    <label className="field-label">输出格式<select className="field" data-testid="photo-format" disabled={busy} value={photoSettings.format} onChange={e=>changePhotoSettings({format:e.target.value as PhotoSettings["format"]})}>
     <option value="jpeg">JPEG · 常见兼容格式</option><option value="webp">WebP · 现代浏览器</option></select></label>
    <label className="field-label">最长边<select className="field" data-testid="photo-max-size" disabled={busy} value={photoSettings.maxDimension} onChange={e=>changePhotoSettings({maxDimension:Number(e.target.value) as PhotoSettings["maxDimension"]})}>
     <option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px</option></select></label>
    <label className="field-label">目标 KB（40–4000）<input className="field" data-testid="photo-target-kb" type="number" min={40} max={4000} step={10} disabled={busy} value={photoSettings.targetKB}
     onChange={e=>changePhotoSettings({targetKB:Number(e.target.value)})}/></label>
   </div>
   {photos.length>0&&<p data-testid="photo-count" className="subtle">选中 {photos.length} 张照片</p>}
   {photoError&&<p role="alert">{photoError}</p>}
   <div className="actions">
    <button type="button" className="secondary-button" data-testid="photo-preview-run" disabled={busy||!!photoError||!photos.length} onClick={()=>void previewPhotos()}>先处理并预览实际效果</button>
    <button type="button" className="primary-button" data-testid="photo-save" disabled={busy||!!photoError||!photos.length} onClick={()=>void savePhotos()}>{photos.length===1?(preparedPhotos?"保存已预览的图片":"压缩并保存图片"):(preparedPhotos?"保存已预览的 ZIP":"压缩并保存 ZIP")}</button>
   </div>
   {photoReports.length>0&&<div data-testid="photo-size-summary" className="metrics">
    <span>原图合计：{photoReports.reduce((sum,r)=>sum+r.originalBytes,0).toLocaleString()} bytes</span>
    <span>压缩合计：{photoReports.reduce((sum,r)=>sum+r.outputBytes,0).toLocaleString()} bytes</span>
    <span>真正缩小：{photoReports.filter(r=>r.smallerThanSource).length} / {photoReports.length}</span>
    <span>达成目标：{photoReports.filter(r=>r.targetMet).length} / {photoReports.length}</span>
   </div>}
   {photoReports.map((r,i)=><p data-testid="photo-report" className="subtle" key={i}>
    {r.source}: {r.originalBytes.toLocaleString()} → {r.outputBytes.toLocaleString()} bytes
    · {r.width}×{r.height}px · 质量 {r.quality}
    · {r.smallerThanSource?"节省 "+r.sizeDeltaPercent+"%":"体积增加 "+Math.abs(r.sizeDeltaPercent)+"%"}
    · {r.targetMet?"达成目标":"未达成目标"}
   </p>)}
   {photoPreviewUrl&&<div data-testid="photo-actual-preview">
    <p className="subtle">第一张已转换的真实图片预览；请检查细小文字、背景、方向与清晰度。</p>
    <img src={photoPreviewUrl} alt="Actual first compressed output image" style={{maxWidth:"100%",maxHeight:320,objectFit:"contain"}}/>
   </div>}
   <p className="subtle">HEIC/HEIF 仅安装的 macOS App 调用系统本地图像解码；浏览器预览不承诺支持。JPEG 会把透明背景填充成白色。图片可能变大，报告显示真实结果；GPS/EXIF 信息不会被主动复制，但请自行检查输出。原件永不覆盖。</p>
  </>}
  {mode==="portable-text"&&<>
   <h2>Windows ↔ macOS 文本兼容转换</h2>
   <p className="subtle">转换 UTF-8、UTF-16、Windows-1252、GB18030、Shift-JIS 文本编码，并统一 LF／CRLF 换行符；适用于文本、CSV、字幕与简单配置文件。不能转换 Windows 软件（.exe）、Office 专有版式或任意二进制文件。</p>
   <label className="field-label">选择文本文件（最多 20 个，单份 ≤1 MB）
    <input className="field" data-testid="portable-files" type="file" multiple accept=".txt,.csv,.md,.tsv,.json,.srt,.vtt,.ini,.log" onChange={e=>void pickTexts(e)}/></label>
   <div className="tools-pair">
    <label className="field-label">输入编码<select className="field" data-testid="portable-source" value={textSettings.source} onChange={e=>setTextSettings(s=>({...s,source:e.target.value as SourceCharset}))}>
     {(["auto","utf-8","utf-16le","utf-16be","windows-1252","gb18030","shift_jis"] as SourceCharset[]).map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label className="field-label">目标编码<select className="field" data-testid="portable-target" value={textSettings.target} onChange={e=>setTextSettings(s=>({...s,target:e.target.value as OutputCharset}))}>
     <option value="utf-8">UTF-8（Mac/Linux）</option><option value="utf-8-bom">UTF-8 with BOM（Excel/Windows）</option><option value="utf-16le-bom">UTF-16 LE with BOM（旧版 Windows）</option></select></label>
    <label className="field-label">换行方式<select className="field" data-testid="portable-lines" value={textSettings.lines} onChange={e=>setTextSettings(s=>({...s,lines:e.target.value as LineStyle}))}>
     <option value="lf">LF（Mac/Linux）</option><option value="crlf">CRLF（Windows）</option></select></label>
   </div>
   {texts.length>0&&<p data-testid="portable-count">{texts.length} 个文件准备就绪</p>}
   {portableError&&<p role="alert">{portableError}</p>}
   <button className="primary-button" type="button" data-testid="portable-save" disabled={!texts.length||!!portableError||busy} onClick={()=>void saveTexts()}>转换并导出 ZIP</button>
   {textReports.map((r,i)=><p data-testid="portable-report" className="subtle" key={i}>{r.source} · {r.encoding} → {textSettings.target} · {r.outputBytes} bytes</p>)}
   <p className="subtle">自动检测仅依据 BOM；无 BOM 时默认 UTF-8，不会猜测中文系统编码。转换后的文件请按目标软件重新打开核对。</p>
  </>}
  {status&&<p role="status" className="subtle" data-testid="speech-portable-status">{status}</p>}
  <p className="subtle">所有输入仅在用户主动选择或授权后处理。麦克风轨道在停止录音时结束，未建立持续监听。没有强制云端服务和付费订阅。</p>
 </section>;
}
