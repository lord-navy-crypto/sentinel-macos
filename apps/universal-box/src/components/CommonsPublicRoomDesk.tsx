import {useEffect,useRef,useState} from "react";
import {buildCommonsIceServers,finishIceGathering,summarizeCommonsIceRoute,validDirectChatText,readDirectFingerprint} from "../lib/commonsInternetRtc";
import {PUBLIC_ROOM_GUEST_LIMIT,decodePublicRoomFrame,decodePublicRoomSignal,
 encodePublicRoomFrame,encodePublicRoomSignal,rememberRoomMessage,roomSendReady,
 validPublicRoomName,authorizeRoomResume,publicRoomTimedOut,
 PUBLIC_ROOM_HEARTBEAT_MS,type PublicRoomFrame} from "../lib/commonsPublicRoom";
import {newRoomDelivery,recordRoomAck,remainingRoomRecipients,roomDeliveryProgress,
 upsertRoomReceipt,type RoomChat,type RoomDelivery,type RoomDeliveryView} from "../lib/commonsRoomDelivery";

type MemberSlot={id:string;pc:RTCPeerConnection;dc:RTCDataChannel;offer:string;answer:string;guest:string;phase:string;fingerprint:string;resumeToken:string;authenticated:boolean;lastPongAt:number;pendingPing:string};
type DisplaySlot={id:string;offer:string;answer:string;guest:string;phase:string;fingerprint:string;authenticated:boolean};
type ChatLine={id:string;name:string;text:string;self:boolean};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);

/** Manual, temporary host-forwarded group of at most four devices.
 * Each guest has a separate encrypted DataChannel to the host; this is NOT group E2EE,
 * trusted identity, persistent messaging, or a default hosted service.
 */
export default function CommonsPublicRoomDesk(){
 const supported=typeof RTCPeerConnection!=="undefined";
 const slotsRef=useRef<MemberSlot[]>([]);
 const guestRef=useRef<RTCPeerConnection|null>(null);
 const guestChannelRef=useRef<RTCDataChannel|null>(null);
 const guestResumeTokenRef=useRef("");
 const hostHeartbeatAtRef=useRef(0);
 const lastGuestOfferRef=useRef("");
 const seenRef=useRef(new Set<string>());
 const deliveryRef=useRef(new Map<string,RoomDelivery>());
 const outboxRef=useRef(new Map<string,RoomChat>());
 const [deliveryViews,setDeliveryViews]=useState<RoomDeliveryView[]>([]);
 const roomRef=useRef("");
 const modeRef=useRef<"host"|"guest"|null>(null);
 const [mode,setMode]=useState<"host"|"guest">("host");
 const [nickname,setNickname]=useState("");
 const [room,setRoom]=useState("");
 const [stun,setStun]=useState(false),[useTurn,setUseTurn]=useState(false);
 const [turnUrl,setTurnUrl]=useState(""),[turnUser,setTurnUser]=useState(""),[turnPassword,setTurnPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("未连接。只在点击创建邀请或加入时发起 WebRTC 连接。");
 const [slotViews,setSlotViews]=useState<DisplaySlot[]>([]);
 const [invitation,setInvitation]=useState("");
 const [guestAnswer,setGuestAnswer]=useState("");
 const [hostFingerprint,setHostFingerprint]=useState("");
 const [joined,setJoined]=useState(false);
 const [reconnecting,setReconnecting]=useState(false);
 const [draft,setDraft]=useState("");
 const [lines,setLines]=useState<ChatLine[]>([]);
 const [route,setRoute]=useState("");
 const options=()=>buildCommonsIceServers({publicStun:stun,ownTurn:useTurn,
  turnUrl,turnUsername:turnUser,turnCredential:turnPassword});
 const refresh=()=>setSlotViews(slotsRef.current.map(s=>({id:s.id,offer:s.offer,answer:s.answer,guest:s.guest,phase:s.phase,fingerprint:s.fingerprint,authenticated:s.authenticated})));
 const append=(name:string,text:string,self:boolean)=>{
  setLines(old=>[...old,{id:crypto.randomUUID(),name,text,self}].slice(-200));
 };
 const destroy=()=>{
  for(const s of slotsRef.current){s.dc.close();s.pc.close();}
  slotsRef.current=[];
  guestChannelRef.current?.close();guestRef.current?.close();
  guestChannelRef.current=null;guestRef.current=null;
 };
 const stop=()=>{
  if(modeRef.current==="guest"&&guestChannelRef.current?.readyState==="open"&&roomRef.current)
   guestChannelRef.current.send(encodePublicRoomFrame({v:1,room:roomRef.current,kind:"leave"}));
  destroy();roomRef.current="";modeRef.current=null;seenRef.current.clear();
  guestResumeTokenRef.current="";hostHeartbeatAtRef.current=0;lastGuestOfferRef.current="";setReconnecting(false);
  deliveryRef.current.clear();outboxRef.current.clear();setDeliveryViews([]);
  setRoom("");setJoined(false);setGuestAnswer("");setHostFingerprint("");setInvitation("");setSlotViews([]);
  setLines([]);setDraft("");setRoute("");setTurnPassword("");
  setStatus("房间已结束，连接、消息与临时 TURN 密码已清空。");
 };
 useEffect(()=>()=>{destroy();},[]);
 const sendFrame=(dc:RTCDataChannel,frame:PublicRoomFrame):boolean=>{
  if(!roomSendReady(dc))return false;
  try{dc.send(encodePublicRoomFrame(frame));return true;}catch{return false;}
 };
 /** No network contact is made by this timer without an admitted, open data channel.
  * A stale channel is closed and manual fresh Offer/Answer remains necessary.
  */
 useEffect(()=>{
  if(!room)return;
  const timer=setInterval(()=>{
   if(roomRef.current!==room)return;
   const now=Date.now();
   if(modeRef.current==="host"){
    let modified=false;
    for(const slot of slotsRef.current){
     if(!slot.authenticated)continue;
     if(publicRoomTimedOut(slot.lastPongAt,now)){
      slot.authenticated=false;slot.phase="心跳超时：请重新协商连接";
      slot.pendingPing="";slot.dc.close();slot.pc.close();modified=true;
      continue;
     }
     const pingId=crypto.randomUUID();
     if(sendFrame(slot.dc,{v:1,room,kind:"ping",id:pingId}))slot.pendingPing=pingId;
    }
    if(modified){
     refresh();
     setStatus("部分成员长时间未回应应用心跳，已标记为断开。可对原成员重新协商连接。");
    }
   }else if(modeRef.current==="guest"&&guestResumeTokenRef.current&&
    publicRoomTimedOut(hostHeartbeatAtRef.current,now)){
    hostHeartbeatAtRef.current=0;
    setJoined(false);
    guestChannelRef.current?.close();guestRef.current?.close();
    setStatus("主持人连接心跳超时，已暂停消息发送。请索取新的专属 Offer 恢复会话。");
   }
  },PUBLIC_ROOM_HEARTBEAT_MS);
  return ()=>clearInterval(timer);
 // Network operations depend on refs and immutable room identity, not render-local chat state.
 },[room]);
 /** Freeze the target list at first send. Retries cannot silently include new members. */
 const keepRecord=(row:RoomDelivery)=>{
  deliveryRef.current.set(row.frame.id,row);
  while(deliveryRef.current.size>200){
   const oldest=deliveryRef.current.keys().next().value;
   if(oldest)deliveryRef.current.delete(oldest);else break;
  }
 };
 const showReceipt=(row:RoomDelivery)=>{
  const {acked,total}=roomDeliveryProgress(row);
  if(row.origin===null){
   setDeliveryViews(old=>upsertRoomReceipt(old,{
    id:row.frame.id,text:row.frame.text,acked,total,hostAccepted:true
   }));
  }else{
   const origin=slotsRef.current.find(s=>s.id===row.origin&&s.authenticated);
   if(origin)sendFrame(origin.dc,{v:1,room:row.frame.room,kind:"receipt",id:row.frame.id,acked,total});
  }
 };
 const forwardPending=(row:RoomDelivery)=>{
  for(const id of remainingRoomRecipients(row)){
   const slot=slotsRef.current.find(s=>s.id===id&&s.authenticated);
   if(slot)sendFrame(slot.dc,row.frame);
  }
 };
 const removeSlot=(id:string)=>{
  const slot=slotsRef.current.find(s=>s.id===id);
  if(!slot)return;
  slotsRef.current=slotsRef.current.filter(s=>s.id!==id);
  slot.dc.close();slot.pc.close();refresh();
 };
 const handleHostMessage=(slot:MemberSlot,raw:unknown,roomId:string,hostName:string)=>{
  if(!slotsRef.current.includes(slot))return;
  const frame=decodePublicRoomFrame(raw,roomId);
  if(!frame)return;
  if(frame.kind==="join"){
   if(slot.authenticated)return;
   const resuming=!!slot.guest;
   const trusted=resuming?
    authorizeRoomResume(slot.resumeToken,slot.guest,frame.resumeToken,frame.name):
    frame.resumeToken===undefined&&frame.name!==hostName&&
     !slotsRef.current.some(s=>s!==slot&&s.guest===frame.name);
   if(!trusted){
    sendFrame(slot.dc,{v:1,room:roomId,kind:"deny",reason:resuming?"invalid":"name"});
    slot.phase="成员会话校验失败";refresh();slot.dc.close();return;
   }
   // Rotate the volatile capability on every accepted handshake. Old tickets cannot rejoin.
   slot.resumeToken=crypto.randomUUID();
   slot.lastPongAt=Date.now();slot.pendingPing="";
   slot.guest=frame.name;slot.authenticated=true;slot.phase=resuming?"已安全重新加入":"已加入群聊";refresh();
   sendFrame(slot.dc,{v:1,room:roomId,kind:"welcome",resumeToken:slot.resumeToken});
   if(resuming){
    for(const row of deliveryRef.current.values()){
     if(row.targets.includes(slot.id))forwardPending(row);
     if(row.origin===slot.id)showReceipt(row);
    }
   }
   setStatus(frame.name+(resuming?" 已凭本次临时会话凭据恢复连接。":" 已加入房间。"));
  }else if(frame.kind==="pong"&&slot.authenticated){
   if(frame.id===slot.pendingPing){
    slot.lastPongAt=Date.now();slot.pendingPing="";
    if(slot.phase!=="已连接 · 心跳正常"){slot.phase="已连接 · 心跳正常";refresh();}
   }
  }else if(frame.kind==="ack"&&slot.authenticated){
   const row=deliveryRef.current.get(frame.id);
   if(!row)return;
   const changed=recordRoomAck(row,slot.id);
   if(changed!==row){keepRecord(changed);showReceipt(changed);}
  }else if(frame.kind==="chat"&&slot.authenticated&&frame.name===slot.guest){
   const existing=deliveryRef.current.get(frame.id);
   if(existing){
    // Same member, ID and payload: idempotent retry to previously unconfirmed recipients.
    if(existing.origin===slot.id&&existing.frame.name===frame.name&&existing.frame.text===frame.text){
     forwardPending(existing);showReceipt(existing);
    }
    return;
   }
   if(!rememberRoomMessage(seenRef.current,slot.id,frame.id))return;
   const targets=slotsRef.current.filter(peer=>peer!==slot&&peer.authenticated).map(peer=>peer.id);
   const row=newRoomDelivery(frame,slot.id,targets);
   keepRecord(row);
   append(frame.name,frame.text,false);
   forwardPending(row);
   showReceipt(row);
  }else if(frame.kind==="leave"&&slot.authenticated){
   const who=slot.guest;removeSlot(slot.id);setStatus(who+" 已主动退出房间。");
  }
 };
 const startRoom=()=>{
  if(!supported||!validPublicRoomName(nickname))return;
  const id=crypto.randomUUID();
  roomRef.current=id;modeRef.current="host";setRoom(id);setStatus("临时房间已创建。点击「为一位成员生成邀请」，逐一建立独立 WebRTC 连接。");
 };
 const addMember=async()=>{
  if(!supported||busy||modeRef.current!=="host"||slotsRef.current.length>=PUBLIC_ROOM_GUEST_LIMIT)return;
  setBusy(true);
  let pc:RTCPeerConnection|null=null;
  try{
   pc=new RTCPeerConnection({iceServers:options()});
   const dc=pc.createDataChannel("commons-room",{ordered:true});
   const slot:MemberSlot={id:crypto.randomUUID(),pc,dc,offer:"",answer:"",guest:"",phase:"搜集 ICE 候选地址",fingerprint:"",resumeToken:"",authenticated:false,lastPongAt:0,pendingPing:""};
   slotsRef.current.push(slot);refresh();
   const roomId=roomRef.current,hostName=nickname.trim();
   dc.onmessage=e=>{if(slot.pc===pc)handleHostMessage(slot,e.data,roomId,hostName);};
   dc.onopen=()=>{if(slot.pc===pc){slot.phase="DataChannel 已连接，等待成员加入";refresh();}};
   dc.onclose=()=>{if(slotsRef.current.includes(slot)&&slot.pc===pc){slot.authenticated=false;slot.phase="已断开，可重新协商";refresh();}};
   pc.onconnectionstatechange=()=>{
    if(slot.pc!==pc)return;
    if(pc?.connectionState==="failed"){slot.authenticated=false;slot.phase="ICE 连接失败，可重新协商";refresh();}
    if(pc?.connectionState==="connected"){
     void pc.getStats().then(report=>{
      const kind=summarizeCommonsIceRoute(report).kind;
      slot.phase=kind==="relay"?"已连通（TURN 路径）":"已连通（"+kind+" 路径）";refresh();
     }).catch(()=>{});
    }
   };
   await pc.setLocalDescription(await pc.createOffer());
   await finishIceGathering(pc);
   if(!pc.localDescription)throw Error("No offer was generated.");
   slot.offer=encodePublicRoomSignal(roomId,pc.localDescription);
   slot.phase="邀请已生成，等待对方 Answer";refresh();
   setStatus("将某位成员专属的邀请 JSON 私下发送给对方，再把其 Answer 粘贴回对应成员槽位。");
  }catch(e){
   if(pc){const slot=slotsRef.current.find(s=>s.pc===pc);if(slot)removeSlot(slot.id);else pc.close();}
   setStatus("创建成员邀请失败："+errorText(e));
  }finally{setBusy(false);}
 };
 /** Replace only the transport, NOT the logical member session or its ACK identity. */
 const reinviteMember=async(id:string)=>{
  const slot=slotsRef.current.find(s=>s.id===id&&!!s.guest);
  if(!slot||busy||modeRef.current!=="host")return;
  setBusy(true);
  let peer:RTCPeerConnection|null=null;
  try{
   peer=new RTCPeerConnection({iceServers:options()});
   const dc=peer.createDataChannel("commons-room",{ordered:true});
   const previousPeer=slot.pc,previousChannel=slot.dc;
   slot.pc=peer;slot.dc=dc;slot.authenticated=false;slot.lastPongAt=0;slot.pendingPing="";
   slot.offer="";slot.answer="";slot.fingerprint="";
   slot.phase="重新搜集 ICE 候选地址";refresh();
   const roomId=roomRef.current,hostName=nickname.trim();
   dc.onmessage=e=>{if(slot.pc===peer)handleHostMessage(slot,e.data,roomId,hostName);};
   dc.onopen=()=>{if(slot.pc===peer){slot.phase="新通道已连接，等待原成员验证";refresh();}};
   dc.onclose=()=>{if(slot.pc===peer){slot.authenticated=false;slot.phase="连接已断开，可再次重新协商";refresh();}};
   peer.onconnectionstatechange=()=>{
    if(slot.pc!==peer)return;
    if(peer?.connectionState==="failed"){slot.authenticated=false;slot.phase="新连接失败，可重新协商";refresh();}
    if(peer?.connectionState==="connected"){
     void peer.getStats().then(report=>{
      if(slot.pc!==peer)return;
      const kind=summarizeCommonsIceRoute(report).kind;
      slot.phase="正在验证重连成员（"+kind+" 路径）";refresh();
     }).catch(()=>{});
    }
   };
   previousChannel.close();previousPeer.close();
   await peer.setLocalDescription(await peer.createOffer());
   await finishIceGathering(peer);
   if(slot.pc!==peer||!peer.localDescription)throw Error("New invitation was interrupted.");
   slot.offer=encodePublicRoomSignal(roomId,peer.localDescription);
   slot.phase="新的专属 Offer 已生成，等待原成员 Answer";refresh();
   setStatus("将该成员新的 Offer 私下发给原成员；只有持有此前加密通道签发的临时凭据才能恢复原会话。");
  }catch(e){
   if(peer)peer.close();
   if(slot.pc===peer){slot.authenticated=false;slot.offer="";slot.phase="重新协商失败，可再试";refresh();}
   setStatus("重新邀请失败："+errorText(e));
  }finally{setBusy(false);}
 };
 const applyAnswer=async(id:string)=>{
  const slot=slotsRef.current.find(s=>s.id===id);
  if(!slot||busy||!roomRef.current)return;
  setBusy(true);
  try{
   const desc=decodePublicRoomSignal(slot.answer,"answer");
   if(desc.room!==roomRef.current)throw Error("Answer belongs to a different room.");
   await slot.pc.setRemoteDescription({type:"answer",sdp:desc.sdp});
   slot.fingerprint=readDirectFingerprint(desc.sdp);
   slot.phase="已应用 Answer，等待 ICE 连接";refresh();
  }catch(e){setStatus("无法应用 Answer："+errorText(e));}
  finally{setBusy(false);}
 };
 const joinRoom=async(resume=false)=>{
  if(!supported||busy||!validPublicRoomName(nickname)||
   (resume?(modeRef.current!=="guest"||joined||!guestResumeTokenRef.current):!!modeRef.current))return;
  setBusy(true);setJoined(false);setGuestAnswer("");
  let pc:RTCPeerConnection|null=null;
  try{
   const offerText=invitation.trim();
   const invite=decodePublicRoomSignal(offerText,"offer");
   if(resume&&(invite.room!==roomRef.current||offerText===lastGuestOfferRef.current))
    throw Error("Rejoin requires a fresh Offer for this same room.");
   pc=new RTCPeerConnection({iceServers:options()});
   setHostFingerprint(readDirectFingerprint(invite.sdp));
   const previous=guestRef.current,previousChannel=guestChannelRef.current;
   guestRef.current=pc;guestChannelRef.current=null;modeRef.current="guest";
   roomRef.current=invite.room;setRoom(invite.room);setReconnecting(resume);
   previousChannel?.close();previous?.close();
   const expectedRoom=invite.room,memberName=nickname.trim();
   pc.ondatachannel=e=>{
    if(guestRef.current!==pc)return;
    const dc=e.channel;guestChannelRef.current=dc;
    dc.onopen=()=>{
     if(guestChannelRef.current!==dc)return;
     sendFrame(dc,{v:1,room:expectedRoom,kind:"join",name:memberName,
      ...(resume?{resumeToken:guestResumeTokenRef.current}:{})});
     setStatus(resume?"已提交加密临时凭据，等待主持人恢复原会话…":"已建立加密 DataChannel，等待主持人接受加入请求…");
    };
    dc.onmessage=event=>{
     const frame=decodePublicRoomFrame(event.data,expectedRoom);
     if(!frame)return;
     if(frame.kind==="welcome"){
      if(frame.resumeToken)guestResumeTokenRef.current=frame.resumeToken;
      hostHeartbeatAtRef.current=Date.now();
      setJoined(true);setReconnecting(false);
      setStatus(resume?"原成员会话已恢复，历史和未确认消息状态仍保留。":"主持人已接纳此昵称，群聊可用。成员身份仍未经过真实认证。");
     }
     if(frame.kind==="deny"){setJoined(false);setStatus("主持人拒绝加入："+frame.reason);dc.close();}
     if(frame.kind==="chat"){
      if(rememberRoomMessage(seenRef.current,frame.name,frame.id))
       append(frame.name,frame.text,false);
      // Repeated delivery gets ACK again but is never duplicated in the timeline.
      sendFrame(dc,{v:1,room:expectedRoom,kind:"ack",id:frame.id});
     }
     if(frame.kind==="ping"&&guestResumeTokenRef.current){
      if(sendFrame(dc,{v:1,room:expectedRoom,kind:"pong",id:frame.id}))
       hostHeartbeatAtRef.current=Date.now();
     }
     if(frame.kind==="receipt"){
      const own=outboxRef.current.get(frame.id);
      if(own)setDeliveryViews(old=>upsertRoomReceipt(old,{
       id:frame.id,text:own.text,acked:frame.acked,total:frame.total,hostAccepted:true
      }));
     }
    };
    dc.onclose=()=>{
     if(guestChannelRef.current!==dc)return;
     setJoined(false);setReconnecting(false);
     setStatus(guestResumeTokenRef.current?
      "连接已断开：让主持人重新协商原成员连接，粘贴新的专属 Offer 可恢复。":
      "连接已断开：没有可恢复的临时会话凭据，请重新加入房间。");
    };
   };
   pc.onconnectionstatechange=()=>{
    if(guestRef.current!==pc)return;
    if(pc?.connectionState==="failed"){setJoined(false);setStatus("ICE 连接失败，可能需要 TURN 或其他网络。");}
    if(pc?.connectionState==="connected"){
     void pc.getStats().then(report=>{
      const kind=summarizeCommonsIceRoute(report).kind;
      setRoute(kind==="relay"?"TURN 中继":kind==="direct"?"点对点直连":"路径暂无法判断");
     }).catch(()=>setRoute("路径暂无法判断"));
    }
   };
   await pc.setRemoteDescription({type:"offer",sdp:invite.sdp});
   await pc.setLocalDescription(await pc.createAnswer());
   await finishIceGathering(pc);
   if(!pc.localDescription)throw Error("No answer was generated.");
   setGuestAnswer(encodePublicRoomSignal(invite.room,pc.localDescription));
   lastGuestOfferRef.current=offerText;
   setInvitation("");
   setStatus(resume?"恢复连接的 Answer 已生成，请发回主持人的同一成员槽位。":
    "Answer 已生成。复制并发给主持人，请其粘贴到你的邀请槽位并应用。");
  }catch(e){
   pc?.close();
   if(pc&&guestRef.current===pc){guestRef.current=null;guestChannelRef.current=null;}
   if(!resume){roomRef.current="";modeRef.current=null;setRoom("");}
   setReconnecting(false);
   setStatus((resume?"无法恢复成员会话：":"无法加入房间：")+errorText(e));
  }finally{setBusy(false);}
 };
 const updateSlotAnswer=(id:string,value:string)=>{
  const slot=slotsRef.current.find(s=>s.id===id);
  if(slot){slot.answer=value;refresh();}
 };
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setStatus("连接描述已复制。请仅通过可信渠道分享，其中可能含有网络地址和指纹。");}
  catch(e){setStatus("复制失败："+errorText(e));}
 };
 const send=()=>{
  const name=nickname.trim(),text=draft.trim(),id=roomRef.current;
  if(!id||!validPublicRoomName(name)||!text||!validDirectChatText(text))return;
  const frame:RoomChat={v:1,room:id,kind:"chat",id:crypto.randomUUID(),name,text};
  if(modeRef.current==="guest"){
   if(!joined||!guestChannelRef.current||!sendFrame(guestChannelRef.current,frame)){
    setStatus("未发送：连接暂不可用或缓冲区已满。");return;
   }
   outboxRef.current.set(frame.id,frame);
   while(outboxRef.current.size>50){
    const oldest=outboxRef.current.keys().next().value;
    if(oldest)outboxRef.current.delete(oldest);else break;
   }
   setDeliveryViews(old=>upsertRoomReceipt(old,{
    id:frame.id,text,acked:0,total:0,hostAccepted:false
   }));
   append(name,text,true);setDraft("");
   setStatus("消息已送入主持人通道，正在等待主持人接收确认。");
  }else if(modeRef.current==="host"){
   const members=slotsRef.current.filter(s=>s.authenticated);
   if(!members.length){setStatus("暂无在线成员，消息尚未发送。");return;}
   const row=newRoomDelivery(frame,null,members.map(s=>s.id));
   keepRecord(row);
   forwardPending(row);
   showReceipt(row);
   append(name,text,true);setDraft("");
   setStatus("已尝试向当前成员发送，等待各成员应用 ACK。");
  }
 };
 const retryDelivery=(id:string)=>{
  if(modeRef.current==="guest"){
   const frame=outboxRef.current.get(id);
   if(!frame||!guestChannelRef.current||!joined||!sendFrame(guestChannelRef.current,frame)){
    setStatus("重试未发出：连接不可用或缓冲区已满。");return;
   }
   setStatus("已按原消息 ID 重试，避免接收端重复显示。");
  }else if(modeRef.current==="host"){
   const row=deliveryRef.current.get(id);
   if(!row){setStatus("消息已超出当前内存重试窗口。");return;}
   forwardPending(row);showReceipt(row);
   setStatus("仅向尚未确认的原始接收成员重试；不增加新成员。");
  }
 };
 return <section className="panel" data-testid="commons-public-room">
  <h4>公网临时群聊实验 · 手动邀请（最多 4 人）</h4>
  <p className="subtle">主持人最多连接 3 位成员，每人使用独立的 WebRTC DTLS DataChannel，群消息经主持人转发。主持人能看到消息；这不是全员端到端加密。没有云端账号、自动信令、消息持久化、真实身份认证或自动重连，主持人离线会导致房间停止。</p>
  <div className="pill-row" role="group" aria-label="Public room role">
   <button type="button" className={mode==="host"?"pill active-pill":"pill"} aria-pressed={mode==="host"} disabled={!!room}
    onClick={()=>setMode("host")}>创建房间（主持人）</button>
   <button type="button" className={mode==="guest"?"pill active-pill":"pill"} aria-pressed={mode==="guest"} disabled={!!room}
    onClick={()=>setMode("guest")}>通过邀请加入</button>
  </div>
  <label className="field-label">本次昵称
   <input className="field" data-testid="room-name" value={nickname} maxLength={24}
    disabled={!!room||busy} onChange={e=>setNickname(e.target.value)} placeholder="例如：同事A"/>
  </label>
  <label className="subtle" style={{display:"flex",gap:8,alignItems:"center"}}>
   <input type="checkbox" checked={stun} disabled={!!room||busy} data-testid="room-opt-in-stun"
    onChange={e=>setStun(e.target.checked)}/>本次连接允许公共 STUN 探测（默认关闭）
  </label>
  <label className="subtle" style={{display:"flex",gap:8,alignItems:"center"}}>
   <input type="checkbox" checked={useTurn} disabled={!!room||busy} data-testid="room-opt-in-turn"
    onChange={e=>setUseTurn(e.target.checked)}/>使用自己的 TURN 中继（可选，默认关闭）
  </label>
  {useTurn&&<div>
   <label className="field-label">TURN 地址<input className="field" value={turnUrl} maxLength={250} disabled={!!room||busy}
    onChange={e=>setTurnUrl(e.target.value)} placeholder="turns:relay.example.org:5349?transport=tcp"/></label>
   <label className="field-label">TURN 用户名<input className="field" value={turnUser} maxLength={256} disabled={!!room||busy}
    onChange={e=>setTurnUser(e.target.value)}/></label>
   <label className="field-label">TURN 临时密码<input className="field" type="password" value={turnPassword}
    maxLength={512} autoComplete="off" disabled={!!room||busy} onChange={e=>setTurnPassword(e.target.value)}/></label>
  </div>}
  {mode==="host"&&!room&&<button className="primary-button" type="button" data-testid="room-start"
   disabled={!supported||!validPublicRoomName(nickname)} onClick={startRoom}>创建本机临时房间</button>}
  {mode==="host"&&room&&<div>
   <p className="subtle">临时房间 ID：{room}（ID 不是密码，成员须经可信渠道核对身份）</p>
   <button type="button" className="secondary-button" data-testid="room-add"
    disabled={busy||slotViews.length>=PUBLIC_ROOM_GUEST_LIMIT} onClick={()=>void addMember()}>
    {busy?"生成中…":"为一位成员生成邀请"}
   </button>
   {slotViews.map((slot,index)=><div key={slot.id} className="panel" data-testid="room-slot">
    <p><strong>成员连接 {index+1}</strong> · {slot.guest||"尚未加入"} · {slot.phase}</p>
   {slot.fingerprint&&<p className="subtle">该成员 Answer 声明的 DTLS 指纹：{slot.fingerprint}。只能与可信渠道核对，不能凭此确认真实身份。</p>}
    {slot.offer&&<><label className="field-label">将此专属邀请 JSON 私下交给该成员
     <textarea className="field text-editor" readOnly rows={3} value={slot.offer}/></label>
     <button type="button" className="secondary-button" onClick={()=>void copy(slot.offer)}>复制成员邀请</button>
     </>}
    <label className="field-label">粘贴该成员生成的 Answer
     <textarea className="field text-editor" rows={3} value={slot.answer}
      disabled={!slot.offer||slot.authenticated} maxLength={122000} onChange={e=>updateSlotAnswer(slot.id,e.target.value)}/>
    </label>
    <button type="button" className="secondary-button" disabled={busy||!slot.answer||slot.authenticated}
     onClick={()=>void applyAnswer(slot.id)}>应用该成员 Answer</button>
    {slot.guest&&<button type="button" className="secondary-button" data-testid="room-reinvite"
     disabled={busy} onClick={()=>void reinviteMember(slot.id)}>重新协商此成员连接</button>}
    <button type="button" className="secondary-button" onClick={()=>removeSlot(slot.id)}>移除连接</button>
   </div>)}
  </div>}
  {mode==="guest"&&!room&&<div>
   <label className="field-label">粘贴主持人提供给你的专属邀请 JSON
    <textarea className="field text-editor" rows={4} maxLength={122000} data-testid="room-invite"
     value={invitation} onChange={e=>setInvitation(e.target.value)}/></label>
   <button type="button" className="primary-button" data-testid="room-join" disabled={!supported||busy||!invitation.trim()||!validPublicRoomName(nickname)}
    onClick={()=>void joinRoom(false)}>{busy?"生成中…":"生成本机 Answer 并加入"}</button>
  </div>}
  {mode==="guest"&&room&&!joined&&!!guestResumeTokenRef.current&&<div className="panel" data-testid="room-reconnect">
   <p className="subtle">已断开原通道。请让主持人在你的原成员槽位点击「重新协商此成员连接」，将新的专属 Offer 粘贴在此处。凭据保留在本机内存，不复制或展示。</p>
   <label className="field-label">原成员的新 Offer
    <textarea className="field text-editor" rows={4} maxLength={122000}
     data-testid="room-reconnect-offer" value={invitation}
     onChange={e=>setInvitation(e.target.value)}/></label>
   <button className="secondary-button" type="button" data-testid="room-reconnect-action"
    disabled={busy||!invitation.trim()} onClick={()=>void joinRoom(true)}>
    {busy||reconnecting?"正在准备…":"生成恢复连接 Answer"}
   </button>
  </div>}
  {mode==="guest"&&room&&guestAnswer&&<div>
   <p className="subtle">主持人 Offer 声明的 DTLS 指纹：{hostFingerprint}。请通过可信渠道另行核对，指纹本身不证明身份。</p>
   <label className="field-label">将 Answer JSON 私下发回主持人
    <textarea className="field text-editor" readOnly rows={4} value={guestAnswer} data-testid="room-answer"/></label>
   <button type="button" className="secondary-button" onClick={()=>void copy(guestAnswer)}>复制 Answer</button>
   {route&&<p className="subtle">ICE 连接路径：{route}。不显示对方 IP。</p>}
  </div>}
  {room&&<button type="button" className="secondary-button" data-testid="room-leave" onClick={stop}>退出并清除临时房间</button>}
  <p role="status" className="subtle" data-testid="room-status">{status}</p>
  {room&&((mode==="host"&&(slotViews.some(s=>s.guest)||lines.length>0))||(mode==="guest"&&(joined||lines.length>0)))&&<div>
   <div role="log" data-testid="room-history" style={{maxHeight:240,overflowY:"auto",padding:12,
    border:"1px solid var(--line,#cbd5e1)",borderRadius:10}}>
    {lines.map(line=><p key={line.id} style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
     <strong>{line.name}{line.self?"（我）":""}：</strong>{line.text}</p>)}
   </div>
   {deliveryViews.length>0&&<div className="panel" data-testid="room-delivery-status">
    <p className="subtle"><strong>本次发送的接收确认</strong>（应用 ACK，不代表已读或永久保存）</p>
    {deliveryViews.map(item=><div key={item.id} data-testid="room-receipt" className="task-row">
     <div className="task-copy">
      <strong>{item.text}</strong>
      <div className="subtle">{!item.hostAccepted?"等待主持人确认接收":
       item.total===0?"主持人已接收 · 当前没有其他接收成员":
       "成员应用确认 "+item.acked+"/"+item.total+(item.acked===item.total?" · 全部已确认":" · 仍有未确认")}
      </div>
     </div>
     {(!item.hostAccepted||item.acked<item.total)&&<button type="button" className="secondary-button"
      data-testid="room-retry" onClick={()=>retryDelivery(item.id)}>重试未确认</button>}
    </div>)}
   </div>}
   <label className="field-label">发送群聊文字
    <textarea className="field text-editor" data-testid="room-draft" rows={2}
     value={draft} maxLength={1000} onChange={e=>setDraft(e.target.value)}/></label>
   <button type="button" className="primary-button" data-testid="room-send"
    disabled={!validDirectChatText(draft)||(mode==="guest"&&!joined)} onClick={send}>发送到当前房间</button>
  </div>}
  <p className="subtle">在线成员通过加密 DataChannel 交换应用心跳；长期无回应时暂停该连接，恢复仍需手动交换新的 Offer/Answer。心跳不能证明人的真实身份。</p>
  <p className="subtle">每一位新成员都需单独交换 Offer/Answer；同一个邀请不得复用。TURN 服务可能看到 IP 和流量元数据，且可能收费。房间记录只保存在当前页面内存中，关闭即消失。</p>
 </section>;
}
