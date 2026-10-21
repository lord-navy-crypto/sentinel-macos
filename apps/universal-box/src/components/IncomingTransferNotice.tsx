import {useEffect,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";

type PairRequest={id:string;label:string;address:string;code:string;remainingSeconds:number};
type Received={id:string;label:string};
type PairStatus={active:boolean;secondsRemaining:number};

/** The receiver's explicit opt-in stays active when changing tool workspaces.
 * Show approval prompts wherever the user happens to be working.
 */
export default function IncomingTransferNotice({activeView,onOpenCommons}:{
 activeView:string;onOpenCommons:()=>void;
}){
 const [requests,setRequests]=useState<PairRequest[]>([]);
 const [received,setReceived]=useState<Received[]>([]);
 const [handling,setHandling]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  if(!isTauri())return;
  let live=true;
  async function refresh(){
   try{
    const [status,inbox]=await Promise.all([
     invoke<PairStatus>("commons_pair_status"),
     invoke<Received[]>("commons_pair_inbox"),
    ]);
    if(!live)return;
    setReceived(inbox);
    if(!status.active){setRequests([]);return;}
    const incoming=await invoke<PairRequest[]>("commons_pair_pending");
    if(live)setRequests(incoming);
   }catch{/* No pop-up if native sharing is unavailable. */}
  }
  void refresh();
  const timer=window.setInterval(()=>void refresh(),1800);
  return()=>{live=false;window.clearInterval(timer);};
 },[]);
 async function answer(id:string,approve:boolean){
  setHandling(id);setNotice("");
  try{
   await invoke("commons_pair_respond",{id,approve});
   setRequests(current=>current.filter(x=>x.id!==id));
   setNotice(approve?"已同意。文件完成加密接收后请进入 Commons 确认导入。":"已拒绝此次请求。");
  }catch(e){setNotice("处理失败："+String(e));}
  finally{setHandling(null);}
 }
 if(activeView==="commons"||(!requests.length&&!received.length))return null;
 return <aside className="ub-transfer-notice" aria-label="Universal Box nearby transfer requests" role="region">
  <div className="ub-transfer-notice-title">
   <strong>附近文件传输 · 需要你的确认</strong>
   <button type="button" className="secondary-button" onClick={onOpenCommons}>打开 Commons</button>
  </div>
  {requests.map(request=><div className="ub-transfer-request" key={request.id}>
   <strong>来自 {request.label} 的传输请求</strong>
   <p className="subtle">局域网地址 {request.address} · 还剩约 {request.remainingSeconds} 秒。设备名称可能被冒充。</p>
   <div className="ub-transfer-code" aria-label={"配对码 "+request.code}>{request.code}</div>
   <p className="subtle">请先核对发送者 Mac 上的数字与这里完全相同。未核对一致时请拒绝。</p>
   <div className="actions">
    <button type="button" className="primary-button" disabled={handling!==null}
     onClick={()=>void answer(request.id,true)}>验证码一致，同意</button>
    <button type="button" className="secondary-button" disabled={handling!==null}
     onClick={()=>void answer(request.id,false)}>拒绝</button>
   </div>
  </div>)}
  {received.length>0&&<div className="ub-transfer-received">
   <strong>已收到 {received.length} 份加密文件包，等待你检查并导入</strong>
   <p className="subtle">不会自动覆盖本机文件。请到 Commons 查看文件名并确认保存。</p>
   <button type="button" className="primary-button" onClick={onOpenCommons}>查看收到的文件 →</button>
  </div>}
  {notice&&<p className="subtle" role="status">{notice}</p>}
 </aside>;
}
