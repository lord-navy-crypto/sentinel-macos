import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
 createCommonsRoom,commonsMessage,commonsTask,commonsToggleTask,commonsFile,
 exportCommonsPacket,importCommonsPacket,mergeCommonsPackets,safeAttachmentName,
 MAX_FILE_BYTES,MAX_TOTAL_BYTES,type CommonsRoom,type CommonsPacket,type CommonsAttachment,
} from "../lib/commonsKit";

type View="files"|"chat"|"tasks"|"members";
const tabs:{key:View;name:string}[]=[
 {key:"files",name:"Files · 文件"},{key:"chat",name:"Messages · 留言"},
 {key:"tasks",name:"Tasks · 任务"},{key:"members",name:"Team · 成员"},
];
function errorText(e:unknown):string {return e instanceof Error?e.message:String(e);}
function sizeText(n:number):string{return n>=1_000_000?(n/1_000_000).toFixed(2)+" MB":(n/1000).toFixed(1)+" KB";}

export default function CommonsDesk(){
 const [teamName,setTeamName]=useState("Our project");
 const [myName,setMyName]=useState("");
 const [packet,setPacket]=useState<CommonsPacket|null>(null);
 const [tab,setTab]=useState<View>("files");
 const [draft,setDraft]=useState("");
 const [taskTitle,setTaskTitle]=useState("");
 const [taskOwner,setTaskOwner]=useState("");
 const [memberDraft,setMemberDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const room=packet?.room??null;
 const attachments=useMemo(()=>new Map((packet?.attachments??[]).map(f=>[f.id,f.bytes])),[packet]);
 const totalBytes=room?.files.reduce((total,f)=>total+f.size,0)??0;
 const author=myName.trim()||room?.members[0]||"Team member";
 function notify(action:()=>void){
  try{action();setStatus("Saved in this temporary room. Export a Team ZIP to preserve or send it.");}
  catch(e){setStatus(errorText(e));}
 }
 function create(){
  notify(()=>{
   if(packet)throw Error("Export the current room before creating another; use Reset room explicitly.");
   const next=createCommonsRoom(teamName,myName);
   setPacket({room:next,attachments:[]});setTab("files");
  });
 }
 function updateRoom(next:CommonsRoom){
  setPacket(current=>current?{...current,room:next}:null);
 }
 function addChat(){
  if(!room)return;
  notify(()=>{updateRoom(commonsMessage(room,author,draft));setDraft("");setTab("chat");});
 }
 function addTask(){
  if(!room)return;
  notify(()=>{updateRoom(commonsTask(room,taskTitle,taskOwner.trim()||author));setTaskTitle("");});
 }
 function addMember(){
  if(!room)return;
  notify(()=>{
   const name=memberDraft.trim();
   if(!name||name.length>60)throw Error("Member name must be 1–60 characters.");
   if(room.members.includes(name))throw Error("That member already exists.");
   if(room.members.length>=50)throw Error("Room supports at most 50 member labels.");
   updateRoom({...room,members:[...room.members,name]});setMemberDraft("");
  });
 }
 async function chooseFiles(e:ChangeEvent<HTMLInputElement>){
  const files=Array.from(e.target.files??[]);e.target.value="";
  if(!packet||files.length===0)return;
  setBusy(true);setStatus("");
  try{
   // Stage the entire selection first. A rejected file leaves the room unchanged.
   let draftRoom=packet.room;
   const next:CommonsAttachment[]=[];
   for(const file of files){
    if(file.size<1||file.size>MAX_FILE_BYTES)throw Error(file.name+": file must be 1 byte–8 MB.");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const result=await commonsFile(draftRoom,file.name,author,bytes);
    draftRoom=result.room;next.push(result.attachment);
   }
   setPacket(current=>current?{room:draftRoom,attachments:[...current.attachments,...next]}:null);
   setStatus("Added "+next.length+" file(s). Export the Team ZIP to preserve or share them.");
  }catch(err){setStatus("No files added: "+errorText(err));}
  finally{setBusy(false);}
 }
 async function saveTeam(){
  if(!packet)return;
  setBusy(true);setStatus("");
  try{
   const data=await exportCommonsPacket(packet);
   const saved=await exportFile("universal-commons-"+safeAttachmentName(packet.room.name).replace(/\s+/g,"-")+".zip",data);
   setStatus(saved?"Team ZIP exported successfully. The receiver can import it using Universal Box.":"Export cancelled.");
  }catch(e){setStatus("Export failed: "+errorText(e));}
  finally{setBusy(false);}
 }
 async function receiveTeam(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  setBusy(true);setStatus("");
  try{
   if(file.size>30_000_000)throw Error("Team ZIP exceeds 30 MB.");
   const incoming=await importCommonsPacket(new Uint8Array(await file.arrayBuffer()));
   if(packet){
    if(packet.room.id!==incoming.room.id)
     throw Error("This ZIP belongs to a different team. Export the current room, then Reset room before importing it.");
    const merged=mergeCommonsPackets(packet,incoming);
    setPacket(merged);
    setStatus("Merged matching team packets. No messages or files were silently overwritten. Export the updated package to share.");
   }else{
    setPacket(incoming);
    setMyName(incoming.room.members[0]??"");
    setStatus("Imported offline team room. Changes stay local until you export another package.");
   }
   setTab("files");
  }catch(e){setStatus("Import refused: "+errorText(e));}
  finally{setBusy(false);}
 }
 function downloadAttachment(id:string,name:string){
  const bytes=attachments.get(id);
  if(!bytes){setStatus("Attachment bytes are unavailable.");return;}
  // Files are never executed; receiving them is always a deliberate download.
  const blob=new Blob([Uint8Array.from(bytes)],{type:"application/octet-stream"});
  const url=URL.createObjectURL(blob);
  try{
   const link=document.createElement("a");link.href=url;link.download=safeAttachmentName(name);
   document.body.appendChild(link);link.click();link.remove();
   setStatus("Saved a local copy of "+name+". Inspect unfamiliar files before opening.");
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),3000);}
 }
 function reset(){
  if(!window.confirm("Leave this temporary room? Unsaved edits and attachments will be lost unless exported as a Team ZIP."))return;
  setPacket(null);setStatus("Temporary room reset. Previously exported ZIP files are unaffected.");
 }
 return <section className="panel" aria-label="Universal Commons offline teams">
  <p className="eyebrow">UNIVERSAL COMMONS · LOCAL-FIRST TEAM HANDOFF</p>
  <h2>共享文件与团队工作空间</h2>
  <p className="subtle">免费、不需要账号：把留言、任务和文件放进一个可携带的团队 ZIP，发给其他人导入。没有服务器、云存储或自动同步。</p>
  <div style={{padding:12,border:"1px solid var(--line,#cbd5e1)",borderRadius:12,marginBottom:16}}>
   <strong>本版是离线协作包，不是实时群聊。</strong>
   <p className="subtle">消息只会在导出文件并由对方导入后传递。当前页面不会长期保存附件；离开或关闭前请导出。团队成员名字只是标签，不是经过身份认证的权限。</p>
  </div>
  {!room?<div className="panel">
   <h3>创建共享空间 · Create a room</h3>
   <div className="tools-pair">
    <label className="field-label">团队名称<input className="field" maxLength={100} value={teamName} onChange={e=>setTeamName(e.target.value)}/></label>
    <label className="field-label">你的昵称<input className="field" maxLength={60} value={myName} onChange={e=>setMyName(e.target.value)} placeholder="例如 Alex"/></label>
   </div>
   <div className="actions"><button className="primary-button" type="button" disabled={busy} onClick={create}>创建免费团队空间</button></div>
   <p className="subtle">已经收到团队包？直接导入即可，不需要先创建团队。</p>
  </div>:<>
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
    <div><h3 style={{marginBottom:4}}>{room.name}</h3><p className="subtle">{room.members.length} 位成员标签 · {room.files.length} 个附件 · {sizeText(totalBytes)} / {sizeText(MAX_TOTAL_BYTES)}</p></div>
    <div className="actions">
     <button type="button" className="primary-button" disabled={busy} onClick={()=>void saveTeam()}>导出团队 ZIP</button>
     <button type="button" className="secondary-button" disabled={busy} onClick={reset}>关闭当前空间</button>
    </div>
   </div>
   <label className="field-label">以谁的名字留言
    <input className="field" maxLength={60} value={myName} onChange={e=>setMyName(e.target.value)} placeholder={room.members[0]}/>
   </label>
   <div className="pill-row" role="group" aria-label="Team workspace sections">
    {tabs.map(item=><button type="button" key={item.key}
     className={tab===item.key?"pill active-pill":"pill"} onClick={()=>setTab(item.key)}>{item.name}</button>)}
   </div>
   {tab==="files"&&<div className="panel">
    <h3>团队文件 · Drag or select</h3>
    <p className="subtle">单文件最多 8 MB，所有附件最多 24 MB，最多 30 个。ZIP 内存储 SHA-256 校验值，导入时核验内容；不会静默覆盖电脑上的任何文件。</p>
    <input className="field" type="file" aria-label="Add team attachments" multiple disabled={busy} onChange={e=>void chooseFiles(e)}/>
    {room.files.length===0?<p className="subtle">尚未添加附件。</p>:room.files.map(file=>
     <div className="task-row" key={file.id}>
      <div className="task-copy"><strong>{file.name}</strong><div className="subtle">{sizeText(file.size)} · {file.addedBy} · SHA-256 {file.sha256.slice(0,10)}…</div></div>
      <button className="secondary-button" type="button" onClick={()=>downloadAttachment(file.id,file.name)}>保存文件</button>
     </div>)}
   </div>}
   {tab==="chat"&&<div className="panel">
    <h3>团队留言 · Messages</h3>
    <p className="subtle">用于离线交接与讨论记录；不是实时聊天，也不会发送系统通知。</p>
    <textarea className="field text-editor" rows={3} maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="写下需要对方了解的内容…"/>
    <div className="actions"><button className="primary-button" type="button" onClick={addChat} disabled={!draft.trim()}>添加留言</button></div>
    {room.messages.length===0?<p className="subtle">暂无留言。</p>:room.messages.map(msg=>
     <div className="task-row" key={msg.id}>
      <div className="task-copy"><strong>{msg.author}</strong><span className="subtle"> · {new Date(msg.createdAt).toLocaleString()}</span><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{msg.text}</p></div>
     </div>)}
   </div>}
   {tab==="tasks"&&<div className="panel">
    <h3>团队任务 · Tasks</h3>
    <div className="tools-pair">
     <label className="field-label">任务内容<input className="field" maxLength={200} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="例如：检查设计稿"/></label>
     <label className="field-label">负责人<input className="field" maxLength={60} value={taskOwner} onChange={e=>setTaskOwner(e.target.value)} placeholder="可留空"/></label>
    </div>
    <button className="primary-button" type="button" onClick={addTask} disabled={!taskTitle.trim()}>添加任务</button>
    {room.tasks.map(task=><div className="task-row" key={task.id}>
     <label className="task-copy"><input type="checkbox" checked={task.done} onChange={()=>notify(()=>updateRoom(commonsToggleTask(room,task.id)))}/> {task.title} <span className="subtle">· {task.assignee}</span></label>
    </div>)}
   </div>}
   {tab==="members"&&<div className="panel">
    <h3>团队成员 · Members</h3>
    <p className="subtle">这些是协作包内的姓名标签。离线 ZIP 本身不具备认证或访问控制，不要向不信任的人发送敏感文件。</p>
    <div className="actions"><input className="field" maxLength={60} placeholder="成员昵称" value={memberDraft} onChange={e=>setMemberDraft(e.target.value)}/>
     <button className="secondary-button" type="button" onClick={addMember}>添加标签</button></div>
    <ul>{room.members.map(name=><li key={name}>{name}</li>)}</ul>
   </div>}
  </>}
  <div className="panel" style={{marginTop:16}}>
   <h3>接收团队包 · Import / Merge</h3>
   <input className="field" type="file" accept=".zip,application/zip" aria-label="Import team ZIP" disabled={busy} onChange={e=>void receiveTeam(e)}/>
   <p className="subtle">相同空间 ID 的包可以合并留言、任务和文件；冲突不会静默覆盖。不同空间必须单独打开。收到文件后依然可以通过邮件、消息软件或局域网工具转交给其他人。</p>
  </div>
  {busy&&<p role="status">正在本机处理附件和校验…</p>}
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}
