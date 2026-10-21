import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
 planMeetingMinutes,MEETING_ACTION_SAMPLE,MEETING_ACTION_HEADERS,MEETING_SAMPLE,
 type MeetingInput,
} from "../lib/meetingMinutes";
import {exportMeetingMinutes} from "../lib/meetingMinutesExport";
const fail=(err:unknown)=>err instanceof Error?err.message:String(err);
export default function MeetingMinutesDesk(){
 const [details,setDetails]=useState<MeetingInput>(MEETING_SAMPLE);
 const [actionsCsv,setActionsCsv]=useState(MEETING_ACTION_SAMPLE);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const planned=useMemo(()=>{try{return {value:planMeetingMinutes(details,actionsCsv),error:""};}
  catch(e){return {value:null,error:fail(e)};}},[details,actionsCsv]);
 function update(field:keyof MeetingInput,value:string){
  setDetails(p=>({...p,[field]:value}));setStatus("");
 }
 async function importCsv(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";setStatus("");
  if(!file)return;
  try{
   if(!/\.csv$/iu.test(file.name)||file.size<1||file.size>150_000)
    throw Error("Choose a UTF-8 action CSV up to 150 KB.");
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   setActionsCsv(decoded.replace(/^\uFEFF/u,""));
   setStatus("Loaded action items from "+file.name+" locally. Review the assignments before export.");
  }catch(e){setStatus("Action CSV import failed: "+fail(e));}
 }
 async function saveSample(){
  try{
   const ok=await exportFile("sentinel-box-meeting-actions-template.csv","\uFEFF"+MEETING_ACTION_SAMPLE+"\r\n");
   setStatus(ok?"Saved an example action CSV. Replace it with actual meeting assignments.":"Save cancelled.");
  }catch(e){setStatus("Could not save template: "+fail(e));}
 }
 async function saveMeeting(){
  if(busy||!planned.value)return;
  setBusy(true);setStatus("");
  try{
   const bytes=await exportMeetingMinutes(planned.value);
   const ok=await exportFile("sentinel-box-meeting-minutes-and-actions.zip",bytes);
   setStatus(ok?
    "Saved real editable Word minutes, plain-text copy, Excel-friendly assigned-actions CSV and ZIP manifest. No reminder or email was sent.":
    "Save cancelled.");
  }catch(e){setStatus("Meeting export failed: "+fail(e));}
  finally{setBusy(false);}
 }
 const text=(field:keyof MeetingInput,label:string,max:number,rows:number)=>
  <label className="field-label">{label}
   <textarea data-testid={"meeting-"+field} className="field text-editor" rows={rows} maxLength={max}
    spellCheck={false} value={details[field]} onChange={e=>update(field,e.target.value)}/>
  </label>;
 const short=(field:keyof MeetingInput,label:string,max:number,type:"text"|"date"="text")=>
  <label className="field-label">{label}
   <input data-testid={"meeting-"+field} className="field" type={type} maxLength={max}
    value={details[field]} onChange={e=>update(field,e.target.value)}/>
  </label>;
 return <section data-testid="meeting-minutes-desk" className="panel">
  <p className="eyebrow">SENTINEL BOX · BUSINESS WORKFLOWS</p>
  <h3>Meeting Minutes → Editable Word + Assigned Actions CSV</h3>
  <p className="subtle">会议结束后输入真实记录、明确决议与负责人，生成可编辑的 Word 纪要和可在 Excel 打开的任务 CSV。仅整理<strong>你明确输入的内容</strong>；不会虚构录音转写、出席者、决策，也不会发出邮件或自动安排会议。</p>
  <div className="tools-pair">
   {short("title","会议主题 / Meeting title",160)}
   {short("meetingDate","会议日期 / Meeting date",10,"date")}
   {short("location","地点或视频会议方式（可留空）",180)}
   {short("facilitator","主持人 / Facilitator（可留空）",120)}
   {short("nextMeetingDate","下次会议日期（可留空）",10,"date")}
  </div>
  <div className="tools-pair">
   {text("attendees","参会人员 / Attendees（每行一人，仅录入确认出席者）",4500,4)}
   {text("agenda","会议议程 / Agenda（每行一项）",12000,4)}
  </div>
  {text("discussion","讨论记录 / Discussion（手动记录，不会自动生成转录）",24000,5)}
  {text("decisions","明确决定 / Decisions（每行一项，仅填已确认的决议）",12000,4)}
  <div className="actions">
   <button className="secondary-button" type="button" data-testid="meeting-template" onClick={()=>void saveSample()}>
    下载任务 CSV 示例
   </button>
  </div>
  <label className="field-label">导入已有任务 CSV（≤150 KB）
   <input className="field" type="file" data-testid="meeting-import-actions"
    accept=".csv,text/csv" onChange={e=>void importCsv(e)}/>
  </label>
  <label className="field-label">任务列表 CSV：ID、任务、负责人、截止日期、优先级、状态、备注
   <textarea data-testid="meeting-actions-csv" className="field text-editor" rows={7} maxLength={150000}
    spellCheck={false} value={actionsCsv} onChange={e=>{setActionsCsv(e.target.value);setStatus("");}}/>
  </label>
  <p className="subtle">列名必须是 <code>{MEETING_ACTION_HEADERS.join(", ")}</code>；优先级 high / normal / low，状态 todo / in_progress / done。保留 001 等任务编号，导出 CSV 时防止公式注入；最多 80 项任务。</p>
  {planned.error?<p data-testid="meeting-error" role="alert" className="subtle">{planned.error}</p>:planned.value&&<>
   <div data-testid="meeting-summary" className="metrics">
    <span>{planned.value.actions.length} 个明确分配的任务</span>
    <span>{planned.value.counts.todo} 待开始</span>
    <span>{planned.value.counts.inProgress} 进行中</span>
    <span>{planned.value.counts.done} 已完成</span>
    <span>{planned.value.attendees.length} 位记录的参会者</span>
   </div>
   <p className="subtle">当前纪要：{planned.value.meeting.title} · {planned.value.meeting.meetingDate}
    · {planned.value.decisions.length} 项明确决议。以下是<strong>实际导出的任务内容预览</strong>：</p>
   <div data-testid="meeting-action-preview" style={{maxHeight:350,overflow:"auto"}}>
    {planned.value.actions.map(a=><div className="panel" key={a.id} style={{padding:12,marginBottom:10}}>
     <strong>{a.id} · {a.task}</strong>
     <p className="subtle">负责人：{a.owner} · 截止：{a.dueDate} · 优先级：{a.priority} · 状态：{a.status}</p>
     {a.notes&&<p className="subtle">备注：{a.notes}</p>}
    </div>)}
   </div>
   <button className="primary-button" type="button" data-testid="meeting-export" disabled={busy}
    onClick={()=>void saveMeeting()}>{busy?"生成中…":"导出 Word 纪要＋任务 CSV ZIP"}</button>
  </>}
  {status&&<p className="subtle" role="status" data-testid="meeting-status">{status}</p>}
  <p className="subtle">不与日历或云端同步，不发送任务提醒。Word、文本纪要和任务 CSV 仅在你主动保存时导出；请分享前核对人名、期限与敏感会议内容。</p>
 </section>;
}
