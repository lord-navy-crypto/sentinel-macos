import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {consumeHandoff,subscribeRecentOutputs} from "../lib/recentOutputs";
import {
 createCommonsRoom,commonsFile,exportCommonsPacket,importCommonsPacket,
 MAX_FILE_BYTES,MAX_TOTAL_BYTES,type CommonsPacket,
} from "../lib/commonsKit";

type PairDevice={instance:string;label:string;ip:string;port:number};
type PairStatus={active:boolean;secondsRemaining:number};
type PairRequest={id:string;label:string;address:string;code:string;remainingSeconds:number};
type PairInbox={id:string;label:string};
type CodeEvent={code:string};
type ProgressEvent={sentBytes:number;totalBytes:number};
const MAX_FILES=30;
const encode=(bytes:Uint8Array):string=>{
 const parts:string[]=[];
 for(let i=0;i<bytes.length;i+=49152)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+49152))));
 return parts.join("").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const decode=(s:string):Uint8Array=>{
 if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>40_000_000)throw Error("接收文件编码不符合格式或长度限制");
 const binary=atob(s.replace(/-/g,"+").replace(/_/g,"/"));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
};
function sizeLabel(n:number){return n>=1_000_000?(n/1_000_000).toFixed(2)+" MB":(n/1000).toFixed(1)+" KB";}
export default function NearbyPairDesk({room,onImport}:{
 room:CommonsPacket|null;
 onImport:(data:CommonsPacket)=>void;
}){
 const [ready,setReady]=useState<PairStatus|null>(null);
 const [pending,setPending]=useState<PairRequest[]>([]);
 const [inbox,setInbox]=useState<PairInbox[]>([]);
 const [peers,setPeers]=useState<PairDevice[]>([]);
 const [chosen,setChosen]=useState<PairDevice|null>(null);
 const [files,setFiles]=useState<File[]>([]);
 const [sendRoom,setSendRoom]=useState(false);
 const [deviceName,setDeviceName]=useState("My Mac");
 const [working,setWorking]=useState(false);
 const [discovering,setDiscovering]=useState(false);
 const [pairCode,setPairCode]=useState("");
 const [progress,setProgress]=useState<ProgressEvent|null>(null);
 const [received,setReceived]=useState<CommonsPacket|null>(null);
 const [message,setMessage]=useState("");
 const mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  const unlisten: Array<()=>void>=[];
  void listen<CodeEvent>("commons-pair-code",event=>{
   if(mounted.current)setPairCode(event.payload.code);
  }).then(off=>{if(mounted.current)unlisten.push(off);else off();}).catch(()=>{});
  void listen<ProgressEvent>("commons-pair-progress",event=>{
   if(mounted.current)setProgress(event.payload);
  }).then(off=>{if(mounted.current)unlisten.push(off);else off();}).catch(()=>{});
  async function poll(){
   try{
    const [status,requests,entries]=await Promise.all([
     invoke<PairStatus>("commons_pair_status"),
     invoke<PairRequest[]>("commons_pair_pending"),
     invoke<PairInbox[]>("commons_pair_inbox"),
    ]);
    if(mounted.current){setReady(status);setPending(requests);setInbox(entries);}
   }catch{/* desktop native connection is optional; button errors are surfaced */}
  }
  void poll();
  const timer=window.setInterval(()=>void poll(),1300);
  return ()=>{
   mounted.current=false;window.clearInterval(timer);
   unlisten.forEach(off=>off());
   // Pairing is app-scoped: explicitly enabled for five minutes or until
   // the user presses Stop. Switching workspaces must not silently reject a request.
  };
 },[]);
 async function refreshPeers(){
  setDiscovering(true);setMessage("");
  try{setPeers(await invoke<PairDevice[]>("commons_pair_discover"));}
  catch(e){setMessage("设备搜索失败："+String(e));}
  finally{setDiscovering(false);}
 }
 async function startReceiver(){
  setWorking(true);setMessage("");setReceived(null);
  try{
   const status=await invoke<PairStatus>("commons_pair_ready");
   setReady(status);setPending([]);setInbox([]);
   setMessage("接收已开启，其他 Mac 可以在软件内看到你。有效期 5 分钟；只接收你主动同意的请求。");
  }catch(e){setMessage("无法开启接收："+String(e));}
  finally{setWorking(false);}
 }
 async function stopReceiver(){
  setWorking(true);
  try{await invoke("commons_pair_stop");setReady(null);setPending([]);setMessage("已关闭附近设备接收。");}
  catch(e){setMessage("停止失败："+String(e));}
  finally{setWorking(false);}
 }
 useEffect(()=>{
  const acceptSavedResult=()=>{
   const file=consumeHandoff("nearby");
   if(!file)return;
   setSendRoom(false);
   setFiles([file]);
   setMessage("已从其他 Universal Box 工具导入："+file.name+"。请搜索接收方并发送请求。");
  };
  const unsubscribe=subscribeRecentOutputs(acceptSavedResult);
  acceptSavedResult();
  return unsubscribe;
 },[]);
 function selectFiles(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(selected.length>MAX_FILES||selected.some(f=>f.size===0||f.size>MAX_FILE_BYTES)
     ||selected.reduce((n,f)=>n+f.size,0)>MAX_TOTAL_BYTES){
   setMessage("文件超过局域网团队包限制：最多 30 个、每个不超过 8 MB、总共不超过 24 MB。");
   setFiles([]);return;
  }
  setSendRoom(false);setFiles(selected);setMessage(selected.length+" 个文件已准备好，尚未发送。");
 }
 async function outgoingZip():Promise<Uint8Array>{
  if(sendRoom){
   if(!room)throw Error("当前没有可以发送的团队空间");
   return exportCommonsPacket(room);
  }
  if(!files.length)throw Error("请先选择要发送的文件");
  let draft=createCommonsRoom("Nearby files",deviceName.trim()||"Nearby Mac");
  const attachments:CommonsPacket["attachments"]=[];
  for(const file of files){
   const data=new Uint8Array(await file.arrayBuffer());
   const result=await commonsFile(draft,file.name,deviceName.trim()||"Nearby Mac",data);
   draft=result.room;attachments.push(result.attachment);
  }
  return exportCommonsPacket({room:draft,attachments});
 }
 async function send(){
  if(!chosen||working)return;
  setWorking(true);setMessage("");setPairCode("");setProgress(null);
  try{
   const output=await outgoingZip();
   await invoke("commons_pair_send",{
    ip:chosen.ip,port:chosen.port,label:deviceName.trim()||"My Mac",
    packetBase64:encode(output),
   });
   setMessage("对方已同意并完成加密接收验证。请让对方在本机确认导入和保存文件。");
  }catch(e){setMessage("发送未完成："+String(e));}
  finally{setWorking(false);}
 }
 async function respond(id:string,approve:boolean){
  try{
   await invoke("commons_pair_respond",{id,approve});
   setPending(old=>old.filter(p=>p.id!==id));
   setMessage(approve?"已同意，正在接收加密数据并验证完整性。":"已拒绝本次传输请求。");
  }catch(e){setMessage("处理请求失败："+String(e));}
 }
 async function openReceived(entry:PairInbox){
  setWorking(true);setMessage("");
  try{
   const encoded=await invoke<string>("commons_pair_take",{id:entry.id});
   const packet=await importCommonsPacket(decode(encoded));
   setReceived(packet);setInbox(old=>old.filter(x=>x.id!==entry.id));
   setMessage("文件包已经通过加密验证，请核对下面的文件名后再确认导入。");
  }catch(e){setMessage("无法检查收到的文件："+String(e));}
  finally{setWorking(false);}
 }
 function approveImport(){
  if(!received)return;
  try{
   onImport(received);setReceived(null);
   setMessage("已导入团队文件列表。要长期保存，请在文件列表点击“保存文件”，或导出团队 ZIP。");
  }catch(e){setMessage("未能导入："+String(e));}
 }
 const total=files.reduce((n,f)=>n+f.size,0);
 const pct=progress&&progress.totalBytes>0?Math.round(progress.sentBytes/progress.totalBytes*100):0;
 return <section className="panel ub-pair" aria-label="无需外部消息的附近文件传输">
  <p className="eyebrow">UNIVERSAL BOX · NEARBY SHARE · IN-APP APPROVAL</p>
  <h2>附近传文件 · 不用复制密钥</h2>
  <p className="subtle">两台 Mac 使用同一可互通的局域网。接收者开启接收，发送者选择设备并点击发送请求；接收者直接点同意或拒绝。无需聊天软件、登录或人工粘贴加密邀请。</p>
  <div className="ub-pair-columns">
   <div className="ub-pair-pane">
    <div className="ub-pair-step"><span>1</span><div><strong>我是接收方</strong><small>开启可发现状态，再确认传输</small></div></div>
    <button className="primary-button" disabled={working||ready?.active===true}
     type="button" onClick={()=>void startReceiver()}>允许附近 Mac 请求发送文件（5 分钟）</button>
    {ready?.active&&<>
     <p className="ub-pair-active" role="status">接收已开启 · 还剩约 {ready.secondsRemaining} 秒</p>
     <button className="secondary-button" type="button" disabled={working} onClick={()=>void stopReceiver()}>停止接收</button>
    </>}
    {pending.length>0&&<div className="ub-pair-requests" role="region" aria-label="等待确认的传输请求">
     {pending.map(req=><div key={req.id} className="ub-pair-request">
      <strong>来自 {req.label} 的文件传输请求</strong>
      <small>局域网地址 {req.address} · 约 {req.remainingSeconds} 秒后过期。设备名称未经过认证。</small>
      <div className="ub-pair-code">{req.code}</div>
      <p className="subtle">请与发送者 Mac 上显示的六位码核对；不一致就拒绝。接收前不会读取对方的文件内容。</p>
      <div className="actions">
       <button type="button" className="primary-button" onClick={()=>void respond(req.id,true)}>核对一致，同意接收</button>
       <button type="button" className="secondary-button" onClick={()=>void respond(req.id,false)}>拒绝</button>
      </div>
     </div>)}
    </div>}
    {inbox.length>0&&<div className="ub-pair-inbox">
     <h3>已收到、待检查的文件</h3>
     {inbox.map(entry=><div className="task-row" key={entry.id}>
      <strong>{entry.label}</strong>
      <button className="primary-button" disabled={working} onClick={()=>void openReceived(entry)}>查看文件列表</button>
     </div>)}
    </div>}
   </div>
   <div className="ub-pair-pane">
    <div className="ub-pair-step"><span>2</span><div><strong>我是发送方</strong><small>选文件、找电脑、发请求</small></div></div>
    <label className="field-label">本机显示名称
     <input className="field" maxLength={30} value={deviceName} onChange={e=>setDeviceName(e.target.value)} placeholder="例如 My Mac"/>
    </label>
    <label className="field-label">选择要发送的文件（无需先创建团队）
     <input className="field" type="file" multiple disabled={working} onChange={selectFiles}/>
    </label>
    {files.length>0&&<div className="ub-pair-selected">
     <strong>{files.length} 个文件 · {sizeLabel(total)}</strong>
     <div>{files.slice(0,6).map((f,i)=><small key={i} dir="auto">{f.name}</small>)}</div>
    </div>}
    {room&&<label className="ub-pair-checkbox">
     <input type="checkbox" checked={sendRoom} onChange={e=>setSendRoom(e.target.checked)}/>
     改为发送当前 Universal Commons 团队空间
    </label>}
    <button type="button" className="secondary-button" disabled={discovering||working} onClick={()=>void refreshPeers()}>
     {discovering?"正在查找附近 Mac…":"查找附近可接收的 Mac"}
    </button>
    <div className="ub-pair-devices">
     {peers.length===0?<p className="subtle">还没有发现设备。请先让对方点击左侧「允许附近 Mac 请求发送文件」。</p>:
      peers.map(peer=><button className={chosen?.ip===peer.ip&&chosen.port===peer.port?"ub-pair-device selected":"ub-pair-device"}
        key={peer.instance+"-"+peer.ip+":"+peer.port} type="button" onClick={()=>setChosen(peer)} disabled={working}>
        <span aria-hidden="true">▣</span><span><strong>{peer.label}</strong><small>{peer.ip}:{peer.port} · 身份需通过配对码核对</small></span>
        <span>{chosen?.ip===peer.ip&&chosen.port===peer.port?"✓":"→"}</span>
       </button>)}
    </div>
    <button className="primary-button" type="button" disabled={!chosen||working||(!sendRoom&&!files.length)}
     onClick={()=>void send()}>{working?"等待对方同意或传输中…":"向选中的 Mac 发送请求 →"}</button>
    {pairCode&&<div className="ub-pair-code-block" role="status">
     <strong>双方核对的配对码</strong>
     <div className="ub-pair-code">{pairCode}</div>
     <p className="subtle">对方也会显示这一组数字。请确认双方一致；否则取消传输。</p>
    </div>}
    {progress&&<div role="status" className="ub-pair-progress">
     <progress max={progress.totalBytes||1} value={progress.sentBytes}/>
     <small>已写入加密数据 {sizeLabel(progress.sentBytes)} / {sizeLabel(progress.totalBytes)}（{pct}%）；最终仍需对方解密确认。</small>
    </div>}
   </div>
  </div>
  {received&&<div className="ub-pair-review">
   <h3>确认导入：{received.room.name}</h3>
   <p>{received.room.files.length} 个附件 · {received.room.messages.length} 条留言 · {received.room.tasks.length} 项任务</p>
   <ul>{received.room.files.map(f=><li key={f.id} dir="auto">{f.name} — {sizeLabel(f.size)}</li>)}</ul>
   <button type="button" className="primary-button" onClick={approveImport}>确认导入到当前团队空间</button>
   <button type="button" className="secondary-button" onClick={()=>{setReceived(null);setMessage("已丢弃本次预览内容，未导入。");}}>拒绝导入</button>
  </div>}
  {message&&<p className="subtle" role="status">{message}</p>}
  <p className="subtle">安全说明：设备名称可以伪造；请只批准熟悉的电脑并核对六位配对码。两端使用临时密钥进行加密。文件接收后还须确认导入，原文件不会自动覆盖。当前仅支持可互通的局域网；这不是跨互联网传输或操作系统级 AirDrop。</p>
 </section>;
}
