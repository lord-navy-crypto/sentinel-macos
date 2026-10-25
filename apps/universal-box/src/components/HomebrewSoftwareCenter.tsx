import {useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {listen,type UnlistenFn} from "@tauri-apps/api/event";
import {boundedTerminalLog,validFormulaName} from "../lib/betterTerminal";

type BrewKind="formula"|"cask";
type BrewOperation="install"|"uninstall"|"upgrade"|"update"|"upgrade_all";
type BrewEvent={job_id:number;stream:"stdout"|"stderr"|"finished";data:string;exit_code:number|null};
type PendingAction={operation:BrewOperation;kind?:BrewKind;name?:string;label:string;reason:string};
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
 const [packages,setPackages]=useState<string[]>([]);
 const [outdated,setOutdated]=useState<string[]>([]);
 const [updatesChecked,setUpdatesChecked]=useState(false);
 const [checkingUpdates,setCheckingUpdates]=useState(false);
 const [searching,setSearching]=useState(false);
 const [loadingPackages,setLoadingPackages]=useState(false);
 const [info,setInfo]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [pending,setPending]=useState<PendingAction|null>(null);
 const [running,setRunning]=useState(false);
 const [jobId,setJobId]=useState<number|null>(null);
 const [jobStatus,setJobStatus]=useState("");
 const [log,setLog]=useState("");
 const jobRef=useRef<number|null>(null);
 const cancelRequestedRef=useRef(false);
 const finishedRef=useRef(new Set<number>());
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
   setLog(text=>boundedTerminalLog(text,item.data));
   if(item.stream==="finished"){
    if(jobRef.current===item.job_id){jobRef.current=null;}
    else{finishedRef.current.add(item.job_id);}
    setJobId(null);setRunning(false);
    setJobStatus(cancelRequestedRef.current?"操作已取消":item.exit_code===0?"操作成功完成":"操作失败，请检查日志");
    cancelRequestedRef.current=false;
    if(item.exit_code===0){
      void Promise.all([
       invoke<string[]>("better_terminal_brew_list",{kind:kindRef.current}),
       invoke<string[]>("better_terminal_brew_outdated",{kind:kindRef.current})
      ]).then(([current,updates])=>{setPackages(current);setOutdated(updates);setUpdatesChecked(true);})
       .catch(e=>setError("刷新软件更新列表失败："+String(e)));
     }
   }
  }).then(unlisten=>{if(alive)unlistenRef.current=unlisten;else unlisten();})
   .catch(e=>{if(alive)setError("无法监听 Homebrew 进度："+String(e));});
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

 async function checkUpdates(){
   if(!native||!installed||checkingUpdates||running)return;
   setCheckingUpdates(true);setError("");setNotice("");
   try{
    const found=await invoke<string[]>("better_terminal_brew_outdated",{kind});
    setOutdated(found);setUpdatesChecked(true);
    setNotice(found.length===0?"检查完成：当前类别没有发现可升级的软件。":"检查完成：发现 "+found.length+" 个可升级的软件。");
   }catch(e){setError("检查软件更新失败："+String(e));}
   finally{setCheckingUpdates(false);}
  }
  async function search(){
  if(!native||!installed||!query.trim()||searching||running)return;
  setSearching(true);setError("");setNotice("");setInfo("");
  try{
   const [found,current]=await Promise.all([
    invoke<string[]>("better_terminal_brew_search",{kind,query:query.trim()}),
    invoke<string[]>("better_terminal_brew_list",{kind})
   ]);
   setResults(found);setPackages(current);setNotice("找到 "+found.length+" 个匹配项。");
  }catch(e){setError("搜索失败："+String(e));}
  finally{setSearching(false);}
 }
 async function showInfo(name:string){
  if(!native||!installed||!validFormulaName(name))return;
  setInfo("");setError("");
  try{setInfo(await invoke<string>("better_terminal_brew_info",{kind,name}));}
  catch(e){setError("读取软件详情失败："+String(e));}
 }
 function ask(operation:BrewOperation,name?:string){
  if(!native||!installed||running)return;
  const label=operation==="update"?"更新 Homebrew 软件索引":
   operation==="install"?"安装 "+name:operation==="uninstall"?"卸载 "+name:"升级 "+name;
  const reason=operation==="update"?"连接 Homebrew 官方源更新本地软件索引。可能需要几分钟。":
   operation==="install"?"从 Homebrew 下载并安装该软件，会联网并修改本机软件环境。":
   operation==="uninstall"?"卸载该软件，可能移除应用文件或软件链接。":
   "下载并更新该软件包，可能改变当前版本或配置。";
  setPending({operation,kind:operation==="update"?undefined:kind,name,label,reason});
 }
 async function confirm(){
  const action=pending;if(!action)return;
  setPending(null);setError("");setNotice("");setLog("");setRunning(true);cancelRequestedRef.current=false;setJobStatus("正在启动…");
  try{
   const id=await invoke<number>("better_terminal_brew_start_operation",{
    operation:action.operation,kind:action.kind??null,name:action.name??null
   });
   if(finishedRef.current.has(id)){finishedRef.current.delete(id);setJobId(null);jobRef.current=null;}
   else{jobRef.current=id;setJobId(id);setJobStatus("正在执行 · 任务 #"+id);}
  }catch(e){setRunning(false);jobRef.current=null;setJobId(null);setJobStatus("启动失败");setError(String(e));}
 }
 async function cancel(){
  if(jobId===null)return;
  try{cancelRequestedRef.current=true;await invoke("better_terminal_brew_cancel_operation",{jobId});setJobStatus("已请求取消…");}
  catch(e){cancelRequestedRef.current=false;setError("取消失败："+String(e));}
 }
 return <section className="brew-software-center" data-testid="brew-software-center">
  <div className="brew-center-toolbar">
   <div>
    <h3>软件中心 · 用按钮安装，不用记命令</h3>
    <p className="subtle">直接调用本机 Homebrew；不需要先启动终端。安装、升级、卸载和更新索引均需二次确认。</p>
   </div>
   <button type="button" className="secondary-button" disabled={!native||!installed||running||loadingPackages} onClick={()=>void refreshPackages()}>
    {loadingPackages?"读取中…":"刷新已安装"}
   </button>
  </div>
  {!native&&<p className="terminal-notice" role="note">网页预览不能操作本机软件。请在 Sentinel Box macOS 应用中使用。</p>}
  {native&&!installed&&<p className="terminal-notice" role="note">尚未检测到 Homebrew。先使用上方官方安装入口完成安装，再刷新状态。</p>}
  {installed&&<>
   <div className="brew-kind-switch" role="group" aria-label="软件类型">
    <button type="button" aria-pressed={kind==="cask"} onClick={()=>{setKind("cask");setResults([]);setInfo("");setError("");}}>Mac 应用（Cask）</button>
    <button type="button" aria-pressed={kind==="formula"} onClick={()=>{setKind("formula");setResults([]);setInfo("");setError("");}}>命令行工具（Formula）</button>
   </div>
   <form className="brew-center-search" onSubmit={e=>{e.preventDefault();void search();}}>
    <label htmlFor="brew-software-query">软件名称</label>
    <input id="brew-software-query" className="field" data-testid="brew-software-query"
     placeholder={kind==="cask"?"例如 Firefox、VLC、Visual Studio Code":"例如 wget、jq、python"}
     value={query} onChange={e=>setQuery(e.target.value)} maxLength={80} autoComplete="off"/>
    <button type="submit" className="primary-button" data-testid="brew-search"
     disabled={!native||!query.trim()||searching||running}>{searching?"搜索中…":"搜索软件"}</button>
    <button type="button" className="secondary-button" disabled={!native||running}
     onClick={()=>ask("update")}>更新软件索引</button>
   </form>
   <div className="brew-manager-summary">
    <span>当前已安装：<strong>{packages.length}</strong> 项</span>
    <span>{kind==="cask"?"Mac 应用":"命令行工具"}</span>
   </div>
   <div className="brew-featured-section" data-testid="brew-featured-apps">
    <div className="brew-results-heading"><strong>{kind==="cask"?"常用 Mac 应用":"常用命令行工具"}</strong><span>无需搜索 · 确认后执行</span></div>
    <div className="brew-featured-grid">
     {(kind==="cask"?FEATURED_CASKS:FEATURED_FORMULAE).map(item=>{
      const isInstalled=packages.includes(item.name);
      return <article className="brew-featured-card" key={item.name}>
       <div className="brew-featured-card-heading"><strong>{item.title}</strong><span>{item.category}</span></div>
       <p>{item.description}</p>
       {isInstalled?<div className="brew-featured-actions"><span className="brew-installed-badge">已安装</span>
        <button type="button" className="secondary-button" disabled={running} onClick={()=>ask("upgrade",item.name)}>升级</button></div>:
        <button type="button" className="primary-button" data-testid={"brew-featured-install-"+item.name} disabled={running} onClick={()=>ask("install",item.name)}>安装</button>}
      </article>;
     })}
    </div>
   </div>
   {results.length>0&&<div className="brew-software-results" data-testid="brew-search-results">
    <div className="brew-results-heading"><strong>搜索结果</strong><span>{results.length} 项</span></div>
    {results.map(name=>{
     const isInstalled=packages.includes(name);
     return <div className="brew-software-row" key={name}>
      <div className="brew-software-name"><strong>{name}</strong><small>{isInstalled?"已安装":"可安装"}</small></div>
      <button type="button" className="secondary-button" disabled={running} onClick={()=>void showInfo(name)}>详情</button>
      {isInstalled?<><button type="button" className="secondary-button" disabled={running} onClick={()=>ask("upgrade",name)}>升级</button>
       <button type="button" className="secondary-button" disabled={running} onClick={()=>ask("uninstall",name)}>卸载</button></>:
       <button type="button" className="primary-button" data-testid="brew-install-package" disabled={running} onClick={()=>ask("install",name)}>安装</button>}
     </div>;
    })}
   </div>}
   {info&&<div className="brew-info-panel"><div className="brew-results-heading"><strong>软件详情</strong><button type="button" className="secondary-button" onClick={()=>setInfo("")}>关闭</button></div><pre>{info}</pre></div>}
   {packages.length>0&&<details className="brew-installed-panel"><summary>浏览已安装软件（前 100 项）</summary>
    <div className="brew-installed-chips">{packages.slice(0,100).map(name=><button type="button" key={name} disabled={running} onClick={()=>{setQuery(name);void showInfo(name);}}>{name}</button>)}</div>
   </details>}
   {(running||jobStatus)&&<div className="brew-operation-panel" data-testid="brew-operation-panel">
    <div className="brew-results-heading"><strong>操作进度与日志</strong><span role="status">{jobStatus}</span></div>
    <pre>{log||"正在等待 Homebrew 输出…"}</pre>
    {running&&jobId!==null&&<button type="button" className="secondary-button" onClick={()=>void cancel()}>取消操作</button>}
   </div>}
  </>}
  {notice&&<p role="status" className="subtle">{notice}</p>}
  {error&&<p role="alert" className="terminal-error">{error}</p>}
  {pending&&<div className="terminal-confirm" role="dialog" aria-modal="true" aria-label="确认 Homebrew 操作" data-testid="brew-action-confirmation">
   <h3>确认操作：{pending.label}</h3><p>{pending.reason}</p>
   <p>本操作通过固定的 Homebrew 参数直接启动，不会把软件名称拼接为 Shell 脚本。请检查软件名称和影响后再继续。</p>
   <code>{pending.operation==="update"?"brew update":`brew ${pending.operation} --${pending.kind} ${pending.name}`}</code>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="brew-confirm-run" disabled={running} onClick={()=>void confirm()}>确认并执行</button>
    <button type="button" className="secondary-button" onClick={()=>setPending(null)}>取消</button>
   </div>
  </div>}
 </section>;
}
