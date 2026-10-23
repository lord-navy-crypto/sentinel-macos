import {useMemo,useState,type ChangeEvent} from "react";
import JSZip from "jszip";
import LocalIcsImportDesk from "./LocalIcsImportDesk";
import {exportFile} from "../lib/output";
import {type SubtitleFormat} from "../lib/universalLab";
import {generateCalendarBatch,planOrganizedArchive,resyncSubtitleCues,type AnchorTime} from "../lib/lifeMediaWorkflow";

export type LifeMediaMode="subtitle"|"organize"|"calendar";
const modes:{id:LifeMediaMode;name:string}[]=[
 {id:"subtitle",name:"专业字幕校时"},
 {id:"organize",name:"文件自动分类打包"},
 {id:"calendar",name:"批量日程与冲突检测"}
];
const sampleSub="1\n00:00:01,000 --> 00:00:02,500\n欢迎来到 Sentinel Box\n\n2\n00:00:05,000 --> 00:00:07,000\n免费本地工具示例";
const sampleCalendar="2026-11-12T09:00 | 2026-11-12T10:00 | 科学展示 | 实验室\n2026-11-12T10:30 | 2026-11-12T11:15 | 项目讨论 | 会议室";
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
function milliseconds(raw:string):number{
 if(!/^\d{1,2}:[0-5]\d:[0-5]\d[.,]\d{3}$/u.test(raw.trim()))throw Error("请输入 HH:MM:SS.mmm 时间，例如 00:01:20.500");
 const groups=raw.trim().replace(",",".").split(/[:.]/u).map(Number);
 const ms=((groups[0]*60+groups[1])*60+groups[2])*1000+groups[3];
 if(ms>359999999)throw Error("时间不能超过 99:59:59.999。");
 return ms;
}
function timingText(n:number):string{
 const h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60,ms=n%1000;
 return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":")+"."+String(ms).padStart(3,"0");
}
export default function LifeMediaDesk({initialMode="subtitle"}:{initialMode?:LifeMediaMode}){
 const [mode,setMode]=useState<LifeMediaMode>(initialMode),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [sub,setSub]=useState(sampleSub),[from,setFrom]=useState<SubtitleFormat>("srt"),
  [to,setTo]=useState<SubtitleFormat>("srt"),[a1,setA1]=useState("00:00:01.000"),[b1,setB1]=useState("00:00:02.000"),
  [a2,setA2]=useState("00:00:07.000"),[b2,setB2]=useState("00:00:08.100");
 const sync=useMemo(()=>{
  try{
   const first:AnchorTime={originalMs:milliseconds(a1),correctedMs:milliseconds(b1)};
   const last:AnchorTime={originalMs:milliseconds(a2),correctedMs:milliseconds(b2)};
   return {value:resyncSubtitleCues(sub,from,to,first,last),error:""};
  }catch(e){return {value:null,error:err(e)};}
 },[sub,from,to,a1,b1,a2,b2]);
 const [files,setFiles]=useState<File[]>([]);
 const organized=useMemo(()=>{try{return {value:planOrganizedArchive(files),error:""};}
  catch(e){return {value:null,error:err(e)};}},[files]);
 const [schedule,setSchedule]=useState(sampleCalendar);
 const calendar=useMemo(()=>{try{return {value:generateCalendarBatch(schedule,"universal-box-preview"),error:""};}
  catch(e){return {value:null,error:err(e)};}},[schedule]);
 async function importSubtitles(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;setStatus("");
  try{
   if(file.size>2_000_000)throw Error("字幕不得大于 2 MB。");
   const format=file.name.toLowerCase().endsWith(".srt")?"srt":file.name.toLowerCase().endsWith(".vtt")?"vtt":null;
   if(!format)throw Error("只支持 SRT 或 VTT。");
   setSub(await file.text());setFrom(format);setTo(format);setStatus("已在本机读取字幕。");
  }catch(e){setStatus("导入失败："+err(e));}
 }
 async function saveSubtitle(){
  if(!sync.value||busy)return;
  setBusy(true);setStatus("");
  try{const saved=await exportFile("universal-box-resynced."+to,sync.value.text);
   setStatus(saved?"已保存校准后的字幕；原文件未修改。":"已取消保存。");
  }catch(e){setStatus("导出失败："+err(e));}
  finally{setBusy(false);}
 }
 function chooseFiles(event:ChangeEvent<HTMLInputElement>){
  setFiles([...(event.target.files??[])]);event.target.value="";setStatus("");
 }
 async function saveOrganized(){
  if(!organized.value||busy)return;
  setBusy(true);setStatus("");
  try{
   const zip=new JSZip(),manifest:{source:string;path:string;bucket:string;size:number}[]=[];
   for(const item of organized.value){
    const content=new Uint8Array(await files[item.index].arrayBuffer());
    zip.file(item.path,content);
    manifest.push({source:item.source,path:item.path,bucket:item.bucket,size:content.length});
   }
   zip.file("universal-box-organize-manifest.json",JSON.stringify({count:manifest.length,files:manifest},null,2));
   const result=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:4}});
   if(result.length>20_000_000)throw Error("分类后的 ZIP 超过 20 MB，请减少输入文件。");
   const saved=await exportFile("universal-box-organized.zip",result);
   setStatus(saved?"已保存分类 ZIP，源文件完全保留。":"已取消保存。");
  }catch(e){setStatus("分类失败："+err(e));}
  finally{setBusy(false);}
 }
 async function saveCalendar(){
  if(!calendar.value||busy)return;
  setBusy(true);setStatus("");
  try{
   // Generate a unique batch UID at each export. Preview UIDs remain deterministic for tests.
   const result=generateCalendarBatch(schedule,crypto.randomUUID());
   const saved=await exportFile("universal-box-multi-calendar.ics",result.ics);
   setStatus(saved?"已保存 "+result.events.length+" 个日程事件，未发送邮件或邀请。":"已取消保存。");
  }catch(e){setStatus("导出失败："+err(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" aria-label="Life and media tools">
  <p className="eyebrow">SENTINEL BOX · OFFLINE LIFE & MEDIA</p>
  <h2>生活与影音工具工作台</h2>
  <p className="subtle">三种实际处理任务：两点校准字幕的逐渐漂移、整理文件为分类 ZIP、批量生成日历并检查时间冲突。没有账号、付费、默认扫描磁盘或网络上传。</p>
  <div className="pill-row" role="group" aria-label="Life and media tools">
   {modes.map(x=><button type="button" key={x.id} aria-pressed={mode===x.id}
    className={mode===x.id?"pill active-pill":"pill"} onClick={()=>{setMode(x.id);setStatus("");}}>{x.name}</button>)}
  </div>
  {mode==="subtitle"&&<>
   <h3>双锚点字幕校时 / Subtitle Drift Repair</h3>
   <p className="subtle">不只是统一平移：输入字幕原始的两个时刻，以及对应正确的两个时刻，自动进行线性时间缩放和平移，修复随播放时间累积的不同步。最大变速比例 ±20%，最多 1,000 条字幕。字幕文字原样保留。</p>
   <label className="field-label">导入 .srt / .vtt
    <input className="field" data-testid="life-sub-file" type="file" accept=".srt,.vtt" onChange={e=>void importSubtitles(e)}/>
   </label>
   <div className="tools-pair">
    <label className="field-label">源格式<select className="field" value={from} onChange={e=>setFrom(e.target.value as SubtitleFormat)}><option value="srt">SRT</option><option value="vtt">VTT</option></select></label>
    <label className="field-label">导出格式<select data-testid="life-sub-format" className="field" value={to} onChange={e=>setTo(e.target.value as SubtitleFormat)}><option value="srt">SRT</option><option value="vtt">VTT</option></select></label>
   </div>
   <div className="tools-pair">
    <label className="field-label">第一锚点 · 原字幕时间<input data-testid="life-sub-a1" className="field" value={a1} onChange={e=>setA1(e.target.value)}/></label>
    <label className="field-label">第一锚点 · 正确时间<input data-testid="life-sub-b1" className="field" value={b1} onChange={e=>setB1(e.target.value)}/></label>
    <label className="field-label">第二锚点 · 原字幕时间<input data-testid="life-sub-a2" className="field" value={a2} onChange={e=>setA2(e.target.value)}/></label>
    <label className="field-label">第二锚点 · 正确时间<input data-testid="life-sub-b2" className="field" value={b2} onChange={e=>setB2(e.target.value)}/></label>
   </div>
   <label className="field-label">字幕原文<textarea className="field text-editor" data-testid="life-sub-source" rows={8} maxLength={2000000} value={sub} onChange={e=>setSub(e.target.value)}/></label>
   {sync.error?<p role="alert" className="subtle">{sync.error}</p>:sync.value&&<>
    <p className="subtle" data-testid="life-sub-stats">{sync.value.count} 条字幕 · 速度倍率 {sync.value.scale.toFixed(6)} · 偏移 {Math.round(sync.value.offsetMs)} ms · 检测到 {sync.value.overlaps} 处相邻重叠</p>
    <pre data-testid="life-sub-preview" style={{maxHeight:260,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{sync.value.text.slice(0,18000)}</pre>
   </>}
   <button type="button" data-testid="life-sub-export" className="primary-button" disabled={busy||!sync.value} onClick={()=>void saveSubtitle()}>保存校准后的字幕文件</button>
  </>}
  {mode==="organize"&&<>
   <h3>本地文件分组 · Smart File Organizer</h3>
   <p className="subtle">仅处理你手动选择的最多 50 个文件（总大小不超过 16 MB）。按扩展名分到 Documents、Pictures、Audio、Videos、Archives、Code、Other 子目录中。预览所有名称后，保存含清单的 ZIP；不会擅自移动、删除或改名原文件。</p>
   <label className="field-label">明确选择待分类文件
    <input data-testid="life-organize-files" className="field" type="file" multiple onChange={chooseFiles}/>
   </label>
   {organized.error&&files.length>0?<p role="alert" className="subtle">{organized.error}</p>:organized.value&&<>
    <p className="subtle" data-testid="life-organize-count">{organized.value.length} 文件 · 7 类分类目录</p>
    <div style={{maxHeight:270,overflow:"auto",border:"1px solid #c8d4e0",borderRadius:8,padding:12}}>
     {organized.value.map(item=><p key={item.index} style={{overflowWrap:"anywhere",margin:"5px 0"}}>{item.source} → <strong>{item.path}</strong></p>)}
    </div>
   </>}
   <button type="button" data-testid="life-organize-export" className="primary-button" disabled={busy||!organized.value} onClick={()=>void saveOrganized()}>生成并保存分类 ZIP</button>
  </>}
  {mode==="calendar"&&<>
   <h3>批量生成日历 .ics · 事件冲突检测</h3>
   <p className="subtle">每行：<code>开始时间 | 结束时间 | 活动名称 | 地点</code>。输入 UTC 时间 YYYY-MM-DDTHH:mm；导出的事件带 Z 时区标记，将由日历应用转换到当地时区。生成一份含多个 VEVENT 的 ICS，本工具不会代发邀请。</p>
   <label className="field-label">多行日程（UTC）
    <textarea data-testid="life-calendar-rows" className="field text-editor" rows={9} maxLength={12000} value={schedule} onChange={e=>setSchedule(e.target.value)}/>
   </label>
   {calendar.error?<p role="alert" className="subtle">{calendar.error}</p>:calendar.value&&<>
    <p data-testid="life-calendar-count" className="subtle">{calendar.value.events.length} 个事件，{calendar.value.overlaps.length} 组时间冲突</p>
    {calendar.value.overlaps.length>0&&<p role="alert">请检查：{calendar.value.overlaps.map(o=>"#"+o.first+" 与 #"+o.second).join("，")} 的时间重叠。</p>}
    <div style={{maxHeight:250,overflow:"auto"}}>{calendar.value.events.map((e,i)=><p key={i}>{i+1}. {e.start} → {e.end} · <strong>{e.summary}</strong> · {e.location}</p>)}</div>
   </>}
   <button type="button" data-testid="life-calendar-export" className="primary-button" disabled={busy||!calendar.value} onClick={()=>void saveCalendar()}>导出多事件 .ics 日历</button>
   <LocalIcsImportDesk/>
  </>}
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">设计限制：不改变原始字幕、视频或文件；本地分类只是打包副本；日历文件需用户自行导入，导入前应确认日期与 UTC 时区。</p>
 </section>;
}
