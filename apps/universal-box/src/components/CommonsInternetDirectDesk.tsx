import {useEffect,useRef,useState} from "react";
import {canQueueDirectFrame,decodeDirectFrame,encodeDirectFrame,rememberDirectMessage,type DirectMessageFrame} from "../lib/commonsDirectMessages";
import {decodeDirectSignal,encodeDirectSignal,finishIceGathering,
 readDirectFingerprint,validDirectChatText,buildCommonsIceServers,summarizeCommonsIceRoute,type IceRouteSummary} from "../lib/commonsInternetRtc";

type Line={id:string;name:string;text:string;self:boolean;received?:boolean};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
/** Manual out-of-band signaling permits opt-in direct WebRTC without operating a signaling server.
 * It is a two-device proof, not a global messenger or a guaranteed NAT traversal solution.
 */
export default function CommonsInternetDirectDesk(){
 const supported=typeof RTCPeerConnection!=="undefined";
 const pcRef=useRef<RTCPeerConnection|null>(null),channelRef=useRef<RTCDataChannel|null>(null);
 const receivedIds=useRef<string[]>([]);
 const [useStun,setUseStun]=useState(false);
 const [ownTurn,setOwnTurn]=useState(false);
 const [turnUrl,setTurnUrl]=useState("");
 const [turnUsername,setTurnUsername]=useState("");
 const [turnCredential,setTurnCredential]=useState("");
 const [icePath,setIcePath]=useState<IceRouteSummary|null>(null);
 const [name,setName]=useState("");
 const [remoteText,setRemoteText]=useState("");
 const [outgoing,setOutgoing]=useState("");
 const [role,setRole]=useState<"offerer"|"answerer"|"">("");
 const [connected,setConnected]=useState(false);
 const [status,setStatus]=useState("未连接 · 未向外部网络发起探测");
 const [busy,setBusy]=useState(false);
 const [draft,setDraft]=useState("");
 const [lines,setLines]=useState<Line[]>([]);
 const [localFingerprint,setLocalFingerprint]=useState("");
 const [remoteFingerprint,setRemoteFingerprint]=useState("");
 const stop=()=>{
  channelRef.current?.close();pcRef.current?.close();
  channelRef.current=null;pcRef.current=null;setConnected(false);setRole("");
  setOutgoing("");setRemoteText("");setLocalFingerprint("");setRemoteFingerprint("");setIcePath(null);
  setLines([]);receivedIds.current=[];setTurnCredential("");setStatus("连接已关闭，临时消息和 TURN 凭证已清空。");
 };
 useEffect(()=>()=>{channelRef.current?.close();pcRef.current?.close();},[]);
 function append(item:Line){
  setLines(old=>[...old,item].slice(-200));
 }
 function attach(channel:RTCDataChannel){
  channelRef.current=channel;
  channel.onopen=()=>{setConnected(true);setStatus("WebRTC DataChannel 已建立加密连接 · 可交换文本");};
  channel.onclose=()=>{setConnected(false);setStatus("数据通道已断开，部分已发送消息可能仍未获对方确认。");};
  channel.onerror=()=>setStatus("数据通道出错；网络可能不允许直连。");
  channel.onmessage=event=>{
   if(typeof event.data!=="string")return;
   const frame=decodeDirectFrame(event.data);
   if(!frame)return;
   if(frame.type==="ack"){
    setLines(old=>old.map(line=>line.self&&line.id===frame.id?{...line,received:true}:line));
    return;
   }
   const observed=rememberDirectMessage(receivedIds.current,frame.id);
   receivedIds.current=observed.ids;
   if(!observed.duplicate)append({id:frame.id,name:frame.nickname,text:frame.text,self:false});
   // Even a retry of an already displayed message gets another ACK.
   try{if(channel.readyState==="open"&&canQueueDirectFrame(channel.bufferedAmount))
    channel.send(encodeDirectFrame({type:"ack",id:frame.id}));}
   catch{/* A later retry can be ACKed after the network recovers. */}
  };
 }
 function createConnection(){
  pcRef.current?.close();channelRef.current=null;setConnected(false);setLines([]);setIcePath(null);receivedIds.current=[];
  const servers=buildCommonsIceServers({publicStun:useStun,ownTurn,turnUrl,turnUsername,turnCredential});
  const peer=new RTCPeerConnection({iceServers:servers});
  pcRef.current=peer;
  peer.ondatachannel=e=>attach(e.channel);
  peer.onconnectionstatechange=()=>{
   if(pcRef.current!==peer)return;
   const state=peer.connectionState;
   if(state==="connected"){
    void peer.getStats().then(report=>{
     if(pcRef.current===peer)setIcePath(summarizeCommonsIceRoute(report));
    }).catch(()=>{if(pcRef.current===peer)setIcePath(null);});
   }else if(state==="failed")setStatus("ICE 连接失败：可能需要可用的 TURN 中继，或当前网络不允许连接。可断开后修改配置重试。");
   else if(state==="disconnected")setStatus("暂时断开，正在等待网络恢复。");
   else if(state==="closed")setConnected(false);
   else if(state==="connecting")setStatus("正在检查 P2P 直连候选地址…");
  };
  return peer;
 }
 async function generateOffer(){
  if(!supported||busy||!name.trim())return;
  setBusy(true);setOutgoing("");setStatus("正在生成连接邀请并搜集本机 ICE 候选地址…");
  try{
   const peer=createConnection();setRole("offerer");
   attach(peer.createDataChannel("commons-text",{ordered:true}));
   await peer.setLocalDescription(await peer.createOffer());
   await finishIceGathering(peer);
   if(!peer.localDescription)throw Error("No local offer generated.");
   setOutgoing(encodeDirectSignal(peer.localDescription));
   setLocalFingerprint(readDirectFingerprint(peer.localDescription.sdp));
   setStatus("Offer 已生成：将整段 JSON 私下发给对方，再将对方回复的 Answer 粘贴到输入框。");
  }catch(e){setStatus("无法建立连接邀请："+errorText(e));}
  finally{setBusy(false);}
 }
 async function generateAnswer(){
  if(!supported||busy||!name.trim())return;
  setBusy(true);setOutgoing("");setStatus("读取对方 Offer 并准备 P2P 应答…");
  try{
   const offer=decodeDirectSignal(remoteText,"offer");
   const peer=createConnection();setRole("answerer");
   await peer.setRemoteDescription(offer);
   setRemoteFingerprint(readDirectFingerprint(offer.sdp));
   await peer.setLocalDescription(await peer.createAnswer());
   await finishIceGathering(peer);
   if(!peer.localDescription)throw Error("No local answer generated.");
   setOutgoing(encodeDirectSignal(peer.localDescription));
   setLocalFingerprint(readDirectFingerprint(peer.localDescription.sdp));
   setStatus("Answer 已生成：将整段 JSON 私下发回 Offer 创建者，等待 DataChannel 打开。");
  }catch(e){setStatus("无法应答连接："+errorText(e));}
  finally{setBusy(false);}
 }
 async function applyAnswer(){
  if(busy||!pcRef.current||role!=="offerer")return;
  setBusy(true);
  try{
   const answer=decodeDirectSignal(remoteText,"answer");
   await pcRef.current.setRemoteDescription(answer);
   setRemoteFingerprint(readDirectFingerprint(answer.sdp));
   setStatus("Answer 已应用，正在尝试 P2P 连接；若失败请检查 NAT、防火墙和中继需求。");
  }catch(e){setStatus("无法应用 Answer："+errorText(e));}
  finally{setBusy(false);}
 }
 async function copyOutgoing(){
  try{await navigator.clipboard.writeText(outgoing);setStatus("连接描述已复制，请通过可信渠道私下发送；它可能包含网络地址信息。");}
  catch(e){setStatus("自动复制失败："+errorText(e));}
 }
 function transmit(frame:DirectMessageFrame):boolean{
  const channel=channelRef.current;
  if(!channel||channel.readyState!=="open"||!canQueueDirectFrame(channel.bufferedAmount)){
   setStatus("数据通道未就绪或发送队列已满，本次消息未写入连接。");return false;
  }
  try{channel.send(encodeDirectFrame(frame));return true;}
  catch(e){setStatus("发送失败："+errorText(e));return false;}
 }
 function send(){
  const value=draft.trim();
  if(!validDirectChatText(value)||!name.trim())return;
  const frame:DirectMessageFrame={type:"message",id:crypto.randomUUID(),nickname:name.trim(),text:value};
  if(!transmit(frame))return;
  append({id:frame.id,name:frame.nickname,text:value,self:true,received:false});
  setDraft("");setStatus("消息已发送到数据通道，正在等待对方应用确认收到。");
 }
 function retryPending(){
  const pending=lines.filter(line=>line.self&&!line.received);
  if(!pending.length)return;
  let sent=0;
  for(const line of pending){
   if(!transmit({type:"message",id:line.id,nickname:line.name,text:line.text}))break;
   sent++;
  }
  if(sent>0)setStatus("已重新发送 "+sent+" 条未确认消息；对方会按原消息编号去重。");
 }
 return <section className="panel" data-testid="commons-direct-p2p" aria-label="Experimental internet direct chat">
  <h4>公网直连实验 · WebRTC DataChannel（一对一）</h4>
  <p className="subtle">这是真实的网络数据通道，不是 STUN 数值演示。但当前采用手动 Offer/Answer 交换、**不会提供默认 TURN 服务器**。可以明确选择自己的 TURN 中继尝试连接受限网络，但不保证所有公网都成功。仍未实现公网多人群聊或账号服务。</p>
  <label className="subtle" style={{display:"flex",alignItems:"center",gap:8}}>
   <input type="checkbox" data-testid="p2p-stun-opt-in" checked={useStun}
    disabled={busy||!!role} onChange={e=>setUseStun(e.target.checked)}/>
   允许本次连接使用公共 STUN 服务发现公网映射（会向 STUN 服务披露本机公网 IP）
  </label>
  <div className="panel" data-testid="p2p-turn-settings">
   <label className="subtle" style={{display:"flex",alignItems:"center",gap:8}}>
    <input type="checkbox" data-testid="p2p-own-turn" checked={ownTurn}
     disabled={busy||!!role} onChange={e=>setOwnTurn(e.target.checked)}/>
    使用自己提供的 TURN 中继（可选，不由 Sentinel 提供账号或服务器）
   </label>
   {ownTurn&&<div>
    <label className="field-label">TURN 服务器地址
     <input className="field" data-testid="p2p-turn-url" value={turnUrl}
      maxLength={250} disabled={busy||!!role} onChange={e=>setTurnUrl(e.target.value)}
      placeholder="turns:relay.example.org:5349?transport=tcp" autoComplete="off"/>
    </label>
    <label className="field-label">TURN 用户名
     <input className="field" data-testid="p2p-turn-username" value={turnUsername}
      maxLength={256} disabled={busy||!!role} onChange={e=>setTurnUsername(e.target.value)}
      autoComplete="off"/>
    </label>
    <label className="field-label">TURN 临时密码（不写入磁盘，断开时清除）
     <input className="field" data-testid="p2p-turn-credential" type="password"
      value={turnCredential} maxLength={512} disabled={busy||!!role}
      onChange={e=>setTurnCredential(e.target.value)} autoComplete="off"/>
    </label>
    <p className="subtle">仅在点击建立连接后使用这些设置。中继服务器能看到连接 IP 与传输元数据，可能产生带宽费用；WebRTC 的 DTLS 仍加密聊天内容。建议使用 TLS 的 turns: 地址。</p>
   </div>}
  </div>
  <p className="subtle">Offer / Answer 可能含有双方网络候选地址与 DTLS 指纹；只能通过可信的另一个渠道交换，并由双方核对身份。DTLS 保护传输，但不验证昵称或对方的真实身份。</p>
  <p className="subtle">消息显示「对方应用已确认收到」仅代表远端软件回了 ACK，不代表对方已阅读、保存或确认真实身份。网络中断时可以重试未确认消息，重复编号不会在同一连接中重复显示。</p>
  {!supported&&<p role="alert">当前浏览器/WebView 不支持 WebRTC DataChannel。</p>}
  <label className="field-label">你的昵称
   <input data-testid="p2p-nickname" className="field" value={name} maxLength={24}
    onChange={e=>setName(e.target.value)}/>
  </label>
  <div className="actions">
   <button type="button" className="secondary-button" data-testid="p2p-offer"
    disabled={!supported||busy||!!role||!name.trim()} onClick={()=>void generateOffer()}>A · 创建 Offer</button>
   <button type="button" className="secondary-button" data-testid="p2p-answer"
    disabled={!supported||busy||!!role||!name.trim()||!remoteText.trim()}
    onClick={()=>void generateAnswer()}>B · 粘贴 Offer 后生成 Answer</button>
   <button type="button" className="secondary-button" data-testid="p2p-apply"
    disabled={busy||role!=="offerer"||!remoteText.trim()}
    onClick={()=>void applyAnswer()}>A · 粘贴 Answer 后连接</button>
   <button type="button" className="secondary-button" data-testid="p2p-close" onClick={stop}>断开并清空临时聊天</button>
  </div>
  <label className="field-label">从另一台设备获得的 Offer 或 Answer（完整 JSON）
   <textarea data-testid="p2p-remote-description" className="field text-editor"
    value={remoteText} rows={4} maxLength={120000} onChange={e=>setRemoteText(e.target.value)}
    placeholder="通过可信渠道粘贴对方生成的连接描述"/>
  </label>
  {outgoing&&<div>
   <label className="field-label">本机生成的连接描述
    <textarea data-testid="p2p-local-description" className="field text-editor"
     readOnly rows={4} value={outgoing}/>
   </label>
   <button type="button" className="secondary-button" onClick={()=>void copyOutgoing()}>复制本机连接描述</button>
   <p className="subtle">本机 DTLS 指纹：{localFingerprint}</p>
   {remoteFingerprint&&<p className="subtle">对方 SDP 声明的指纹：{remoteFingerprint}（须经可信渠道核对，不能仅凭此字段建立身份信任）</p>}
  </div>}
  <p className="subtle" role="status" data-testid="p2p-status">{status}</p>
  {connected&&<p className="subtle" role="status" data-testid="p2p-ice-route">
   实际选中的 ICE 连接路径：{icePath?.kind==="relay"?"经过 TURN 中继":
    icePath?.kind==="direct"?"点对点直连":"尚未能够确认候选路径"}
   {icePath?.kind!=="unknown"&&icePath?(" · 本地 "+icePath.localType+" / 远端 "+icePath.remoteType):""}
   。这里只显示候选类型，不显示双方 IP 或端口。
  </p>}
  {connected&&<div>
   <div data-testid="p2p-history" role="log" aria-label="Direct peer messages"
    style={{maxHeight:240,overflowY:"auto",border:"1px solid var(--line,#cbd5e1)",borderRadius:10,padding:12}}>
    {lines.map(line=><p key={line.id} style={{overflowWrap:"anywhere",whiteSpace:"pre-wrap"}}>
     <strong>{line.name}{line.self?"（本机）":""}：</strong>{line.text}
     {line.self&&<span className="subtle" data-testid="p2p-message-receipt"> · {line.received?"对方应用已确认收到":"等待对方确认"}</span>}
    </p>)}
   </div>
   <label className="field-label">发送加密连接上的文本
    <textarea className="field text-editor" data-testid="p2p-draft" maxLength={1000} rows={2}
     value={draft} onChange={e=>setDraft(e.target.value)}/>
   </label>
   <button type="button" className="primary-button" data-testid="p2p-send"
    disabled={!validDirectChatText(draft)} onClick={send}>发送</button>
   {lines.some(line=>line.self&&!line.received)&&<button type="button" className="secondary-button"
    data-testid="p2p-retry-pending" onClick={retryPending}>重试未确认消息</button>}
  </div>}
 </section>;
}
