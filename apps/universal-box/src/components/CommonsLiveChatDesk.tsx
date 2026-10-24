import {useCallback,useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {canJoinCommonsChat,mergeLanChatLines,chatHistoryGap,nextChatPage,lanChatNeedsNewSession,type LanChatLine,type LanChatSnapshot} from "../lib/commonsChatUi";

type HostInfo={active:boolean;room:string;invites:string[];secondsRemaining:number};
const messageError=(error:unknown)=>error instanceof Error?error.message:String(error);

/** An ephemeral chat attached to the existing Commons workspace; not the offline ZIP message log. */
export default function CommonsLiveChatDesk({visible}:{visible:boolean}){
 const native=isTauri();
 const [title,setTitle]=useState("项目讨论");
 const [nickname,setNickname]=useState("");
 const [joinText,setJoinText]=useState("");
 const [activeInvite,setActiveInvite]=useState("");
 const [shareInvite,setShareInvite]=useState("");
 const [room,setRoom]=useState("");
 const [hosting,setHosting]=useState(false);
 const [revealed,setRevealed]=useState(false);
 const [messages,setMessages]=useState<LanChatLine[]>([]);
 const [participants,setParticipants]=useState<string[]>([]);
 const [draft,setDraft]=useState("");
 const [missingHistory,setMissingHistory]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [networkState,setNetworkState]=useState("");
 const [connectionDown,setConnectionDown]=useState(false);
 const [needsFreshSession,setNeedsFreshSession]=useState(false);
 const [connectionEpoch,setConnectionEpoch]=useState(0);
 const cursor=useRef(0);
 const memberSession=useRef("");
 const session=useRef(0);
 const polling=useRef(false);
 const pendingSend=useRef<{text:string;id:string}|null>(null);
 const applySnapshot=useCallback((snapshot:LanChatSnapshot)=>{
  const gap=chatHistoryGap(cursor.current,snapshot);
  if(gap>0)setMissingHistory(old=>Math.max(old,gap));
  const next=nextChatPage(cursor.current,snapshot);
  setRoom(snapshot.room);
  setMessages(old=>mergeLanChatLines(old,snapshot.messages));
  setParticipants(snapshot.participants);
  cursor.current=next;
 },[]);
 const poll=useCallback(async(invite:string,as:string,revision:number)=>{
  if(polling.current)return;
  polling.current=true;
  try{
   // Drain the host's 12-message pages in one explicit bounded round, rather
   // than requiring 2.5 seconds per page after a disconnection or group join.
   // No unbounded retry loop: 200 retained entries fit within 20 pages.
   let pageCount=0,hasMore=false;
   do{
    const snapshot=await invoke<LanChatSnapshot>("commons_chat_exchange",{
     invite,nickname:as,text:null,messageId:null,since:cursor.current,
     join:false,leave:false,sessionToken:memberSession.current,
    });
    if(session.current!==revision)return;
    applySnapshot(snapshot);pageCount++;
    hasMore=snapshot.hasMore;
   }while(hasMore&&pageCount<20);
   if(session.current!==revision)return;
   setError("");setConnectionDown(false);setNeedsFreshSession(false);
   setNetworkState(hasMore?"已连接 · 消息较多，下一轮继续同步":"已连接 · 最新可用群消息已同步");
  }catch(e){
   if(session.current===revision){
    const detail=messageError(e);
    const expired=lanChatNeedsNewSession(detail);
    setConnectionDown(true);if(expired)setNeedsFreshSession(true);
    setNetworkState(expired?"局域网成员会话已过期 · 需要重新加入":"与局域网群聊暂时失去连接");
    setError(detail);
   }
  }finally{polling.current=false;}
 },[applySnapshot]);
 useEffect(()=>{
  if(!native||!visible||!activeInvite)return;
  const revision=session.current;
  void poll(activeInvite,nickname,revision);
  const id=window.setInterval(()=>void poll(activeInvite,nickname,revision),2500);
  return ()=>window.clearInterval(id);
 },[activeInvite,nickname,native,visible,poll,connectionEpoch]);
 useEffect(()=>()=>{
  session.current++;
  if(isTauri())void invoke("commons_chat_stop").catch(()=>{});
 },[]);
 async function createRoom(){
  if(!native||busy||!nickname.trim()||!title.trim())return;
  setBusy(true);setError("");
  try{
   const host=await invoke<HostInfo>("commons_chat_host",{roomName:title.trim()});
   const loopback=host.invites.find(v=>v.includes("127.0.0.1:"))??host.invites[0];
   if(!loopback)throw Error("No local invitation available.");
   // Host joins its own group through the same encrypted wire protocol as guests.
   const first=await invoke<LanChatSnapshot>("commons_chat_exchange",{
    invite:loopback,nickname:nickname.trim(),text:null,messageId:null,since:0,
    join:true,leave:false,sessionToken:null,
   });
   if(!first.sessionToken)throw Error("Host did not issue a group member session.");
   session.current++;cursor.current=0;memberSession.current=first.sessionToken;setMissingHistory(0);pendingSend.current=null;
   setConnectionDown(false);setNeedsFreshSession(false);
   setMessages([]);setParticipants([]);
   setHosting(true);setRoom(host.room);setShareInvite(host.invites.find(v=>!v.includes("127.0.0.1:"))??loopback);
   applySnapshot(first);setActiveInvite(loopback);setNetworkState("已创建临时局域网群聊");
  }catch(e){
   setError("创建群聊失败："+messageError(e));
   await invoke("commons_chat_stop").catch(()=>{});
  }finally{setBusy(false);}
 }
 async function joinRoom(){
  if(!native||busy||!nickname.trim()||!canJoinCommonsChat(joinText))return;
  setBusy(true);setError("");
  try{
   const invite=joinText.trim();
   const first=await invoke<LanChatSnapshot>("commons_chat_exchange",{
    invite,nickname:nickname.trim(),text:null,messageId:null,since:0,
    join:true,leave:false,sessionToken:null,
   });
   if(!first.sessionToken)throw Error("Group host did not issue a member session.");
   session.current++;cursor.current=0;memberSession.current=first.sessionToken;
   setConnectionDown(false);setNeedsFreshSession(false);setMissingHistory(0);pendingSend.current=null;
   setMessages([]);setParticipants([]);
   setHosting(false);setShareInvite("");applySnapshot(first);setActiveInvite(invite);
   setNetworkState("已加入局域网群聊");
  }catch(e){setError("加入失败："+messageError(e));}
  finally{setBusy(false);}
 }
 /** A new encrypted member session for the same room, with the old 200-line UI history retained.
  * Rejoin is explicit because another person might already own the previous nickname.
  */
 async function rejoinRoom(){
  if(!native||busy||!activeInvite)return;
  setBusy(true);setError("");
  try{
   const snapshot=await invoke<LanChatSnapshot>("commons_chat_exchange",{
    invite:activeInvite,nickname:nickname.trim(),text:null,messageId:null,since:cursor.current,
    join:true,leave:false,sessionToken:null,
   });
   if(!snapshot.sessionToken)throw Error("Host did not issue a fresh member session.");
   if(snapshot.room!==room)throw Error("The invitation now resolves to a different room; exit and join again.");
   session.current++;
   memberSession.current=snapshot.sessionToken;
   applySnapshot(snapshot);
   setConnectionDown(false);setNeedsFreshSession(false);
   setConnectionEpoch(old=>old+1);
   setNetworkState("已使用原邀请建立新加密会话；正在补收仍可获取的消息");
  }catch(e){
   setConnectionDown(true);
   setError("重新加入失败："+messageError(e)+"。如果昵称仍被占用，请在旧会话 20 秒过期后重试；不要清除聊天记录。");
  }finally{setBusy(false);}
 }
 async function leave(){
  if(busy)return;
  setBusy(true);session.current++;
  try{
   if(hosting)await invoke("commons_chat_stop");
   else if(activeInvite&&memberSession.current){
    try{
     await invoke("commons_chat_exchange",{invite:activeInvite,nickname:nickname.trim(),
      text:null,messageId:null,since:cursor.current,
      join:false,leave:true,sessionToken:memberSession.current});
    }catch{/* Offline member leaves locally; the host expires inactive sessions within 20 seconds. */}
   }
   memberSession.current="";
   setActiveInvite("");setShareInvite("");setHosting(false);setRoom("");
   setMessages([]);setParticipants([]);cursor.current=0;setDraft("");setError("");
   setMissingHistory(0);pendingSend.current=null;
   setConnectionDown(false);setNeedsFreshSession(false);
   setNetworkState(hosting?"已停止群聊，所有连接和临时记录失效。":"已退出群聊。");
  }catch(e){setError("退出失败："+messageError(e));}
  finally{setBusy(false);}
 }
 async function sendMessage(){
  const text=draft.trim();
  if(!native||!activeInvite||busy||!text||[...text].length>1000
    ||new TextEncoder().encode(text).length>4000)return;
  setBusy(true);setError("");
  try{
   // If the server stored a message but the TCP reply was lost, a retry must
   // reuse the same message ID so the server does not append a duplicate.
   const id=pendingSend.current?.text===text?pendingSend.current.id:crypto.randomUUID();
   pendingSend.current={text,id};
   const snapshot=await invoke<LanChatSnapshot>("commons_chat_exchange",{
    invite:activeInvite,nickname:nickname.trim(),text,
    messageId:id,since:cursor.current,
    join:false,leave:false,sessionToken:memberSession.current,
   });
   applySnapshot(snapshot);
   // An edit made while the encrypted TCP request was in flight must survive
   // the acknowledgement of the earlier draft.
   if(pendingSend.current?.id===id)pendingSend.current=null;
   setDraft(current=>current.trim()===text?"":current);
   setNetworkState("群聊主机已确认发送请求，其他成员将于下一轮同步");
  }catch(e){
   const detail=messageError(e);
   if(lanChatNeedsNewSession(detail)){
    setConnectionDown(true);setNeedsFreshSession(true);
   }
   setError("发送结果未确认："+detail+"。可重试同一草稿；如果会话过期，请重新加入。");
  }
  finally{setBusy(false);}
 }
 async function copyInvite(){
  try{await navigator.clipboard.writeText(shareInvite);setNetworkState("邀请已复制；请仅私下交给计划加入的成员。");}
  catch(e){setError("无法自动复制："+messageError(e));}
 }
 const canSend=activeInvite&&draft.trim()&&[...draft.trim()].length<=1000
  &&new TextEncoder().encode(draft.trim()).length<=4000;
 return <section className="panel" data-testid="commons-live-lan-chat"
   aria-label="Live LAN group chat" style={{display:visible?"block":"none",marginTop:16}}>
  <p className="eyebrow">LIVE GROUP CHAT · SAME LOCAL NETWORK · NO CLOUD</p>
  <h3>局域网实时群聊 · Live LAN Group</h3>
  <p className="subtle">创建临时聊天室、邀请同一局域网的设备加入并实时交流。最多 12 个近期在线昵称，主机最多保存最近 200 条消息，房间最多开放一小时。消息只在主机内存中，不是持久化聊天记录。</p>
  <p className="subtle">聊天使用共享邀请密钥加密传送到群聊主机。加入后每位成员取得独立临时会话凭证，不能直接以其他在线昵称发送；但昵称仍不代表已验证的真实身份，主机能看到消息，邀请泄露仍允许新成员加入。</p>
  {!native&&<p role="status" className="subtle">实时群聊仅支持原生 Mac 桌面应用；当前浏览器只展示操作界面，不会启动 TCP 监听或访问网络。</p>}
  {!activeInvite?<div className="panel">
   <div className="tools-pair">
    <label className="field-label">你在群里的昵称
     <input className="field" data-testid="chat-nickname" maxLength={24} value={nickname}
      onChange={e=>setNickname(e.target.value)} placeholder="例如 Alex"/>
    </label>
    <label className="field-label">群聊名称（创建时使用）
     <input className="field" data-testid="chat-room-name" maxLength={48} value={title}
      onChange={e=>setTitle(e.target.value)}/>
    </label>
   </div>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="chat-create" disabled={!native||busy||!nickname.trim()||!title.trim()}
     onClick={()=>void createRoom()}>创建局域网群聊</button>
   </div>
   <label className="field-label">加入他人的群聊 · 粘贴完整邀请
    <input className="field" type="password" data-testid="chat-join-invite" autoComplete="off"
     maxLength={180} value={joinText} onChange={e=>setJoinText(e.target.value)}
     placeholder="uboxchat://192.168.1.20:端口/私有密钥"/>
   </label>
   <button type="button" className="secondary-button" data-testid="chat-join"
    disabled={!native||busy||!nickname.trim()||!canJoinCommonsChat(joinText)}
    onClick={()=>void joinRoom()}>验证邀请并加入</button>
  </div>:<div className="panel">
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
    <h4 data-testid="chat-active-room">{room} · {hosting?"正在主持":"已加入"}</h4>
    <button type="button" className="secondary-button" data-testid="chat-leave" disabled={busy}
     onClick={()=>void leave()}>{hosting?"结束群聊":"退出群聊"}</button>
   </div>
   {hosting&&<div>
    <label className="field-label">私密邀请（由主持人私下发送）
     <input data-testid="chat-share-invite" className="field" type={revealed?"text":"password"}
      readOnly value={shareInvite} aria-label="LAN group private invitation"/>
    </label>
    <div className="actions">
     <label className="subtle"><input type="checkbox" data-testid="chat-reveal-invite"
       checked={revealed} onChange={e=>setRevealed(e.target.checked)}/> 显示私密邀请</label>
     <button type="button" className="secondary-button" onClick={()=>void copyInvite()}>复制群聊邀请</button>
    </div>
   </div>}
   {connectionDown&&<div className="panel" data-testid="chat-connection-recovery">
    <p role="status" className="subtle">
     {needsFreshSession?"成员会话已失效。原房间聊天历史保留在本机，需重新获取临时会话凭据。":
      "连接暂时不可用。可立即检查网络；如原成员会话已经过期，再手动重新加入。"}
    </p>
    <div className="actions">
     <button type="button" className="secondary-button" data-testid="chat-recheck"
      disabled={busy} onClick={()=>void poll(activeInvite,nickname.trim(),session.current)}>
      立即重试连接
     </button>
     <button type="button" className="secondary-button" data-testid="chat-rejoin"
      disabled={busy} onClick={()=>void rejoinRoom()}>
      重新加入原房间
     </button>
    </div>
   </div>}
   <p className="subtle" data-testid="chat-online-members">
    最近在线昵称（未经身份验证）：{participants.join("、")||"暂无"}
   </p>
   {missingHistory>0&&<p role="alert" data-testid="chat-history-gap" className="subtle">
    注意：部分早期消息已超出主机最近 200 条的临时保留范围，至少 {missingHistory} 条无法补收。当前显示的是仍可获取的消息；请联系群主确认缺失内容。
   </p>}
   <div data-testid="chat-history" role="log" aria-label="Group chat messages"
    style={{maxHeight:360,overflowY:"auto",padding:12,border:"1px solid var(--line,#cbd5e1)",borderRadius:10}}>
    {messages.length===0?<p className="subtle">尚无消息，可以发送第一条内容。</p>:
     messages.map(item=><div key={item.seq} className="task-row" data-testid="chat-message">
      <div><strong>{item.nickname}</strong> <span className="subtle">#{item.seq}</span>
       <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.text}</p></div>
     </div>)}
   </div>
   <label className="field-label">发送群聊消息
    <textarea className="field text-editor" data-testid="chat-draft" maxLength={1000} rows={3}
     value={draft} onChange={e=>{setDraft(e.target.value);pendingSend.current=null;}} placeholder="输入消息，所有持有群聊邀请的成员都可查看"/>
   </label>
   <button type="button" className="primary-button" data-testid="chat-send"
    disabled={!canSend||!native||busy||needsFreshSession} onClick={()=>void sendMessage()}>发送消息</button>
  </div>}
  {networkState&&<p role="status" data-testid="chat-network-state" className="subtle">{networkState}</p>}
  {error&&<p role="alert" data-testid="chat-error" className="subtle">{error}</p>}
 </section>;
}
