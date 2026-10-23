import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {parseLocalIcs,icsToCsv,ICS_MAX_BYTES,type IcsArchive} from "../lib/localIcsArchive";
const detail=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function LocalIcsImportDesk(){
 const [archive,setArchive]=useState<IcsArchive|null>(null);
 const [name,setName]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 async function select(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";
  if(busy||!files.length)return;
  if(files.length!==1){setStatus("只能选择一份日历档案，旧结果已保留。");return;}
  const file=files[0];
  if(!/\.ics$/iu.test(file.name)||file.size<40||file.size>ICS_MAX_BYTES){
   setStatus("请选择 40 bytes–750 KB 的 .ics；原有档案没有改变。");return;
  }
  setBusy(true);setStatus("");
  try{
   const raw=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   const parsed=parseLocalIcs(raw,file.size);
   setArchive(parsed);setName(file.name);
   setStatus("已离线读取 "+parsed.events.length+" 项日程，没有导入系统日历或发送邀请。");
  }catch(e){setStatus("读取失败，之前的日程档案仍保留："+detail(e));}
  finally{setBusy(false);}
 }
 async function save(){
  if(!archive||busy)return;
  setBusy(true);setStatus("");
  try{
   const result=await exportFile("sentinel-calendar-from-ics.csv",icsToCsv(archive));
   setStatus(result?"已导出 "+archive.events.length+" 条真实日程 CSV；源 .ics 未修改。":"已取消保存，档案仍在。");
  }catch(e){setStatus("导出失败："+detail(e));}
  finally{setBusy(false);}
 }
 return <div className="panel" data-testid="ics-import-desk">
  <h3>ICS → CSV · 只读日历档案检查</h3>
  <p className="subtle">反向读取已经保存的 .ics 文件，列出日程的 UTC 起止时间、全天标记、标题与地点，并保存 CSV。仅支持<strong>非重复的 UTC 时间（以 Z 结尾）和 DATE 全天事件</strong>；如果包含本地浮动时刻、TZID 或 RRULE 周期事件，会明确拒绝，而不猜测时间。</p>
  <label className="field-label">选择一份本地 .ics（≤750 KB、≤400 个事件）
   <input type="file" className="field" data-testid="ics-import-file" accept=".ics,text/calendar" disabled={busy}
    onChange={e=>void select(e)}/>
  </label>
  {archive&&<>
   <div className="metrics" data-testid="ics-import-stats">
    <span>文件：{name}</span>
    <span>日程：{archive.events.length}</span>
    <span>UTC 时间重叠：{archive.timedConflicts} 组</span>
    <span>跳过的非关键字段：{archive.ignoredProperties}</span>
   </div>
   <p className="subtle">全天日程的结束日期是<strong>不包含的下一天</strong>（iCalendar 规范）。冲突统计只涵盖可直接比较的 UTC 定时事件；不检查系统时区或个人日历。屏幕预览 30 条，CSV 导出全部验证通过的事件。</p>
   <div data-testid="ics-import-rows" className="task-list">
    {archive.events.slice(0,30).map((x,i)=><div className="task-row" key={i}>
     <span className="task-copy">{i+1}. {x.start} → {x.end} {x.allDay?"[全天]":"[UTC]"} · {x.title} · {x.location}</span>
    </div>)}
   </div>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="ics-export-csv"
     disabled={busy} onClick={()=>void save()}>导出全部日程 CSV</button>
    <button type="button" className="secondary-button" data-testid="ics-clear"
     disabled={busy} onClick={()=>{setArchive(null);setName("");setStatus("已清空当前日程预览，源文件未更改。");}}>清空预览</button>
   </div>
  </>}
  <p className="subtle">安全范围：文件只在当前窗口内存中读取，不访问 Apple Calendar、Outlook、日历订阅链接或私人账户。日程可能包含敏感会议资料，请自行检查导出的 CSV。</p>
  {status&&<p role="status" className="subtle" data-testid="ics-import-status">{status}</p>}
 </div>;
}
