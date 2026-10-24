import {useEffect,useMemo,useState,type ChangeEvent} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {exportFile} from "../lib/output";
import {canReceiveLan,keyFromNearbyInput,parseCommonsLanInvite} from "../lib/commonsLanUi";
import CommonsLiveChatDesk from "./CommonsLiveChatDesk";
import {
 createCommonsRoom,commonsMessage,commonsTask,commonsToggleTask,commonsFile,
 exportCommonsPacket,importCommonsPacket,mergeCommonsPackets,safeAttachmentName,
 MAX_FILE_BYTES,MAX_TOTAL_BYTES,type CommonsRoom,type CommonsPacket,type CommonsAttachment,
} from "../lib/commonsKit";

type View="files"|"chat"|"tasks"|"members";
type LanPhase="waiting"|"sending"|"delivered"|"expired"|"stopped"|"idle";
type LanShare={active:boolean;invites:string[];secondsRemaining:number;message:string;phase:LanPhase;sentBytes:number;totalBytes:number};
type LanTransferProgress={receivedBytes:number;totalBytes:number};
type NearbyShare={instance:string;label:string;ip:string;port:number};
type StunSample={server:string;result:string|null;error:string|null};
type StunObservation={server:string;localEndpoint:string;observedPublicEndpoint:string;samples:StunSample[];mappingConsistent:boolean|null;note:string};
const B64_BLOCK=49152;
export function binaryToLanBase64(bytes:Uint8Array):string{
 const chunks:string[]=[];
 for(let i=0;i<bytes.length;i+=B64_BLOCK)
  chunks.push(btoa(String.fromCharCode(...bytes.subarray(i,i+B64_BLOCK))));
 return chunks.join("").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function lanBase64ToBinary(input:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+$/.test(input)||input.length>40_000_000)throw Error("Received LAN packet encoding is invalid.");
 const raw=atob(input.replace(/-/g,"+").replace(/_/g,"/"));
 const bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
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
 const [lan,setLan]=useState<LanShare|null>(null);
 const [selectedInvite,setSelectedInvite]=useState("");
 const [incomingInvite,setIncomingInvite]=useState("");
 const [incoming,setIncoming]=useState<CommonsPacket|null>(null);
 const [transportMode,setTransportMode]=useState<"lan"|"public">("lan");
 const [lanAction,setLanAction]=useState<"send"|"receive">("receive");
 const [revealInvite,setRevealInvite]=useState(false);
 const [networkBusy,setNetworkBusy]=useState(false);
 const [networkStatus,setNetworkStatus]=useState("");
 const [transferProgress,setTransferProgress]=useState<LanTransferProgress|null>(null);
 const [nearby,setNearby]=useState<NearbyShare[]>([]);
 const [selectedNearby,setSelectedNearby]=useState<NearbyShare|null>(null);
 const [nearbyKey,setNearbyKey]=useState("");
 const [discovering,setDiscovering]=useState(false);
 const [discoveryError,setDiscoveryError]=useState("");
 const [stun,setStun]=useState<StunObservation|null>(null);
 const [stunBusy,setStunBusy]=useState(false);
 const [stunError,setStunError]=useState("");
 const nativeLan=isTauri();
 const nearbyKeyReady=useMemo(()=>{
  if(!selectedNearby)return false;
  try{keyFromNearbyInput(nearbyKey,selectedNearby);return true;}catch{return false;}
 },[nearbyKey,selectedNearby]);
 // Discovery happens only when user presses Refresh; do not poll mDNS automatically.
 useEffect(()=>()=>{if(isTauri())void invoke("commons_lan_stop").catch(()=>{});},[]);
 async function runP2pProbe(){
  setStunBusy(true);setStunError("");setStun(null);
  try{setStun(await invoke<StunObservation>("commons_p2p_stun_probe"));}
  catch(e){setStunError(errorText(e));}
  finally{setStunBusy(false);}
 }
 useEffect(()=>{
  if(!lan?.active)return;
  let live=true;
  const poll=window.setInterval(()=>{
   void invoke<LanShare>("commons_lan_status").then(result=>{
    if(!live)return;
    setLan(result);
    if(!result.active){
     setSelectedInvite(""); // Expired/consumed capability should no longer appear in the editor.
     setNetworkStatus(result.phase==="delivered"
      ?"发送方已将加密数据写入连接。接收方仍需完成认证、ZIP 和附件 SHA-256 校验，然后明确同意导入。"
      :result.phase==="expired"?"一次性邀请已到期，若需重发请重新开启共享。"
      :"局域网共享已停止。未完成的接收不得视为成功。");
    }
   }).catch(()=>{});
  },4000);
  return ()=>{live=false;window.clearInterval(poll);};
 },[lan?.active]);
 async function scanNearby(){
  if(!nativeLan){setDiscoveryError("Nearby discovery is available in the Mac desktop app.");return;}
  setDiscovering(true);setDiscoveryError("");setSelectedNearby(null);setNearbyKey("");
  try{setNearby(await invoke<NearbyShare[]>("commons_lan_discover"));}
  catch(e){setDiscoveryError(errorText(e));}
  finally{setDiscovering(false);}
 }
 function chooseNearby(peer:NearbyShare){
  setSelectedNearby(peer);setNearbyKey("");setIncoming(null);
  setNetworkStatus("已选择附近设备。请私下取得发送方的密钥，完整邀请的地址必须与所选设备一致。");
 }
 async function pasteNearbyKey(){
  try{
   const pasted=(await navigator.clipboard.readText()).trim();
   if(!selectedNearby)throw Error("Select the nearby sender first.");
   setNearbyKey(keyFromNearbyInput(pasted,selectedNearby));
   setNetworkStatus("已提取邀请密钥。点击接收即可从选中的附近设备传输。");
  }catch(e){setNetworkStatus("无法读取邀请密钥："+errorText(e));}
 }
 async function receiveNearby(){
  if(!selectedNearby)return;
  try{
   const key=keyFromNearbyInput(nearbyKey,selectedNearby);
   await receiveLanWithInvite("uboxlan://"+selectedNearby.ip+":"+selectedNearby.port+"/"+key);
  }catch(e){setNetworkStatus("邀请与所选设备不一致："+errorText(e));}
 }
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
   setPacket({room:next,attachments:[]});setTab("files");setLanAction("send");
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
   setStatus(saved?"Team ZIP exported successfully. The receiver can import it using Sentinel Box.":"Export cancelled.");
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

 async function startLan(){
  if(!packet)return;
  setNetworkBusy(true);setNetworkStatus("");
  try{
   const zipped=await exportCommonsPacket(packet);
   const output=await invoke<LanShare>("commons_lan_start",{packetBase64:binaryToLanBase64(zipped)});
   setLan(output);
   setSelectedInvite(output.invites.find(link=>!link.includes("127.0.0.1"))??output.invites[0]??"");
   setNetworkStatus("一次性加密共享已开启。仅在可信局域网中私下发送邀请；有效期最多 5 分钟。");
  }catch(e){setNetworkStatus("无法开启局域网共享："+errorText(e));}
  finally{setNetworkBusy(false);}
 }
 async function stopLan(){
  setNetworkBusy(true);
  try{
   await invoke("commons_lan_stop");
   setLan(null);setSelectedInvite("");
   setNetworkStatus("局域网共享已停止。");
  }catch(e){setNetworkStatus(errorText(e));}
  finally{setNetworkBusy(false);}
 }
 async function refreshLan(){
  try{
   const next=await invoke<LanShare>("commons_lan_status");
   setLan(next);
   if(!next.active){
    setSelectedInvite("");
    setNetworkStatus(next.phase==="delivered"
     ?"发送数据已经写入网络连接；请等待接收方独立确认附件 SHA-256 校验成功。"
     :next.phase==="expired"?"一次性共享已到期。":"共享已结束或停止。");
   }
  }catch(e){setNetworkStatus(errorText(e));}
 }
 async function copyLanInvite(){
  try{await navigator.clipboard.writeText(selectedInvite);
   setNetworkStatus("邀请已复制。它包含解密密钥，请只发给预期接收者。");}
  catch{setNetworkStatus("系统不允许自动复制，请手动选中并复制邀请。");}
 }
 async function receiveLan(){
  try{parseCommonsLanInvite(incomingInvite);await receiveLanWithInvite(incomingInvite.trim());}
  catch(e){setNetworkStatus("邀请无效："+errorText(e));}
 }
 async function receiveLanWithInvite(invite:string){
  setNetworkBusy(true);setNetworkStatus("");setTransferProgress(null);
  let unlisten:(()=>void)|null=null;
  try{
   unlisten=await listen<LanTransferProgress>("commons-lan-progress",event=>{
    const progress=event.payload;
    if(progress.totalBytes>0&&progress.totalBytes<=30_000_016
       &&progress.receivedBytes>=0&&progress.receivedBytes<=progress.totalBytes){
      setTransferProgress(progress);
    }
   });
   const encoded=await invoke<string>("commons_lan_receive",{invite});
   const received=await importCommonsPacket(lanBase64ToBinary(encoded));
   if(packet&&received.room.id!==packet.room.id)
    throw Error("收到的是不同团队。请先导出当前团队，再关闭当前空间以接收另一团队。");
   setIncoming(received);
   setNetworkStatus("已完成加密传输、解密和附件 SHA-256 校验。请检查团队名称与文件列表，然后手动确认导入。");
  }catch(e){setIncoming(null);setNetworkStatus("接收失败："+errorText(e));}
  finally{unlisten?.();setNetworkBusy(false);}
 }
 function approveIncoming(){
  if(!incoming)return;
  try{
   const next=packet?mergeCommonsPackets(packet,incoming):incoming;
   setPacket(next);
   if(!packet)setMyName(next.room.members[0]??"");
   setIncoming(null);setNetworkStatus("团队包已导入内存。导出 ZIP 才能长期保存或转交。");
  }catch(e){setNetworkStatus("合并被拒绝："+errorText(e));}
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
  <div className="panel" data-testid="commons-connection-switcher" style={{marginTop:16}}>
   <h3>通讯 · 选择连接方式</h3>
   <p className="subtle">离线 ZIP → 局域网加密传输 → 公网诊断；公网收发仍未实现。</p>
   <div className="pill-row" role="group" aria-label="Communication transport">
    <button type="button" className={transportMode==="lan"?"pill active-pill":"pill"} aria-pressed={transportMode==="lan"}
     onClick={()=>setTransportMode("lan")}>局域网发送与接收</button>
    <button type="button" className={transportMode==="public"?"pill active-pill":"pill"} aria-pressed={transportMode==="public"}
     onClick={()=>setTransportMode("public")}>公网诊断 · 尚不可传输</button>
   </div>
   {!nativeLan&&<p role="status" className="subtle">浏览器仅供界面预览和离线 ZIP；Bonjour、局域网收发及 STUN 探测需要 Mac 桌面应用。</p>}
  </div>
  {transportMode==="lan"&&<div className="panel" data-testid="commons-lan-workflow" style={{marginTop:16}}>
   <p className="eyebrow">LOCAL NETWORK · NO CLOUD · ENCRYPTED</p>
   <h3>局域网加密传输 · LAN Transfer</h3>
   <p className="subtle">同一 Wi-Fi 或有线网络下，发送者开启临时原生 TCP 端口，文件使用 XChaCha20-Poly1305 端到端加密。不依赖外部服务器或账号。</p>
   <p className="subtle">双方都需安装包含局域网功能的 Sentinel Box。Mac 防火墙可能询问是否允许入站连接；访客 Wi-Fi 或 AP 隔离可能阻止设备互通。</p>
   <label className="subtle" style={{display:"flex",alignItems:"center",gap:8}}><input data-testid="commons-show-invitation" type="checkbox" checked={revealInvite} onChange={e=>setRevealInvite(e.target.checked)}/>显示一次性密钥（默认隐藏）</label>
   <div className="pill-row" role="group" aria-label="LAN transfer direction">
    <button type="button" className={lanAction==="send"?"pill active-pill":"pill"} aria-pressed={lanAction==="send"}
     onClick={()=>{setLanAction("send");setNetworkStatus("");}}>1 · 发送</button>
    <button type="button" className={lanAction==="receive"?"pill active-pill":"pill"} aria-pressed={lanAction==="receive"}
     onClick={()=>{setLanAction("receive");setNetworkStatus("");}}>2 · 接收</button>
   </div>
   {lanAction==="send"&&!room&&<p role="status" className="subtle">先创建或导入一个团队空间，才能发送加密文件包。</p>}
   {lanAction==="send"&&room&&<div className="panel">
    <h4>步骤 1 · 准备发送</h4>
    <div className="actions">
     <button className="primary-button" type="button" disabled={!nativeLan||busy||networkBusy||!!lan?.active} onClick={()=>void startLan()}>开启 5 分钟一次性加密发送</button>
     <button className="secondary-button" type="button" disabled={networkBusy||!lan?.active} onClick={()=>void stopLan()}>停止共享</button>
     <button className="secondary-button" type="button" disabled={networkBusy||!lan} onClick={()=>void refreshLan()}>刷新状态</button>
    </div>
    {lan?.active&&<>
     <label className="field-label">选择发送设备的局域网 IP
      <select className="field" value={selectedInvite} onChange={e=>setSelectedInvite(e.target.value)}>
       {lan.invites.map((invite,i)=><option key={invite} value={invite}>{i+1}. {invite.split("/")[2]?.split(":")[0]??"本机"}{invite.includes("127.0.0.1")?" · 仅本机测试":""}</option>)}
      </select>
     </label>
     <label className="field-label">一次性邀请（包含保密密钥）
      <input className="field" type={revealInvite?"text":"password"} readOnly value={selectedInvite} aria-label="Private LAN transfer invitation"/>
     </label>
     <button className="secondary-button" type="button" onClick={()=>void copyLanInvite()}>复制加密邀请</button>
     <p className="subtle">仅私下发给预期接收者；邀请内含解密密钥。5 分钟后到期，完成一次有效传输后自动关闭。</p>
    </>}
   </div>}
   {lanAction==="receive"&&<>
   <div className="panel">
    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",flexWrap:"wrap"}}>
     <h4 style={{margin:0}}>步骤 1 · 查找正在共享的设备（可选）</h4>
     <button type="button" className="secondary-button" disabled={!nativeLan||discovering||networkBusy} onClick={()=>void scanNearby()}>{discovering?"搜索中…":"刷新附近设备"}</button>
    </div>
    <p className="subtle">只有点击「刷新附近设备」才开始约 3 秒的 Bonjour/mDNS 搜索；不持续扫描。附近设备名称不是经过验证的身份。</p>
    {discoveryError&&<p role="alert" className="subtle">设备发现暂时不可用：{discoveryError}。可以使用下方手动邀请。</p>}
    {nearby.length===0?<p className="subtle">{discovering?"搜索附近设备中…":"没有发现正在共享的设备。请让发送方先点击「开启 5 分钟一次性加密发送」。"}</p>:
     nearby.map(peer=><div className="task-row" key={peer.instance+"-"+peer.ip+":"+peer.port}>
      <div className="task-copy"><strong>{peer.label}</strong><div className="subtle">局域网 · {peer.ip}:{peer.port} · 身份尚未验证</div></div>
      <button type="button" className="secondary-button" onClick={()=>chooseNearby(peer)} disabled={!nativeLan||networkBusy}>
       {selectedNearby?.instance===peer.instance&&selectedNearby.ip===peer.ip?"已选择":"选择设备"}
      </button>
     </div>)}
    {selectedNearby&&<div style={{border:"1px solid var(--line,#cbd5e1)",borderRadius:12,padding:12,marginTop:12}}>
      <strong>已选择：{selectedNearby.label}</strong>
      <p className="subtle">附近设备名称可以伪造。为避免陌生设备读取共享内容，发送方的一次性密钥**不会通过局域网自动发现广播**。请从发送方私下取得邀请并粘贴密钥。</p>
      <label className="field-label">一次性密钥或完整邀请（地址须与选择的设备一致）
       <input className="field" type={revealInvite?"text":"password"} autoComplete="off" maxLength={180} value={nearbyKey} onChange={e=>setNearbyKey(e.target.value)} placeholder="43 位一次性密钥"/>
      </label>
      {nearbyKey.trim()&&!nearbyKeyReady&&<p role="alert" className="subtle">
       请核对密钥长度，以及完整邀请中的 IP、端口是否与所选附近设备一致。也可以改用下方手动完整邀请接收。
      </p>}
      <div className="actions">
       <button type="button" className="secondary-button" onClick={()=>void pasteNearbyKey()}>从剪贴板提取邀请密钥</button>
       <button type="button" className="primary-button" disabled={!nativeLan||networkBusy||!nearbyKeyReady} onClick={()=>void receiveNearby()}>向该设备请求加密传输</button>
      </div>
     </div>}
   </div>
   <div className="panel">
    <h4>步骤 2 · 粘贴完整邀请并接收</h4>
    <label className="field-label">粘贴发送者提供的 uboxlan:// 邀请
     <input className="field" type={revealInvite?"text":"password"} maxLength={180} value={incomingInvite} onChange={e=>setIncomingInvite(e.target.value)}
      placeholder="uboxlan://192.168.1.20:49152/一次性密钥" autoComplete="off" aria-label="LAN invitation to receive"/>
    </label>
    <button className="primary-button" type="button" disabled={!nativeLan||networkBusy||!canReceiveLan(incomingInvite)} onClick={()=>void receiveLan()}>
     接收并校验加密团队包
    </button>
    {incoming&&<div style={{border:"1px solid var(--line,#cbd5e1)",borderRadius:12,padding:14,marginTop:12}}>
     <h4>请确认接收内容：{incoming.room.name}</h4>
     <p className="subtle">{incoming.room.files.length} 个文件 · {incoming.room.messages.length} 条留言 · {incoming.room.tasks.length} 项任务</p>
     <ul>{incoming.room.files.slice(0,20).map(f=><li key={f.id}>{f.name} · {sizeText(f.size)}</li>)}</ul>
     <div className="actions">
      <button className="primary-button" type="button" onClick={approveIncoming}>确认导入{packet?"并合并":""}</button>
      <button className="secondary-button" type="button" onClick={()=>{setIncoming(null);setNetworkStatus("收到的内容已放弃，没有导入到团队空间。");}}>拒绝</button>
     </div>
    </div>}
   </div>
   </>}
   {networkBusy&&transferProgress&&<div style={{padding:10,border:"1px solid var(--line,#cbd5e1)",borderRadius:9}}>
    <strong>正在接收加密数据</strong>
    <progress style={{width:"100%"}} aria-label="Encrypted LAN packet received" max={100}
     value={Math.round(transferProgress.receivedBytes/transferProgress.totalBytes*100)}/>
    <p className="subtle">{sizeText(transferProgress.receivedBytes)} / {sizeText(transferProgress.totalBytes)}
     （{Math.round(transferProgress.receivedBytes/transferProgress.totalBytes*100)}%）。传输百分比不等于校验成功；接收结束后仍需验证加密认证及 ZIP 文件哈希。</p>
   </div>}
   {lan&&lanAction==="send"&&<div data-testid="commons-lan-sender-state" role="status"
    style={{padding:12,border:"1px solid var(--line,#cbd5e1)",borderRadius:12}}>
    <strong>{lan.phase==="waiting"?"等待持有邀请的接收方":lan.phase==="sending"?"正在发送加密数据"
     :lan.phase==="delivered"?"已将加密数据写入 TCP 连接":lan.phase==="expired"?"邀请已到期"
     :lan.phase==="stopped"?"共享已停止":"暂无共享"}</strong>
    {lan.phase==="sending"||lan.phase==="delivered"?<>
     <progress data-testid="commons-lan-send-progress" aria-label="Encrypted LAN bytes sent"
      style={{width:"100%"}} max={Math.max(1,lan.totalBytes)} value={Math.min(lan.totalBytes,lan.sentBytes)}/>
     <p className="subtle">{sizeText(lan.sentBytes)} / {sizeText(lan.totalBytes)} ·
      {lan.totalBytes>0?Math.round(lan.sentBytes/lan.totalBytes*100):0}% 的加密载荷已写入 TCP 连接</p>
    </>:null}
    <p className="subtle">发送进度不代表对方成功保存：接收方必须独立完成解密、ZIP 和附件哈希校验，并明确确认导入。</p>
   </div>}
   {lan?.active&&<p className="subtle">一次性邀请剩余约 {lan.secondsRemaining} 秒；成功发送或到期后停止，发送过程中可随时点击「停止共享」中断后续数据。</p>}
   {networkBusy&&<p role="status">正在进行局域网加密操作…</p>}
   {networkStatus&&<p className="subtle" role="status" data-testid="commons-network-status">{networkStatus}</p>}
  </div>}
  <CommonsLiveChatDesk visible={transportMode==="lan"}/>
  {transportMode==="public"&&<div className="panel" data-testid="commons-public-research" style={{marginTop:16}}>
   <p className="eyebrow">P2P RESEARCH · OPT-IN · NO FILE TRANSFER</p>
   <h3>公网连接 · 诊断与后续规划</h3>
   <p className="subtle">未来公网收发还需要可验证的双方身份、双方批准、加密信令和 NAT 直连失败处理。当前不会自动开放公网端口或部署中继，也不能向互联网用户发送团队包。</p>
   <p className="subtle">研究阶段：可使用公开 STUN 服务器观察你的 UDP 公网映射。只有主动点击才联系外部服务器；该服务器能看到本次连接的公网 IP。**这不是已经建立了 P2P 文件连接**，也不会上传任何团队文件。</p>
   <button type="button" className="secondary-button" disabled={!nativeLan||stunBusy} onClick={()=>void runP2pProbe()}>
    {stunBusy?"探测中…":"尝试两处免费 STUN 映射对比"}
   </button>
   {stunError&&<p role="alert" className="subtle">STUN 探测不可用：{stunError}</p>}
   {stun&&<div style={{padding:12,marginTop:10,border:"1px solid var(--line,#cbd5e1)",borderRadius:12}}>
    <p><strong>本机 UDP 地址：</strong>{stun.localEndpoint}</p>
    <p><strong>STUN 观察到的公网地址：</strong>{stun.observedPublicEndpoint}</p>
    <div style={{marginTop:10}}>
     <strong>两个服务器的映射对比（复用同一 UDP 本地端口）</strong>
     {stun.samples.map(item=><div key={item.server} className="task-row">
       <div className="task-copy"><strong>{item.server}</strong><div className="subtle">{item.result??("探测失败："+(item.error??"未知错误"))}</div></div>
      </div>)}
     <p className="subtle">{stun.mappingConsistent===true?"两处观测相同；这仍不能证明能够异地直连。":stun.mappingConsistent===false?"两处观测不同，可能存在目标相关的 NAT 映射；异地打洞更难，但不能由此确定 NAT 类型。":"只有一处或没有可比较的观测，无法判断映射是否一致。"}</p>
    </div>
    <p className="subtle">{stun.note}</p>
    <p className="subtle">观测服务器：{stun.server}。此结果不能预测真实 NAT 穿透成功率；跨网打洞、信令和端到端传输还没有实现。</p>
   </div>}
  </div>}
  <div className="panel" style={{marginTop:16}}>
   <h3>接收团队包 · Import / Merge</h3>
   <input className="field" type="file" accept=".zip,application/zip" aria-label="Import team ZIP" disabled={busy} onChange={e=>void receiveTeam(e)}/>
   <p className="subtle">相同空间 ID 的包可以合并留言、任务和文件；冲突不会静默覆盖。不同空间必须单独打开。收到文件后依然可以通过邮件、消息软件或局域网工具转交给其他人。</p>
  </div>
  {busy&&<p role="status">正在本机处理附件和校验…</p>}
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}
