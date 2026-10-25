import {useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen,type UnlistenFn} from "@tauri-apps/api/event";
import {boundedTerminalLog,validFormulaName} from "../lib/betterTerminal";
import {homebrewTaskOutcome,prependHomebrewTaskHistory,formatHomebrewDuration,homebrewEventBelongsToActiveJob,type HomebrewTaskRecord} from "../lib/homebrewTaskManager";
import {HomebrewActionConfirmation,HomebrewOperationPanel,HomebrewSearchFeedback,HomebrewStatusOverview,HomebrewWorkflowProgress,type HomebrewActionRequest,type HomebrewJobPhase,type HomebrewSearchPhase,type HomebrewWorkflowStep} from "./HomebrewWorkflowPanels";

type BrewKind="formula"|"cask";
type BrewOperation="install"|"uninstall"|"upgrade"|"update"|"upgrade_all";
type BrewEvent={job_id:number;stream:"stdout"|"stderr"|"finished";data:string;exit_code:number|null};
type PendingAction=HomebrewActionRequest;
const FEATURED_CASKS=[
 {name:"firefox",title:"Firefox",category:"浏览器",description:"开源网页浏览器"},
 {name:"google-chrome",title:"Google Chrome",category:"浏览器",description:"常用网页浏览器"},
 {name:"visual-studio-code",title:"Visual Studio Code",category:"开发",description:"代码编辑器"},
 {name:"vlc",title:"VLC",category:"媒体",description:"多格式音视频播放器"},
 {name:"libreoffice",title:"LibreOffice",category:"办公",description:"文档、表格和演示文稿"},
 {name:"rectangle",title:"Rectangle",category:"效率",description:"窗口布局快捷管理"},
 {name:"iterm2",title:"iTerm2",category:"开发",description:"高级终端应用"},
 {name:"obs",title:"OBS Studio",category:"媒体",description:"录屏与直播工具"},
] as const;
const FEATURED_FORMULAE=[
 {name:"git",title:"Git",category:"开发",description:"版本控制工具"},
 {name:"node",title:"Node.js",category:"开发",description:"JavaScript 运行环境"},
 {name:"python",title:"Python",category:"开发",description:"Python 语言环境"},
 {name:"wget",title:"Wget",category:"网络",description:"命令行下载工具"},
 {name:"jq",title:"jq",category:"数据",description:"JSON 数据处理"},
 {name:"ffmpeg",title:"FFmpeg",category:"媒体",description:"音视频处理工具"},
 {name:"ripgrep",title:"ripgrep",category:"开发",description:"快速搜索文件内容"},
 {name:"imagemagick",title:"ImageMagick",category:"图像",description:"批量图像处理"},
] as const;

export default function HomebrewSoftwareCenter({native,installed}:{native:boolean;installed:boolean}){
 const [kind,setKind]=useState<BrewKind>("cask");
 const [query,setQuery]=useState("");
 const [results,setResults]=useState<string[]>([]);
 const [searchedQuery,setSearchedQuery]=useState("");
 const [searchPhase,setSearchPhase]=useState<HomebrewSearchPhase>("idle");
 const [workflowStep,setWorkflowStep]=useState<HomebrewWorkflowStep>("search");
 const [packages,setPackages]=useState<string[]>([]);
 const [outdated,setOutdated]=useState<string[]>([]);
 const [updatesChecked,setUpdatesChecked]=useState(false);
 const [outdatedKind,setOutdatedKind]=useState<BrewKind|null>(null);
 const [checkingUpdates,setCheckingUpdates]=useState(false);
 const [searching,setSearching]=useState(false);
 const [loadingPackages,setLoadingPackages]=useState(false);
 const [info,setInfo]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [pending,setPending]=useState<PendingAction|null>(null);
 const [running,setRunning]=useState(false);
 const [eventsReady,setEventsReady]=useState(false);
 const [cancelPending,setCancelPending]=useState(false);
 const [jobId,setJobId]=useState<number|null>(null);
 const [jobStatus,setJobStatus]=useState("");
 const [jobPhase,setJobPhase]=useState<HomebrewJobPhase>("idle");
 const [activeActionLabel,setActiveActionLabel]=useState("");
 const [log,setLog]=useState("");
 const [history,setHistory]=useState<HomebrewTaskRecord[]>([]);
 const jobRef=useRef<number|null>(null);
 const cancelRequestedRef=useRef(false);
 const finishedRef=useRef(new Set<number>());
 const finishedIdsRef=useRef(new Set<number>());
 const jobActionRef=useRef<PendingAction|null>(null);
 const jobStartedAtRef=useRef<number|null>(null);
 const unlistenRef=useRef<UnlistenFn|null>(null);
 const kindRef=useRef<BrewKind>("cask");

 async function refreshPackages(target: BrewKind=kind){
  if(!native||!installed)return;
  setLoadingPackages(true);
  try{setPackages(await invoke<string[]>("better_terminal_brew_list",{kind:target}));}
  catch(e){setError("读取已安装软件失败："+String(e));}
  finally{setLoadingPackages(false);}
 }
 useEffect(()=>{
  if(!native)return;
  let alive=true;
  void listen<BrewEvent>("better-terminal:brew-event",event=>{
   const item=event.payload;
   // Ignore late messages from a previous job or another window. Before invoke
   // resolves, jobActionRef tracks the pending operation even without its id.
   if(!homebrewEventBelongsToActiveJob(item.job_id,jobRef.current,jobActionRef.current!==null,finishedIdsRef.current))return;
   setLog(text=>boundedTerminalLog(text,item.data));
   if(item.stream!=="finished")return;
   finishedIdsRef.current.add(item.job_id);
   if(finishedIdsRef.current.size>50){
    const oldest=finishedIdsRef.current.values().next().value;
    if(oldest!==undefined)finishedIdsRef.current.delete(oldest);
   }
   if(jobRef.current===item.job_id){jobRef.current=null;}
   else{finishedRef.current.add(item.job_id);}
   const action=jobActionRef.current;
   const outcome=homebrewTaskOutcome(item.exit_code,cancelRequestedRef.current);
   const startedAt=jobStartedAtRef.current;
   setHistory(current=>prependHomebrewTaskHistory(current,{
    id:item.job_id,
    label:action?.label??("Homebrew 操作 #"+item.job_id),
    outcome,
    finishedAt:new Date().toLocaleTimeString(),
    durationMs:startedAt===null?null:Math.max(0,Date.now()-startedAt),
    exitCode:item.exit_code
   }));
   setJobId(null);setRunning(false);setCancelPending(false);
   setJobPhase(outcome==="cancelled"?"cancelled":outcome==="success"?"success":"failed");
   setWorkflowStep("result");
   setJobStatus(outcome==="cancelled"?"操作已取消":outcome==="success"?"操作成功完成":"操作失败，请检查日志");
   setActiveActionLabel(action?.label??"Homebrew 操作");
   cancelRequestedRef.current=false;
   jobActionRef.current=null;jobStartedAtRef.current=null;
   if(item.exit_code===0){
    const targetKind=action?.kind??kindRef.current;
    void Promise.all([
     invoke<string[]>("better_terminal_brew_list",{kind:targetKind}),
     invoke<string[]>("better_terminal_brew_outdated",{kind:targetKind})
    ]).then(([current,updates])=>{
     if(kindRef.current===targetKind){
      setPackages(current);setOutdated(updates);setUpdatesChecked(true);setOutdatedKind(targetKind);
     }
    }).catch(e=>setError("刷新软件更新列表失败："+String(e)));
   }
  }).then(unlisten=>{
   if(alive){unlistenRef.current=unlisten;setEventsReady(true);}
   else unlisten();
  }).catch(e=>{if(alive){setEventsReady(false);setError("无法监听 Homebrew 进度："+String(e));}});
  return ()=>{
   alive=false;unlistenRef.current?.();unlistenRef.current=null;
   if(jobRef.current!==null){
    void invoke("better_terminal_brew_cancel_operation",{jobId:jobRef.current}).catch(()=>{});
    jobRef.current=null;
   }
  };
 },[native]);
 useEffect(()=>{kindRef.current=kind;},[kind]);
 useEffect(()=>{if(native&&installed)void refreshPackages(kind);},[native,installed,kind]);

 function selectKind(nextKind:BrewKind){
  if(nextKind===kind||running||checkingUpdates||loadingPackages||searching)return;
  kindRef.current=nextKind;
  setKind(nextKind);setResults([]);setSearchedQuery("");setSearchPhase("idle");setWorkflowStep("search");setInfo("");setError("");setNotice("");
  setOutdated([]);setUpdatesChecked(false);setOutdatedKind(null);
 }

 async function checkUpdates(){
   if(!native||!installed||checkingUpdates||running||searching||loadingPackages)return;
   setCheckingUpdates(true);setWorkflowStep("search");setError("");setNotice("");
   setOutdated([]);setUpdatesChecked(false);setOutdatedKind(null);
   try{
    const found=await invoke<string[]>("better_terminal_brew_outdated",{kind});
    setOutdated(found);setUpdatesChecked(true);setOutdatedKind(kind);
    setNotice(found.length===0?"检查完成：当前类别没有发现可升级的软件。":"检查完成：发现 "+found.length+" 个可升级的软件。");
   }catch(e){setError("检查软件更新失败："+String(e));}
   finally{setCheckingUpdates(false);}
  }
  async function search(){
  if(!native||!installed||!query.trim()||searching||running||checkingUpdates)return;
  const targetQuery=query.trim();
  setSearching(true);setSearchPhase("searching");setWorkflowStep("search");setSearchedQuery(targetQuery);
  setResults([]);setError("");setNotice("");setInfo("");
  try{
   const [found,current]=await Promise.all([
    invoke<string[]>("better_terminal_brew_search",{kind,query:targetQuery}),
    invoke<string[]>("better_terminal_brew_list",{kind})
   ]);
   setResults(found);setPackages(current);
   setSearchPhase(found.length>0?"results":"empty");
  }catch(e){setSearchPhase("failed");setError("搜索失败："+String(e));}
  finally{setSearching(false);}
 }
 async function showInfo(name:string){
  if(!native||!installed||!validFormulaName(name))return;
  setInfo("");setError("");
  try{setInfo(await invoke<string>("better_terminal_brew_info",{kind,name}));}
  catch(e){setError("读取软件详情失败："+String(e));}
 }
 function ask(operation:BrewOperation,name?:string){
  if(!native||!installed||!eventsReady||running||checkingUpdates||searching||loadingPackages)return;
  const label=operation==="update"?"更新 Homebrew 软件索引":
   operation==="upgrade_all"?"批量升级全部过期的"+(kind==="cask"?"Mac 应用":"命令行工具"):
   operation==="install"?"安装 "+name:operation==="uninstall"?"卸载 "+name:"升级 "+name;
  const reason=operation==="update"?"连接 Homebrew 官方源更新本地软件索引。可能需要几分钟。":
   operation==="upgrade_all"?"将升级当前类别中所有过期软件（"+outdated.length+" 项）。这可能改变多个软件的版本、依赖和配置；请先保存工作，并在确认前检查更新列表。":
   operation==="install"?"从 Homebrew 下载并安装该软件，会联网并修改本机软件环境。":
   operation==="uninstall"?"卸载该软件，可能移除应用文件或软件链接。":
   "下载并更新该软件包，可能改变当前版本或配置。";
  setJobPhase("idle");setJobStatus("");setWorkflowStep("confirm");setActiveActionLabel(label);
  setPending({operation,kind:operation==="update"?undefined:kind,name,label,reason});
 }
 async function confirm(){
  const action=pending;if(!action||!eventsReady||running)return;
  jobActionRef.current=action;jobStartedAtRef.current=Date.now();
  setActiveActionLabel(action.label);setJobPhase("starting");setWorkflowStep("execute");
  setPending(null);setError("");setNotice("");setLog("");setRunning(true);setCancelPending(false);cancelRequestedRef.current=false;setJobStatus("正在启动…");
  try{
   const id=await invoke<number>("better_terminal_brew_start_operation",{
    operation:action.operation,kind:action.kind??null,name:action.name??null
   });
   if(finishedRef.current.has(id)){finishedRef.current.delete(id);setJobId(null);jobRef.current=null;}
   else{jobRef.current=id;setJobId(id);setJobPhase("running");setJobStatus("正在执行 · 任务 #"+id);}
  }catch(e){setRunning(false);jobRef.current=null;setJobId(null);jobActionRef.current=null;jobStartedAtRef.current=null;setJobPhase("failed");setWorkflowStep("result");setJobStatus("启动失败");setError(String(e));}
 }
 async function cancel(){
  if(jobId===null||cancelRequestedRef.current||cancelPending)return;
  const targetId=jobId;
  cancelRequestedRef.current=true;setCancelPending(true);setJobPhase("cancelling");setJobStatus("已请求取消，正在等待进程结束…");
  try{await invoke("better_terminal_brew_cancel_operation",{jobId:targetId});}
  catch(e){
   // A completed operation may beat the cancellation IPC response. Do not
   // overwrite its final status with a misleading cancellation error.
   if(jobRef.current===targetId){
    cancelRequestedRef.current=false;setCancelPending(false);setJobPhase("running");
    setJobStatus("取消请求失败");setError("取消失败："+String(e));
   }
  }
 }
 return <section className="brew-software-center" data-testid="brew-software-center">
  <div className="brew-center-toolbar">
   <div>
    <h3>软件中心 · 用按钮安装，不用记命令</h3>
    <p className="subtle">直接调用本机 Homebrew；不需要先启动终端。安装、升级、卸载和更新索引均需二次确认。</p>
   </div>
   {native&&installed&&<div className="brew-toolbar-actions">
     {updatesChecked&&outdatedKind===kind&&<span className="brew-update-count">{outdated.length===0?"已是最新":outdated.length+" 项待更新"}</span>}
     <button type="button" className="secondary-button" data-testid="brew-check-updates"
      disabled={!native||!installed||running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>void checkUpdates()}>
      {checkingUpdates?"检查中…":"检查更新"}
     </button>
     <button type="button" className="secondary-button" disabled={!native||!installed||running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>void refreshPackages()}>
      {loadingPackages?"读取中…":"刷新已安装"}
     </button>
    </div>}
  </div>
  {!native&&<p className="terminal-notice" role="note">网页预览不能操作本机软件。请在 Sentinel Box macOS 应用中使用。</p>}
  {native&&installed&&!eventsReady&&<p className="terminal-notice" role="status">正在连接 Homebrew 任务管理器，连接就绪后才能执行安装或更新。</p>}
  {native&&!installed&&<p className="terminal-notice" role="note">尚未检测到 Homebrew。先使用上方官方安装入口完成安装，再刷新状态。</p>}
  <HomebrewStatusOverview native={native} installed={installed} eventsReady={eventsReady} kind={kind}
   packagesCount={packages.length} loadingPackages={loadingPackages} checkingUpdates={checkingUpdates}
   updatesChecked={updatesChecked} outdatedKind={outdatedKind} outdatedCount={outdated.length} />
  {installed&&<>
   <HomebrewWorkflowProgress step={workflowStep} searchPhase={searchPhase} queryChanged={Boolean(query.trim())&&query.trim()!==searchedQuery} />
   <div className="brew-kind-switch" role="group" aria-label="软件类型">
    <button type="button" aria-pressed={kind==="cask"} disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>selectKind("cask")}>Mac 应用（Cask）</button>
    <button type="button" aria-pressed={kind==="formula"} disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>selectKind("formula")}>命令行工具（Formula）</button>
   </div>
   <form className="brew-center-search" onSubmit={e=>{e.preventDefault();void search();}}>
    <label htmlFor="brew-software-query">软件名称</label>
    <input id="brew-software-query" className="field" data-testid="brew-software-query"
     placeholder={kind==="cask"?"例如 Firefox、VLC、Visual Studio Code":"例如 wget、jq、python"}
     value={query} onChange={e=>{setQuery(e.target.value);if(!pending)setWorkflowStep("search");}} maxLength={80} autoComplete="off"/>
    <button type="submit" className="primary-button" data-testid="brew-search"
     disabled={!native||!query.trim()||searching||running||checkingUpdates||loadingPackages}>{searching?"搜索中…":"搜索软件"}</button>
    <button type="button" className="secondary-button" disabled={!native||running||!eventsReady||checkingUpdates||searching||loadingPackages}
     onClick={()=>ask("update")}>更新软件索引</button>
   </form>
    <HomebrewSearchFeedback phase={searchPhase} query={searchedQuery} kind={kind} resultCount={results.length} />
   <div className="brew-manager-summary">
     <span>当前已安装：<strong>{packages.length}</strong> 项</span>
     <span>{kind==="cask"?"Mac 应用":"命令行工具"}</span>
     {updatesChecked&&outdatedKind===kind&&<span>待更新：<strong>{outdated.length}</strong> 项</span>}
    </div>
    {updatesChecked&&outdatedKind===kind&&<div className="brew-outdated-panel" data-testid="brew-outdated-list">
     <div className="brew-results-heading"><strong>可升级的软件</strong><span>{outdated.length===0?"当前已是最新":"共 "+outdated.length+" 项"}</span></div>
     {outdated.length===0?<p className="subtle">此类别没有发现可升级的软件。你可以更新软件索引后再检查一次。</p>:
      <>
       <div className="brew-outdated-actions">
        <p className="subtle">先检查列表；批量升级会更新此类别内所有过期软件。</p>
        <button type="button" className="primary-button" data-testid="brew-upgrade-all"
         disabled={!native||running||!eventsReady||checkingUpdates||searching||loadingPackages||outdated.length===0}
         onClick={()=>ask("upgrade_all")}>升级全部 {outdated.length} 项</button>
       </div>
       {outdated.map(name=><div className="brew-software-row" key={name}>
        <div className="brew-software-name"><strong>{name}</strong><small className="brew-software-state is-outdated">有可用更新</small></div>
        <button type="button" className="secondary-button" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("upgrade",name)}>升级此项</button>
       </div>)}
      </>}
    </div>}
   <div className="brew-featured-section" data-testid="brew-featured-apps">
    <div className="brew-results-heading"><strong>{kind==="cask"?"常用 Mac 应用":"常用命令行工具"}</strong><span>无需搜索 · 确认后执行</span></div>
    <div className="brew-featured-grid">
     {(kind==="cask"?FEATURED_CASKS:FEATURED_FORMULAE).map(item=>{
      const isInstalled=packages.includes(item.name);
      return <article className="brew-featured-card" key={item.name}>
       <div className="brew-featured-card-heading"><strong>{item.title}</strong><span>{item.category}</span></div>
       <p>{item.description}</p>
       {isInstalled?<div className="brew-featured-actions"><span className="brew-installed-badge">已安装</span>
        <button type="button" className="secondary-button" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("upgrade",item.name)}>升级</button></div>:
        <button type="button" className="primary-button" data-testid={"brew-featured-install-"+item.name} disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("install",item.name)}>安装</button>}
      </article>;
     })}
    </div>
   </div>
   {searchPhase==="results"&&results.length>0&&<div className="brew-software-results" data-testid="brew-search-results">
    <div className="brew-results-heading"><strong>搜索结果</strong><span>“{searchedQuery}” · {results.length} 项</span></div>
    {results.map(name=>{
     const isInstalled=packages.includes(name);
     return <div className="brew-software-row" key={name}>
      <div className="brew-software-name"><strong>{name}</strong><small className={"brew-software-state "+(isInstalled?"is-installed":"is-available")}>{isInstalled?"已安装":"可安装"}</small></div>
      <div className="brew-software-row-actions">
       <button type="button" className="secondary-button" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>void showInfo(name)}>详情</button>
       {isInstalled?<><button type="button" className="secondary-button" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("upgrade",name)}>升级</button>
        <button type="button" className="secondary-button" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("uninstall",name)}>卸载</button></>:
       <button type="button" className="primary-button" data-testid="brew-install-package" disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>ask("install",name)}>安装</button>}
      </div>
     </div>;
    })}
   </div>}
   {info&&<div className="brew-info-panel"><div className="brew-results-heading"><strong>软件详情</strong><button type="button" className="secondary-button" onClick={()=>setInfo("")}>关闭</button></div><pre>{info}</pre></div>}
   {packages.length>0&&<details className="brew-installed-panel"><summary>浏览已安装软件（前 100 项）</summary>
    <div className="brew-installed-chips">{packages.slice(0,100).map(name=><button type="button" key={name} disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages} onClick={()=>{setQuery(name);void showInfo(name);}}>{name}</button>)}</div>
   </details>}
   {jobPhase!=="idle"&&<HomebrewOperationPanel phase={jobPhase} status={jobStatus} actionLabel={activeActionLabel}
    log={log} canCancel={running&&jobId!==null} cancelPending={cancelPending} onCancel={()=>void cancel()} />}
  </>}
  {history.length>0&&<details className="brew-task-history" data-testid="brew-task-history">
   <summary>最近任务（{history.length}）</summary>
   <p className="subtle">仅保留本次软件中心会话的任务摘要；日志不会写入历史，也不会保存到磁盘。</p>
   <div className="brew-task-history-list">
    {history.map(task=><article className="brew-task-history-row" key={task.id}>
     <span className={"brew-task-outcome "+task.outcome}>{task.outcome==="success"?"成功":task.outcome==="cancelled"?"已取消":"失败"}</span>
     <div className="brew-task-history-content">
      <strong>{task.label}</strong>
      <small>任务 #{task.id} · {task.finishedAt} · {formatHomebrewDuration(task.durationMs)} · 退出码 {task.exitCode===null?"未知":task.exitCode}</small>
     </div>
    </article>)}
   </div>
  </details>}
  {notice&&<p role="status" className="subtle">{notice}</p>}
  {error&&<p role="alert" className="terminal-error">{error}</p>}
  {pending&&<HomebrewActionConfirmation action={pending}
   disabled={running||!eventsReady||checkingUpdates||searching||loadingPackages}
   onConfirm={()=>void confirm()} onCancel={()=>{setPending(null);setWorkflowStep("search");}} />}
 </section>;
}
