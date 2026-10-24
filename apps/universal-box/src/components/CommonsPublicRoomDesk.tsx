import {useEffect,useRef,useState} from "react";
import {buildCommonsIceServers,finishIceGathering,summarizeCommonsIceRoute,validDirectChatText} from "../lib/commonsInternetRtc";
import {PUBLIC_ROOM_GUEST_LIMIT,decodePublicRoomFrame,decodePublicRoomSignal,
 encodePublicRoomFrame,encodePublicRoomSignal,rememberRoomMessage,roomSendReady,
 validPublicRoomName,type PublicRoomFrame} from "../lib/commonsPublicRoom";

type MemberSlot={id:string;pc:RTCPeerConnection;dc:RTCDataChannel;offer:string;answer:string;guest:string;phase:string};
type DisplaySlot={id:string;offer:string;answer:string;guest:string;phase:string};
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
 const seenRef=useRef(new Set<string>());
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
 const [joined,setJoined]=useState(false);
 const [draft,setDraft]=useState("");
 const [lines,setLines]=useState<ChatLine[]>([]);
 const [route,setRoute]=useState("");
 const options=()=>buildCommonsIceServers({publicStun:stun,ownTurn:useTurn,
  turnUrl,turnUsername:turnUser,turnCredential:turnPassword});
 const refresh=()=>setSlotViews(slotsRef.current.map(s=>({id:s.id,offer:s.offer,answer:s.answer,guest:s.guest,phase:s.phase})));
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
  setRoom("");setJoined(false);setGuestAnswer("");setInvitation("");setSlotViews([]);
  setLines([]);setDraft("");setRoute("");setTurnPassword("");
  setStatus("房间已结束，连接、消息与临时 TURN 密码已清空。");
 };
 useEffect(()=>()=>{destroy();},[]);
 const sendFrame=(dc:RTCDataChannel,frame:PublicRoomFrame):boolean=>{
  if(!roomSendReady(dc))return false;
  try{dc.send(encodePublicRoomFrame(frame));return true;}catch{return false;}
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
   if(slot.guest)return;
   const duplicate=frame.name===hostName||slotsRef.current.some(s=>s!==slot&&s.guest===frame.name);
   if(duplicate){
    sendFrame(slot.dc,{v:1,room:roomId,kind:"deny",reason:"name"});
    slot.phase="昵称已占用，连接被拒绝";refresh();slot.dc.close();return;
   }
   slot.guest=frame.name;slot.phase="已加入群聊";refresh();
   sendFrame(slot.dc,{v:1,room:roomId,kind:"welcome"});
   setStatus(frame.name+" 已加入房间。主持人可以向所有在线成员转发文字。");
  }else if(frame.kind==="chat"&&slot.guest&&frame.name===slot.guest){
   if(!rememberRoomMessage(seenRef.current,slot.id,frame.id))return;
   append(frame.name,frame.text,false);
   for(const peer of slotsRef.current){
    if(peer!==slot&&peer.guest)sendFrame(peer.dc,frame);
   }
  }else if(frame.kind==="leave"&&slot.guest){
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
   const slot:MemberSlot={id:crypto.randomUUID(),pc,dc,offer:"",answer:"",guest:"",phase:"搜集 ICE 候选地址"};
   slotsRef.current.push(slot);refresh();
   const roomId=roomRef.current,hostName=nickname.trim();
   dc.onmessage=e=>handleHostMessage(slot,e.data,roomId,hostName);
   dc.onopen=()=>{slot.phase="DataChannel 已连接，等待成员加入";refresh();};
   dc.onclose=()=>{if(slotsRef.current.includes(slot)){slot.guest="";slot.phase="已断开";refresh();}};
   pc.onconnectionstatechange=()=>{
    if(pc?.connectionState==="failed"){slot.guest="";slot.phase="ICE 连接失败";refresh();}
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
 const applyAnswer=async(id:string)=>{
  const slot=slotsRef.current.find(s=>s.id===id);
  if(!slot||busy||!roomRef.current)return;
  setBusy(true);
  try{
   const desc=decodePublicRoomSignal(slot.answer,"answer");
   if(desc.room!==roomRef.current)throw Error("Answer belongs to a different room.");
   await slot.pc.setRemoteDescription({type:"answer",sdp:desc.sdp});
   slot.phase="已应用 Answer，等待 ICE 连接";refresh();
  }catch(e){setStatus("无法应用 Answer："+errorText(e));}
  finally{setBusy(false);}
 };
 const joinRoom=async()=>{
  if(!supported||busy||!validPublicRoomName(nickname)||modeRef.current)return;
  setBusy(true);setJoined(false);setGuestAnswer("");
  let pc:RTCPeerConnection|null=null;
  try{
   const invite=decodePublicRoomSignal(invitation,"offer");
   pc=new RTCPeerConnection({iceServers:options()});
   guestRef.current=pc;modeRef.current="guest";
   roomRef.current=invite.room;setRoom(invite.room);
   const expectedRoom=invite.room,memberName=nickname.trim();
   pc.ondatachannel=e=>{
    const dc=e.channel;guestChannelRef.current=dc;
    dc.onopen=()=>{
     sendFrame(dc,{v:1,room:expectedRoom,kind:"join",name:memberName});
     setStatus("已建立加密 DataChannel，等待主持人接受加入请求…");
    };
    dc.onmessage=event=>{
     const frame=decodePublicRoomFrame(event.data,expectedRoom);
     if(!frame)return;
     if(frame.kind==="welcome"){setJoined(true);setStatus("主持人已接纳此昵称，群聊可用。成员身份仍未经过真实认证。");}
     if(frame.kind==="deny"){setJoined(false);setStatus("主持人拒绝加入："+frame.reason);dc.close();}
     if(frame.kind==="chat"&&rememberRoomMessage(seenRef.current,frame.name,frame.id))
      append(frame.name,frame.text,false);
    };
    dc.onclose=()=>{setJoined(false);setStatus("与主持人的 DataChannel 已断开。需要重新交换 Offer／Answer 才能加入。");};
   };
   pc.onconnectionstatechange=()=>{
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
   setStatus("Answer 已生成。复制并发给主持人，请其粘贴到你的邀请槽位并应用。");
  }catch(e){
   pc?.close();guestRef.current=null;guestChannelRef.current=null;roomRef.current="";modeRef.current=null;setRoom("");
   setStatus("无法加入房间："+errorText(e));
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
  const frame:PublicRoomFrame={v:1,room:id,kind:"chat",id:crypto.randomUUID(),name,text};
  if(modeRef.current==="guest"){
   if(!joined||!guestChannelRef.current||!sendFrame(guestChannelRef.current,frame)){
    setStatus("未发送：连接暂不可用或缓冲区已满。");return;
   }
   append(name,text,true);setDraft("");setStatus("已送入主持人数据通道；不等于全部成员收到。");
  }else if(modeRef.current==="host"){
   const members=slotsRef.current.filter(s=>!!s.guest);
   const sent=members.filter(s=>sendFrame(s.dc,frame)).length;
   if(!sent){setStatus("暂无可用成员连接，尚未发送。");return;}
   append(name,text,true);setDraft("");
   setStatus("已提交到 "+sent+"/"+members.length+" 条成员连接；不是全员送达确认。");
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
    {slot.offer&&<><label className="field-label">将此专属邀请 JSON 私下交给该成员
     <textarea className="field text-editor" readOnly rows={3} value={slot.offer}/></label>
     <button type="button" className="secondary-button" onClick={()=>void copy(slot.offer)}>复制成员邀请</button>
     </>}
    <label className="field-label">粘贴该成员生成的 Answer
     <textarea className="field text-editor" rows={3} value={slot.answer}
      disabled={!slot.offer||!!slot.guest} maxLength={122000} onChange={e=>updateSlotAnswer(slot.id,e.target.value)}/>
    </label>
    <button type="button" className="secondary-button" disabled={busy||!slot.answer||!!slot.guest}
     onClick={()=>void applyAnswer(slot.id)}>应用该成员 Answer</button>
    <button type="button" className="secondary-button" onClick={()=>removeSlot(slot.id)}>移除连接</button>
   </div>)}
  </div>}
  {mode==="guest"&&!room&&<div>
   <label className="field-label">粘贴主持人提供给你的专属邀请 JSON
    <textarea className="field text-editor" rows={4} maxLength={122000} data-testid="room-invite"
     value={invitation} onChange={e=>setInvitation(e.target.value)}/></label>
   <button type="button" className="primary-button" data-testid="room-join" disabled={!supported||busy||!invitation.trim()||!validPublicRoomName(nickname)}
    onClick={()=>void joinRoom()}>{busy?"生成中…":"生成本机 Answer 并加入"}</button>
  </div>}
  {mode==="guest"&&room&&guestAnswer&&<div>
   <label className="field-label">将 Answer JSON 私下发回主持人
    <textarea className="field text-editor" readOnly rows={4} value={guestAnswer} data-testid="room-answer"/></label>
   <button type="button" className="secondary-button" onClick={()=>void copy(guestAnswer)}>复制 Answer</button>
   {route&&<p className="subtle">ICE 连接路径：{route}。不显示对方 IP。</p>}
  </div>}
  {room&&<button type="button" className="secondary-button" data-testid="room-leave" onClick={stop}>退出并清除临时房间</button>}
  <p role="status" className="subtle" data-testid="room-status">{status}</p>
  {room&&((mode==="host"&&slotViews.some(s=>!!s.guest))||(mode==="guest"&&joined))&&<div>
   <div role="log" data-testid="room-history" style={{maxHeight:240,overflowY:"auto",padding:12,
    border:"1px solid var(--line,#cbd5e1)",borderRadius:10}}>
    {lines.map(line=><p key={line.id} style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
     <strong>{line.name}{line.self?"（我）":""}：</strong>{line.text}</p>)}
   </div>
   <label className="field-label">发送群聊文字
    <textarea className="field text-editor" data-testid="room-draft" rows={2}
     value={draft} maxLength={1000} onChange={e=>setDraft(e.target.value)}/></label>
   <button type="button" className="primary-button" data-testid="room-send"
    disabled={!validDirectChatText(draft)} onClick={send}>发送到当前房间</button>
  </div>}
  <p className="subtle">每一位新成员都需单独交换 Offer/Answer；同一个邀请不得复用。TURN 服务可能看到 IP 和流量元数据，且可能收费。房间记录只保存在当前页面内存中，关闭即消失。</p>
 </section>;
}
