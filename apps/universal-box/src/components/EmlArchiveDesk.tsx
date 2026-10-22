import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {inspectLocalEml,emlTextSummary,EML_MAX_BYTES,type EmlRecord} from "../lib/safeEmlReader";
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function EmlArchiveDesk(){
 const [mail,setMail]=useState<EmlRecord|null>(null);
 const [filename,setFilename]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 async function load(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(!files.length||busy)return;
  if(files.length!==1){setStatus("只能一次选择一封邮件，之前的有效邮件保留。");return;}
  const file=files[0];
  if(!/\.eml$/iu.test(file.name)||file.size<25||file.size>EML_MAX_BYTES){
   setStatus("选择 25 bytes–2 MB 的 .eml 邮件档案；原预览不变。");return;
  }
  setBusy(true);setStatus("");
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   const parsed=inspectLocalEml(bytes);
   setMail(parsed);setFilename(file.name);
   setStatus("已在本机读取一封邮件，只显示纯文本与附件元数据；没有访问邮箱或网络。");
  }catch(e){setStatus("邮件无法安全读取，旧邮件仍可查看："+errorText(e));}
  finally{setBusy(false);}
 }
 async function save(){
  if(!mail||busy)return;
  setBusy(true);setStatus("");
  try{
   const done=await exportFile("eml-text-only-summary.txt",emlTextSummary(mail));
   setStatus(done?"已导出所见纯文本摘要；源 .eml 未更改。":"已取消保存，邮件预览仍在。");
  }catch(e){setStatus("导出失败："+errorText(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="eml-desk">
  <p className="eyebrow">SENTINEL BOX · CLASSIC EMAIL ARCHIVES · LOCAL ONLY</p>
  <h2>EML 邮件档案查看器 · Text-Only Archive Inspector</h2>
  <p className="subtle">只读查看您手动导出的 .eml 文件：主题、发件人、收件人、时间和纯文本正文。HTML 邮件、远程跟踪图片、脚本都不会渲染；附件仅列文件名与类型，<strong>不会打开、下载或执行附件。</strong></p>
  <label className="field-label">选择本地 .eml（25 bytes–2 MB）
   <input data-testid="eml-file" className="field" type="file" accept=".eml,message/rfc822" disabled={busy}
    onChange={e=>void load(e)}/>
  </label>
  <p className="subtle">只支持常见 RFC822/MIME 子集，复杂加密签名、所有未知编码及完整邮件客户端功能不在首版范围。邮件可含私人内容，请勿直接公开导出的摘要。</p>
  {mail&&<>
   <div className="panel" data-testid="eml-headers">
    <p><strong>档案文件：</strong>{filename}</p>
    <p><strong>主题：</strong>{mail.subject}</p>
    <p><strong>发件方：</strong>{mail.from}</p>
    <p><strong>收件方：</strong>{mail.to}</p>
    <p><strong>日期：</strong>{mail.date}</p>
    <p><strong>附件数：</strong>{mail.attachmentCount}</p>
   </div>
   <label className="field-label">安全纯文本正文（不会执行邮件中的 HTML/脚本）
    <textarea data-testid="eml-text" className="field text-editor" rows={12}
     readOnly value={mail.text||"(邮件未包含 text/plain 正文；HTML 内容不自动转换或展示)"}/>
   </label>
   <h3>附件清单（只显示元数据）</h3>
   <div data-testid="eml-attachments" className="task-list">
    {mail.attachments.length?mail.attachments.map((item,index)=><div className="task-row" key={index}>
     <span className="task-copy">{item.name} · {item.contentType} · {item.encodedBytes.toLocaleString()} encoded bytes</span>
    </div>):<p className="subtle">没有标记为附件的 MIME 部件。</p>}
   </div>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="eml-export" disabled={busy}
     onClick={()=>void save()}>另存所见纯文本摘要 TXT</button>
    <button type="button" className="secondary-button" data-testid="eml-clear" disabled={busy}
     onClick={()=>{setMail(null);setFilename("");setStatus("当前邮件预览已清空，磁盘上的 .eml 文件未改变。");}}>清空预览</button>
   </div>
  </>}
  {status&&<p className="subtle" role="status" data-testid="eml-status">{status}</p>}
 </section>;
}
