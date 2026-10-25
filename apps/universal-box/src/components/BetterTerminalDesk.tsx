import {useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {listen,type UnlistenFn} from "@tauri-apps/api/event";
import {openUrl} from "@tauri-apps/plugin-opener";
import {
 TERMINAL_PRESETS,boundedTerminalLog,brewCommand,validFormulaName,
 type TerminalRecipe
} from "../lib/betterTerminal";

type TerminalInfo={session_id:number;shell:string;home:string};
type BrewStatus={installed:boolean;executable:string|null;architecture:string;install_guide:string};
type OutputChunk={session_id:number;data:string};
type PendingAction={command:string;label:string;reason:string};
const INSTALL_GUIDE="https://docs.brew.sh/Installation";
const INSTALL_RELEASE="https://github.com/Homebrew/brew/releases/latest";

/** Real PTY console on native macOS; browser preview cannot execute commands. */
export default function BetterTerminalDesk(){
 const native=isTauri();
 const [tab,setTab]=useState<"terminal"|"brew"|"guide">("terminal");
 const [session,setSession]=useState<TerminalInfo|null>(null);
 const sessionRef=useRef<TerminalInfo|null>(null);
 const listenerRef=useRef<UnlistenFn|null>(null);
 const [eventsReady,setEventsReady]=useState(false);
 const [running,setRunning]=useState(false);
 const [output,setOutput]=useState("Better Terminal · Sentinel\n命令不会自动运行。点击“启动本机终端”打开真正的 macOS 登录 Shell。\n");
 const [command,setCommand]=useState("");
 const [pkg,setPkg]=useState("");
 const [brew,setBrew]=useState<BrewStatus|null>(null);
 const [pending,setPending]=useState<PendingAction|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [cols,setCols]=useState(100);
 const [rows,setRows]=useState(28);
 const consoleRef=useRef<HTMLPreElement>(null);
 useEffect(()=>{
  let alive=true;
  if(native){
   void listen<OutputChunk>("better-terminal:output",event=>{
    const active=sessionRef.current;
    if(active&&active.session_id===event.payload.session_id){
     setOutput(text=>boundedTerminalLog(text,event.payload.data));
    }
   }).then(unlisten=>{
    if(alive){listenerRef.current=unlisten;setEventsReady(true);}
    else unlisten();
   }).catch(e=>{if(alive)setError("无法监听终端输出："+String(e));});
   void invoke<BrewStatus>("better_terminal_brew_status").then(v=>{if(alive)setBrew(v);})
    .catch(e=>{if(alive)setError("检测 Homebrew 失败："+String(e));});
  }
  return ()=>{
   alive=false;
   listenerRef.current?.();listenerRef.current=null;
   if(sessionRef.current){
    void invoke("better_terminal_stop",{sessionId:sessionRef.current.session_id}).catch(()=>{});
    sessionRef.current=null;
   }
  };
 },[native]);
 useEffect(()=>{if(consoleRef.current)consoleRef.current.scrollTop=consoleRef.current.scrollHeight;},[output]);
 async function startTerminal(){
  if(!native||!eventsReady||running||sessionRef.current)return;
  setRunning(true);setError("");setNotice("");
  try{
   const info=await invoke<TerminalInfo>("better_terminal_start",{cols,rows});
   sessionRef.current=info;setSession(info);
   setOutput(text=>boundedTerminalLog(text,"\n已连接 "+info.shell+" · 当前用户权限 · 不会自动提升权限\n"));
  }catch(e){setError(String(e));}
  finally{setRunning(false);}
 }
 async function stopTerminal(){
  const active=sessionRef.current;
  if(!active)return;
  sessionRef.current=null;setSession(null);setPending(null);
  try{await invoke("better_terminal_stop",{sessionId:active.session_id});setNotice("终端会话已结束。");}
  catch(e){setError(String(e));}
 }
 async function send(data:string){
  const active=sessionRef.current;if(!active){setError("请先启动终端会话。");return;}
  if(!data||data.length>4096){setError("单次输入需要在 1–4096 字节内。");return;}
  try{await invoke("better_terminal_write",{sessionId:active.session_id,data});setError("");}
  catch(e){setError("命令发送失败："+String(e));}
 }
 function submitInput(){
  const text=command;
  if(!text.trim())return;
  if(/\r|\n/.test(text)){setError("一条命令只能占一行；需要多行脚本时请使用外部 Terminal。");return;}
  setCommand("");
  void send(text+"\n");
 }
 function requestRecipe(recipe:TerminalRecipe){
  if(recipe.modifies){setPending({label:recipe.title,command:recipe.command,reason:recipe.description});return;}
  setTab("terminal");void send(recipe.command+"\n");
 }
 function requestPackage(mode:"search"|"info"|"install"){
  const cmd=brewCommand(brew?.executable??undefined,mode,pkg);
  if(!cmd){setError("请输入有效的软件包名称：允许字母、数字以及 @ . _ + -，不支持空格或命令片段。");return;}
  if(mode==="install"){setPending({command:cmd,label:"安装 "+pkg.trim(),reason:"将从 Homebrew 下载并安装第三方软件；可能联网、更改文件和触发系统权限提示。"});}
  else {setTab("terminal");void send(cmd+"\n");}
 }
 async function confirmAction(){
  if(!pending)return;
  const todo=pending;
  setPending(null);setTab("terminal");
  await send(todo.command+"\n");
 }
 async function openOfficial(link:string){
  try{await openUrl(link);}catch(e){setError("打开官方网页失败："+String(e));}
 }
 async function copyOutput(){
  try{await navigator.clipboard.writeText(output);setNotice("已复制当前输出（检查是否包含隐私信息后再分享）。");}
  catch(e){setError("复制失败："+String(e));}
 }
 return <section className="panel better-terminal" data-testid="better-terminal-desk" aria-label="Better Terminal">
  <div className="better-terminal-heading">
   <div>
    <p className="eyebrow">SENTINEL / BETTER TERMINAL</p>
    <h2>Better Terminal · 更好的终端</h2>
    <p className="subtle">真正的 macOS PTY 登录 Shell + 免记命令的 Homebrew / 系统快捷操作。所有命令只在你明确点击后执行。</p>
   </div>
   <span className={"terminal-status"+(session?" connected":"")}>{session?"● 本机终端已连接":"○ 未连接"}</span>
  </div>
  {!native&&<p className="terminal-notice" role="note">这是网页预览，不能访问电脑终端。安装 macOS 版本后才会启用 PTY 命令。</p>}
  <div className="better-terminal-tabs" role="group" aria-label="Better Terminal pages">
   <button type="button" data-testid="better-terminal-tab-terminal" aria-pressed={tab==="terminal"} onClick={()=>setTab("terminal")}>终端会话</button>
   <button type="button" data-testid="better-terminal-tab-brew" aria-pressed={tab==="brew"} onClick={()=>setTab("brew")}>Homebrew 图形管理</button>
   <button type="button" data-testid="better-terminal-tab-guide" aria-pressed={tab==="guide"} onClick={()=>setTab("guide")}>常用命令与使用说明</button>
  </div>
  <div className="terminal-toolbar" aria-label="Session controls">
   <button type="button" className="primary-button" data-testid="terminal-start" disabled={!native||!eventsReady||!!session||running}
    onClick={()=>void startTerminal()}>启动本机终端</button>
   <button type="button" className="secondary-button" data-testid="terminal-stop" disabled={!session}
    onClick={()=>void stopTerminal()}>结束会话</button>
   <button type="button" className="secondary-button" disabled={!session} onClick={()=>void send("\u0003")}>中断当前命令 Ctrl+C</button>
   <button type="button" className="secondary-button" onClick={()=>{setOutput("");setNotice("已清除屏幕显示，未删除任何文件。");}}>清屏</button>
   <button type="button" className="secondary-button" onClick={()=>void copyOutput()}>复制输出</button>
  </div>
  {error&&<p role="alert" className="terminal-error">{error}</p>}
  {notice&&<p role="status" className="subtle">{notice}</p>}
  {tab==="terminal"&&<>
   <div className="terminal-viewport" data-testid="terminal-output">
    <pre ref={consoleRef} tabIndex={0} aria-label="终端输出，按需复制">{output}</pre>
   </div>
   <form className="terminal-input-row" onSubmit={e=>{e.preventDefault();submitInput();}}>
    <label htmlFor="terminal-input">命令输入</label>
    <input id="terminal-input" className="field" data-testid="terminal-command-input"
     placeholder={session?"输入命令后按 Enter；支持 cd、ls、git、brew 等":"请先启动本机终端"}
     disabled={!session} spellCheck={false} autoComplete="off" value={command}
     onChange={e=>setCommand(e.target.value)} maxLength={4000}/>
    <button type="submit" className="primary-button" data-testid="terminal-send" disabled={!session||!command.trim()}>执行</button>
   </form>
   <p className="subtle">Shell 使用当前登录用户权限，不是沙箱，也不是自动提权。输入的命令会真实影响本机；仅在信任来源时执行。此页面不持久化命令记录、终端内容或密码。</p>
   <div className="terminal-resize">窗口列数 <input type="number" min={40} max={220} value={cols}
     onChange={e=>setCols(Math.min(220,Math.max(40,Number(e.target.value)||100)))} aria-label="终端列数"/>
    行数 <input type="number" min={12} max={80} value={rows}
     onChange={e=>setRows(Math.min(80,Math.max(12,Number(e.target.value)||28)))} aria-label="终端行数"/>
    <button className="secondary-button" type="button" disabled={!session}
     onClick={()=>void invoke("better_terminal_resize",{sessionId:session?.session_id,cols,rows})
       .catch(e=>setError(String(e)))}>应用窗口尺寸</button>
   </div>
  </>}
  {tab==="brew"&&<div className="terminal-brew" data-testid="terminal-brew-manager">
   <div className="terminal-brew-status">
    <div><h3>Homebrew · 不用背命令</h3>
     <p className="subtle">状态：{brew?brew.installed?"已检测到本机 Homebrew":"尚未找到 Homebrew":"尚未检查"} · {brew?.executable??"未发现默认安装路径"}</p>
     <p className="subtle">Apple Silicon 常见安装位置：/opt/homebrew；Intel Mac 通常为 /usr/local。检测只读，不会自动安装。</p>
    </div>
    <button type="button" className="secondary-button" disabled={!native}
     onClick={()=>void invoke<BrewStatus>("better_terminal_brew_status").then(setBrew).catch(e=>setError(String(e)))}>刷新状态</button>
   </div>
   {!brew?.installed&&<div className="terminal-install-guide">
    <strong>首次安装 Homebrew</strong>
    <p>Apple Silicon 可通过 Homebrew 官方发布的 .pkg 安装器进行图形化安装。下载后需要由你在 macOS 中打开、阅读系统提示并确认；Sentinel 不会静默安装或收集管理员密码。</p>
    <button type="button" className="primary-button" onClick={()=>void openOfficial(INSTALL_RELEASE)}>前往 Homebrew 官方 .pkg 发布页 ↗</button>
    <button type="button" className="secondary-button" onClick={()=>void openOfficial(INSTALL_GUIDE)}>官方安装说明 ↗</button>
   </div>}
   <h3>搜索、了解和安装软件包</h3>
   <div className="terminal-brew-search">
    <label htmlFor="brew-formula">Formula 名称</label>
    <input id="brew-formula" className="field" placeholder="例如：wget、jq、python"
      value={pkg} onChange={e=>setPkg(e.target.value)} maxLength={80} autoComplete="off"/>
    <button type="button" className="secondary-button" disabled={!session||!validFormulaName(pkg)} onClick={()=>requestPackage("search")}>搜索</button>
    <button type="button" className="secondary-button" disabled={!session||!validFormulaName(pkg)} onClick={()=>requestPackage("info")}>查看信息</button>
    <button type="button" className="primary-button" data-testid="brew-install-preview" disabled={!session||!brew?.installed||!validFormulaName(pkg)}
      onClick={()=>requestPackage("install")}>预览安装</button>
   </div>
   <div className="terminal-recipe-grid">
    {TERMINAL_PRESETS.filter(x=>x.id.startsWith("brew-")).map(recipe=><button type="button" key={recipe.id}
      disabled={!session||!brew?.installed} onClick={()=>requestRecipe(recipe)}>
      <strong>{recipe.title}</strong><small>{recipe.description}</small><span>↗</span>
    </button>)}
   </div>
   <p className="subtle">Homebrew 的安装/更新可能联网，并可能改变本机软件。当前版本不提供自动批量安装、不执行网络下载脚本、不保存管理员凭据。</p>
  </div>}
  {tab==="guide"&&<div data-testid="terminal-recipes">
   <h3>macOS 常用操作</h3>
   <p className="subtle">每个按钮都是可查看、可验证的本机操作，不需要记忆对应命令。</p>
   <div className="terminal-recipe-grid">
    {TERMINAL_PRESETS.filter(x=>!x.id.startsWith("brew-")).map(recipe=><button type="button" key={recipe.id}
      disabled={!session} onClick={()=>requestRecipe(recipe)}>
      <strong>{recipe.title}</strong><small>{recipe.description}</small><span>↗</span>
    </button>)}
   </div>
   <div className="terminal-install-guide">
    <strong>权限说明</strong>
    <p>Sentinel 的 Go 系统调查权限、当前用户运行 shell 的权限、macOS 的文件/隐私授权，以及管理员安装权限是不同机制。Better Terminal 不会自动继承原 Sentinel 的特殊访问能力，更不会绕过 macOS 弹窗。</p>
    <p>这是首版带真实 PTY 的终端，当前文字输出视图适合常规命令、交互式确认和 Homebrew；不承诺已支持 vim 等全屏 ANSI 终端应用的完整显示。</p>
   </div>
  </div>}
  {pending&&<div className="terminal-confirm" role="dialog" aria-modal="true" aria-label="确认终端操作"
    data-testid="terminal-action-confirmation">
   <h3>确认执行：{pending.label}</h3>
   <p>{pending.reason}</p>
   <p>下列命令将在你当前的真实 macOS Shell 中执行；请确认来源和预期影响。</p>
   <code>{pending.command}</code>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="terminal-confirm-run"
      onClick={()=>void confirmAction()}>我已检查，确认执行</button>
    <button type="button" className="secondary-button" onClick={()=>setPending(null)}>取消</button>
   </div>
  </div>}
 </section>;
}
