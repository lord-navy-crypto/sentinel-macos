import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {readBookmarksHtml,bookmarksToCsv,bookmarksToMarkdown} from "../lib/bookmarkImport";
import {importIcs,icsToCsv} from "../lib/icsImportAudit";
import {inspectSubtitleQuality,subtitleQualityCsv} from "../lib/subtitleQuality";
import type {SubtitleFormat} from "../lib/universalLab";

export type NewToolsMode="bookmark-import"|"ics-review"|"subtitle-audit";
const reason=(e:unknown)=>e instanceof Error?e.message:String(e);
const sampleBookmarks='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><DT><A HREF="https://example.org/reference">Reference Link</A>\n<DT><A HREF="https://example.org/notes?a=1&amp;b=2">学习资料</A></DL>';
const sampleIcs="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:demo1@example.local\r\nDTSTART:20261112T090000Z\r\nDTEND:20261112T100000Z\r\nSUMMARY:Science Demo\r\nLOCATION:Lab\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:demo2@example.local\r\nDTSTART:20261112T093000Z\r\nDTEND:20261112T103000Z\r\nSUMMARY:Project Meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
const sampleSubtitle="1\n00:00:01,000 --> 00:00:02,500\nHello world.\n\n2\n00:00:02,300 --> 00:00:03,600\n大家好\n\n3\n00:00:18,000 --> 00:00:18,300\nThis line should be checked.";
async function importText(event:ChangeEvent<HTMLInputElement>,exts:string[],maxBytes:number):Promise<string|null>{
 const f=event.target.files?.[0];event.target.value="";if(!f)return null;
 if(!exts.some(x=>f.name.toLowerCase().endsWith(x))||f.size>maxBytes)
  throw Error("Select a supported file of at most "+maxBytes.toLocaleString()+" bytes.");
 return new TextDecoder("utf-8",{fatal:true}).decode(await f.arrayBuffer());
}
export default function NewToolsDesk({mode}:{mode:NewToolsMode}){
 const [bookmarks,setBookmarks]=useState(sampleBookmarks),[ics,setIcs]=useState(sampleIcs);
 const [subtitle,setSubtitle]=useState(sampleSubtitle),[format,setFormat]=useState<SubtitleFormat>("srt");
 const [maxCps,setMaxCps]=useState(20),[gapSeconds,setGapSeconds]=useState(10);
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const bookmarkReport=useMemo(()=>{try{return {value:readBookmarksHtml(bookmarks),error:""};}
  catch(e){return {value:null,error:reason(e)};}},[bookmarks]);
 const icsReport=useMemo(()=>{try{return {value:importIcs(ics),error:""};}
  catch(e){return {value:null,error:reason(e)};}},[ics]);
 const subtitleReport=useMemo(()=>{try{return {value:inspectSubtitleQuality(subtitle,format,maxCps,gapSeconds),error:""};}
  catch(e){return {value:null,error:reason(e)};}},[subtitle,format,maxCps,gapSeconds]);
 async function load(e:ChangeEvent<HTMLInputElement>,type:NewToolsMode){
  setStatus("");
  try{
   const opts=type==="bookmark-import"?{exts:[".html",".htm"],max:1_000_000}:
    type==="ics-review"?{exts:[".ics"],max:500_000}:{exts:[".srt",".vtt"],max:2_000_000};
   const selectedName=e.target.files?.[0]?.name??"";
   const contents=await importText(e,opts.exts,opts.max);
   if(contents===null)return;
   if(type==="bookmark-import")setBookmarks(contents);
   else if(type==="ics-review")setIcs(contents);
   else{setSubtitle(contents);setFormat(selectedName.toLowerCase().endsWith(".vtt")?"vtt":"srt");}
   setStatus("Loaded the selected file locally. No network requests or source-file changes.");
  }catch(err){setStatus("Import: "+reason(err));}
 }
 async function save(kind:"bookmark-csv"|"bookmark-md"|"ics-csv"|"subtitle-csv"|"subtitle-json"){
  if(busy)return;setBusy(true);setStatus("");
  try{
   let filename="",content="";
   if(kind==="bookmark-csv"||kind==="bookmark-md"){
    const data=readBookmarksHtml(bookmarks);
    filename=kind==="bookmark-csv"?"sentinel-bookmarks.csv":"sentinel-bookmarks.md";
    content=kind==="bookmark-csv"?bookmarksToCsv(data.entries):bookmarksToMarkdown(data.entries);
   }else if(kind==="ics-csv"){
    filename="sentinel-calendar-events.csv";content=icsToCsv(importIcs(ics).events);
   }else{
    const report=inspectSubtitleQuality(subtitle,format,maxCps,gapSeconds);
    filename=kind==="subtitle-csv"?"sentinel-subtitle-qa.csv":"sentinel-subtitle-qa.json";
    content=kind==="subtitle-csv"?subtitleQualityCsv(report):JSON.stringify({format,...report},null,2);
   }
   const ok=await exportFile(filename,content);
   setStatus(ok?"Saved "+filename+" locally. Original data unchanged.":"Save cancelled.");
  }catch(err){setStatus("Export: "+reason(err));}finally{setBusy(false);}
 }
 return <section className="panel" data-testid="new-tools-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE TOOL EXPANSION</p>
  {mode==="bookmark-import"&&<>
   <h3>浏览器书签 HTML → CSV / Markdown</h3>
   <p className="subtle">导入浏览器导出的 Netscape 风格书签 HTML，提取网页标题和链接；自动忽略非 HTTP(S)、带账号密码的地址并去除重复 URL。不会运行 HTML/脚本或访问其中的网站。</p>
   <label className="field-label">选择导出的 .html 书签文件<input className="field" data-testid="bookmarks-file" type="file" accept=".html,.htm,text/html" onChange={e=>void load(e,"bookmark-import")}/></label>
   <label className="field-label">HTML 内容<textarea data-testid="bookmarks-source" className="field text-editor" rows={8} maxLength={1000000} value={bookmarks} onChange={e=>setBookmarks(e.target.value)} spellCheck={false}/></label>
   {bookmarkReport.error?<p role="alert">{bookmarkReport.error}</p>:bookmarkReport.value&&<>
    <p className="subtle" data-testid="bookmarks-stats">{bookmarkReport.value.entries.length} 可用书签 · {bookmarkReport.value.duplicates} 重复 URL · {bookmarkReport.value.rejected} 不支持/不安全链接</p>
    <div style={{maxHeight:240,overflow:"auto"}}>{bookmarkReport.value.entries.slice(0,15).map((x,i)=><p key={i}>{x.title} — {x.host}</p>)}</div>
   </>}
   <div className="actions">
    <button className="primary-button" type="button" data-testid="bookmarks-csv-export" disabled={busy||!bookmarkReport.value} onClick={()=>void save("bookmark-csv")}>导出 CSV</button>
    <button type="button" data-testid="bookmarks-md-export" disabled={busy||!bookmarkReport.value} onClick={()=>void save("bookmark-md")}>导出 Markdown</button>
   </div>
  </>}
  {mode==="ics-review"&&<>
   <h3>ICS 日历文件导入与冲突检查</h3>
   <p className="subtle">导入 UTC 的非重复 VEVENT 日程，检查相互重叠的时间段，并导出 CSV。为了避免时区误读，本工具明确拒绝需要 TZID、本地浮动时间、全天事件、重复规则的日历；不修改系统日历。</p>
   <label className="field-label">选择 .ics 日历文件<input className="field" data-testid="ics-file" type="file" accept=".ics,text/calendar" onChange={e=>void load(e,"ics-review")}/></label>
   <label className="field-label">ICS 内容<textarea data-testid="ics-source" className="field text-editor" rows={9} maxLength={500000} value={ics} onChange={e=>setIcs(e.target.value)} spellCheck={false}/></label>
   {icsReport.error?<p role="alert">{icsReport.error}</p>:icsReport.value&&<>
    <p data-testid="ics-stats" className="subtle">{icsReport.value.events.length} 个事件 · {icsReport.value.overlaps.length} 对时间冲突 · 所有时间为 UTC</p>
    <div style={{maxHeight:250,overflow:"auto"}}>{icsReport.value.events.slice(0,20).map((x,i)=><p key={i}>{i+1}. {x.start} → {x.end} · {x.summary}</p>)}</div>
    {icsReport.value.overlaps.length>0&&<p role="status">冲突：{icsReport.value.overlaps.slice(0,20).map(x=>"#"+x.first+"/#"+x.second).join("，")}</p>}
   </>}
   <button type="button" className="primary-button" data-testid="ics-csv-export" disabled={busy||!icsReport.value} onClick={()=>void save("ics-csv")}>导出 UTC 日程 CSV</button>
  </>}
  {mode==="subtitle-audit"&&<>
   <h3>SRT / VTT 字幕质量审计</h3>
   <p className="subtle">只读检查字幕时间倒序、相邻重叠、长时间空白、显示过短/过长以及字符阅读速度，导出 CSV 或 JSON 报告，不改变原字幕。字符/秒只是启发式指标，不是翻译质量评分。</p>
   <label className="field-label">导入 .srt 或 .vtt 文件<input className="field" type="file" accept=".srt,.vtt" data-testid="subtitle-qa-file" onChange={e=>void load(e,"subtitle-audit")}/></label>
   <div className="tools-pair">
    <label className="field-label">字幕格式<select data-testid="subtitle-qa-format" className="field" value={format} onChange={e=>setFormat(e.target.value as SubtitleFormat)}><option value="srt">SRT</option><option value="vtt">WebVTT</option></select></label>
    <label className="field-label">过快阈值（字符/秒）<input data-testid="subtitle-qa-cps" className="field" type="number" min={5} max={100} value={maxCps} onChange={e=>setMaxCps(Number(e.target.value))}/></label>
    <label className="field-label">超长空白阈值（秒）<input data-testid="subtitle-qa-gap" className="field" type="number" min={1} max={120} value={gapSeconds} onChange={e=>setGapSeconds(Number(e.target.value))}/></label>
   </div>
   <label className="field-label">字幕内容<textarea data-testid="subtitle-qa-source" className="field text-editor" rows={9} maxLength={2000000} value={subtitle} onChange={e=>setSubtitle(e.target.value)} spellCheck={false}/></label>
   {subtitleReport.error?<p role="alert">{subtitleReport.error}</p>:subtitleReport.value&&<>
    <p data-testid="subtitle-qa-stats" className="subtle">{subtitleReport.value.count} 条字幕 · {subtitleReport.value.warnings.length} 项提醒 · 平均 {subtitleReport.value.averageCps.toFixed(1)} 字符/秒</p>
    <div style={{maxHeight:250,overflow:"auto"}}>{subtitleReport.value.warnings.slice(0,30).map((x,i)=><p key={i}>#{x.cue} {x.category}: {x.details}</p>)}</div>
   </>}
   <div className="actions">
    <button className="primary-button" type="button" data-testid="subtitle-qa-json-export" disabled={busy||!subtitleReport.value} onClick={()=>void save("subtitle-json")}>导出 JSON</button>
    <button type="button" data-testid="subtitle-qa-csv-export" disabled={busy||!subtitleReport.value} onClick={()=>void save("subtitle-csv")}>导出 CSV</button>
   </div>
  </>}
  {status&&<p role="status" data-testid="new-tools-status" className="subtle">{status}</p>}
  <p className="subtle">所有内容只在当前本地工作台处理。导出前请确认书签和日历中是否包含敏感信息。</p>
 </section>;
}
