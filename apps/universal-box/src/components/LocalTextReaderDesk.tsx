import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {availableLocalReaderVoices,validateReaderText,validateReaderRate,READER_MAX_CHARS} from "../lib/localTextReader";

const asText=(e:unknown)=>e instanceof Error?e.message:String(e);
const MAX_UPLOAD_BYTES=20_000;
export default function LocalTextReaderDesk(){
 const [text,setText]=useState("");
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 const [selectedVoice,setSelectedVoice]=useState("");
 const [rate,setRate]=useState(1);
 const [speaking,setSpeaking]=useState(false);
 const [paused,setPaused]=useState(false);
 const [status,setStatus]=useState("");
 const utterance=useRef<SpeechSynthesisUtterance|null>(null);
 const available=typeof window!=="undefined"&&
   "speechSynthesis" in window&&"SpeechSynthesisUtterance" in window;
 const local=availableLocalReaderVoices(voices);
 useEffect(()=>{
  if(!available){setStatus("此系统/WebView 不提供语音朗读 API；没有调用远程语音服务。");return;}
  const synth=window.speechSynthesis;
  const refresh=()=>setVoices([...synth.getVoices()]);
  refresh();
  synth.addEventListener?.("voiceschanged",refresh);
  return ()=>{
   synth.removeEventListener?.("voiceschanged",refresh);
   if(utterance.current){
    utterance.current.onend=null;utterance.current.onerror=null;
    utterance.current=null;
   }
   synth.cancel();
  };
 },[available]);
 function stopReading(){
  if(available)window.speechSynthesis.cancel();
  if(utterance.current){
   utterance.current.onend=null;utterance.current.onerror=null;
   utterance.current=null;
  }
  setSpeaking(false);setPaused(false);
  setStatus("已停止朗读。没有生成、保存或上传任何录音。");
 }
 function startReading(){
  if(!available)return;
  try{
   const toRead=validateReaderText(text),speed=validateReaderRate(rate);
   const voice=local.find(item=>item.voiceURI===(selectedVoice||local[0]?.voiceURI));
   if(!voice||voice.localService!==true)
    throw Error("找不到系统明确标记为本地的语音；为保护隐私，不能自动改用在线语音。");
   window.speechSynthesis.cancel();
   if(utterance.current){utterance.current.onend=null;utterance.current.onerror=null;}
   const next=new SpeechSynthesisUtterance(toRead);
   next.voice=voice;next.lang=voice.lang;next.rate=speed;
   next.onend=()=>{
    if(utterance.current!==next)return;
    utterance.current=null;setSpeaking(false);setPaused(false);setStatus("本地朗读完成。");
   };
   next.onerror=event=>{
    if(utterance.current!==next)return;
    utterance.current=null;setSpeaking(false);setPaused(false);
    setStatus("本地语音朗读失败："+event.error+"。请尝试设备上的其他本地语音。");
   };
   utterance.current=next;
   window.speechSynthesis.speak(next);
   setSpeaking(true);setPaused(false);
   setStatus("已请求设备本地语音朗读 "+toRead.length+" 个字符。语音效果和语言取决于系统安装的本地声音。");
  }catch(error){setStatus(asText(error));}
 }
 function togglePause(){
  if(!available||!speaking)return;
  try{
   if(paused){window.speechSynthesis.resume();setPaused(false);setStatus("已继续本地朗读。");}
   else{window.speechSynthesis.pause();setPaused(true);setStatus("已暂停本地朗读。");}
  }catch(e){setStatus("无法操作语音播放："+asText(e));}
 }
 async function importText(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(files.length!==1){if(files.length)setStatus("一次只能选择一份文本。");return;}
  const file=files[0];
  if(!/\.(txt|md|markdown)$/iu.test(file.name)||file.size<1||file.size>MAX_UPLOAD_BYTES){
   setStatus("请选择不超过 20 KB 的 TXT 或 Markdown 文件，当前输入未改变。");return;
  }
  try{
   const buffer=await file.arrayBuffer();
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(buffer);
   const normalized=validateReaderText(decoded);
   stopReading();setText(normalized);
   setStatus("已从本机导入 "+file.name+"；文本可编辑，尚未开始朗读。");
  }catch(e){setStatus("无法读取文本文件，当前输入仍保留："+asText(e));}
 }
 return <section className="panel" data-testid="local-text-reader">
  <p className="eyebrow">SENTINEL BOX · LOCAL READ ALOUD</p>
  <h2>文字朗读 · 本地 Text to Speech</h2>
  <p className="subtle">手动粘贴文章、邮件或学习资料，用设备已安装的语音朗读。<strong>只允许浏览器明确标记为 localService 的本地语音。</strong> 如果没有本地语音会禁用播放，不会切换在线声音或请求云端接口。</p>
  <label className="field-label">需要朗读的文字（最多 5,000 字符）
   <textarea data-testid="reader-text" rows={10} className="field text-editor" maxLength={READER_MAX_CHARS}
    value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴中文或英文段落…"/>
  </label>
  <label className="field-label">也可导入本地 TXT / Markdown（UTF-8，≤20 KB）
   <input data-testid="reader-text-file" className="field" type="file" accept=".txt,.md,.markdown"
    onChange={event=>void importText(event)}/>
  </label>
  <div className="tools-pair">
   <label className="field-label">设备本地语音
    <select className="field" data-testid="reader-voice" value={selectedVoice||local[0]?.voiceURI||""}
     disabled={!local.length||speaking} onChange={e=>setSelectedVoice(e.target.value)}>
     {!local.length&&<option value="">无可用本地语音</option>}
     {local.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
    </select>
   </label>
   <label className="field-label">朗读速度：{rate.toFixed(1)}×
    <input data-testid="reader-rate" className="field" type="range" min={0.7} max={1.5} step={0.1}
     disabled={speaking} value={rate} onChange={e=>setRate(Number(e.target.value))}/>
   </label>
  </div>
  <p className="subtle" data-testid="reader-local-voices">系统当前报告 {local.length} 个可用的本地语音。不同 macOS/WebView 可能不提供本地声音标记；不保证离线语音模型在所有设备可用。</p>
  <div className="actions">
   <button type="button" className="primary-button" data-testid="reader-start"
    disabled={!available||!local.length||!text.trim()||speaking}
    onClick={startReading}>开始朗读</button>
   <button type="button" className="secondary-button" data-testid="reader-pause"
    disabled={!speaking} onClick={togglePause}>{paused?"继续":"暂停"}</button>
   <button type="button" className="secondary-button" data-testid="reader-stop"
    disabled={!speaking} onClick={stopReading}>停止朗读</button>
   <button type="button" className="secondary-button" data-testid="reader-clear"
    disabled={speaking||!text} onClick={()=>{setText("");setStatus("已清空当前文字，没有保存阅读历史。");}}>清空文字</button>
  </div>
  <p className="subtle">此功能直接使用系统朗读，不制作音频文件；关闭页面会停止播放。文本只在当前窗口内存中。</p>
  {status&&<p role="status" className="subtle" data-testid="reader-status">{status}</p>}
 </section>;
}
