import {useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {listen,type UnlistenFn} from "@tauri-apps/api/event";
import {openUrl} from "@tauri-apps/plugin-opener";
import HomebrewSoftwareCenter from "./HomebrewSoftwareCenter";
import TerminalScreen,{type TerminalScreenHandle} from "./TerminalScreen";
import {
 TERMINAL_PRESETS,boundedTerminalLog,validTerminalInput,
 type TerminalRecipe
} from "../lib/betterTerminal";

type TerminalInfo={session_id:number;shell:string;home:string};
type BrewStatus={installed:boolean;executable:string|null;architecture:string;install_guide:string};
type OutputChunk={session_id:number;data:string};
type PendingAction={command:string;label:string;reason:string};
const INSTALL_GUIDE="https://docs.brew.sh/Installation";
const INSTALL_RELEASE="https://github.com/Homebrew/brew/releases/latest";

/** Real PTY console on native macOS; browser preview cannot execute commands. */
export default function BetterTerminalDesk({initialTab="terminal",active=true}:{initialTab?:"terminal"|"brew";active?:boolean}){
 const native=isTauri();
 const [tab,setTab]=useState<"terminal"|"brew"|"guide">(initialTab);
 useEffect(()=>{if(active)setTab(initialTab);},[active,initialTab]);
 const [session,setSession]=useState<TerminalInfo|null>(null);
 const sessionRef=useRef<TerminalInfo|null>(null);
 const listenerRef=useRef<UnlistenFn|null>(null);
 const [eventsReady,setEventsReady]=useState(false);
 const [running,setRunning]=useState(false);
 const [output,setOutput]=useState("Better Terminal · Sentinel Box\n命令不会自动运行。点击“启动本机终端”打开真正的 macOS 登录 Shell。\n");
 const [command,setCommand]=useState("");
 const [brew,setBrew]=useState<BrewStatus|null>(null);
 const [pending,setPending]=useState<PendingAction|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [cols,setCols]=useState(100);
 const [rows,setRows]=useState(28);
 const screenRef=useRef<TerminalScreenHandle|null>(null);
 useEffect(()=>{
  let alive=true;
  if(native){
   void listen<OutputChunk>("better-terminal:output",event=>{
    const active=sessionRef.current;
    if(active&&active.session_id===event.payload.session_id){
     screenRef.current?.write(event.payload.data);
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
 function handleTerminalResize(nextCols:number,nextRows:number){
  const clampedCols=Math.min(220,Math.max(40,nextCols));
  const clampedRows=Math.min(80,Math.max(12,nextRows));
  setCols(clampedCols);setRows(clampedRows);
  const active=sessionRef.current;
  if(active){
   void invoke("better_terminal_resize",{sessionId:active.session_id,cols:clampedCols,rows:clampedRows})
    .catch(e=>setError("终端尺寸更新失败："+String(e)));
  }
 }
 async function startTerminal(){
  if(!native||!eventsReady||running||sessionRef.current)return;
  setRunning(true);setError("");setNotice("");
  try{
   const info=await invoke<TerminalInfo>("better_terminal_start",{cols,rows});
   sessionRef.current=info;setSession(info);
   const message="\r\n已连接 "+info.shell+" · 当前用户权限 · 不会自动提升权限\r\n";
   screenRef.current?.write(message);
   setOutput(text=>boundedTerminalLog(text,message));
   screenRef.current?.focus();
  }catch(e){setError(String(e));}
  finally{setRunning(false);}
 }
 async function stopTerminal(){
  const active=sessionRef.current;
  if(!active)return;
  sessionRef.current=null;setSession(null);setPending(null);
  try{
   await invoke("better_terminal_stop",{sessionId:active.session_id});
   screenRef.current?.write("\r\n[终端会话已结束]\r\n");
   setNotice("终端会话已结束。");
  }
  catch(e){setError(String(e));}
 }
 async function send(data:string):Promise<boolean>{
  const active=sessionRef.current;if(!active){setError("请先启动终端会话。");return false;}
  if(!validTerminalInput(data)){setError("单次输入需要在 1–4096 UTF-8 字节内，不能包含 NUL 字符。");return false;}
  try{await invoke("better_terminal_write",{sessionId:active.session_id,data});setError("");return true;}
  catch(e){setError("命令发送失败："+String(e));return false;}
 }
 function submitInput(){
  const text=command;
  if(!text.trim())return;
  if(/\r|\n/.test(text)){setError("一条命令只能占一行；需要多行脚本时请使用外部 Terminal。");return;}
  void send(text+"\n").then(ok=>{
   if(ok)setCommand(current=>current===text?"":current);
  });
 }
 function requestRecipe(recipe:TerminalRecipe){
  if(recipe.modifies){setPending({label:recipe.title,command:recipe.command,reason:recipe.description});return;}
  setTab("terminal");void send(recipe.command+"\n");
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
 return <section className="panel better-terminal" data-testid="better-terminal-desk" aria-label="Better Terminal" data-active-tab={tab}>
  <div className="better-terminal-heading" data-session-state={session?"connected":"disconnected"}>
   <div className="better-terminal-title-block">
    <span className="better-terminal-app-mark" aria-hidden="true">⌘</span>
    <div className="better-terminal-title-copy">
     <p className="eyebrow">SENTINEL BOX / BETTER TERMINAL</p>
     <h2>Better Terminal <span>· 更好的终端</span></h2>
     <p className="subtle">真实的 macOS 登录 Shell、Homebrew 图形管理与常用系统操作。命令只在你明确操作后执行；已启动的任务可在 Box 内切换工具时继续运行。</p>
    </div>
   </div>
   <span className={"terminal-status"+(session?" connected":"")}><span className="terminal-status-dot" aria-hidden="true"/>{session?"本机终端已连接":"终端未连接"}</span>
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
   <button type="button" className="secondary-button" onClick={()=>{
     screenRef.current?.clear();setOutput("");
     setNotice("已清除屏幕显示，未删除任何文件。");
    }}>清屏</button>
   <button type="button" className="secondary-button" data-testid="terminal-fit"
     onClick={()=>{setTab("terminal");screenRef.current?.fit();screenRef.current?.focus();}}>适配窗口</button>
   <button type="button" className="secondary-button" onClick={()=>void copyOutput()}>复制输出</button>
  </div>
  {error&&<p role="alert" className="terminal-error">{error}</p>}
  {notice&&<p role="status" className="subtle">{notice}</p>}
  <div className="terminal-console-chrome" style={{display:tab==="terminal"?"flex":"none"}} aria-hidden={tab!=="terminal"}>
   <span className="terminal-window-controls" aria-hidden="true"><i/><i/><i/></span>
   <strong>本机 Shell</strong>
   <span className="terminal-console-session">{session?"SESSION ACTIVE":!native?"WEB PREVIEW":eventsReady?"READY TO CONNECT":"CONNECTING…"}</span>
  </div>
  <div className="terminal-viewport" data-testid="terminal-output"
   style={{display:tab==="terminal"?"block":"none"}}>
   <TerminalScreen ref={screenRef} visible={active&&tab==="terminal"}
    onInput={data=>{if(sessionRef.current)void send(data);}}
    onResize={handleTerminalResize}/>
  </div>
  {tab==="terminal"&&<>
   <form className="terminal-input-row" onSubmit={e=>{e.preventDefault();submitInput();}}>
    <label htmlFor="terminal-input">命令输入</label>
    <input id="terminal-input" className="field" data-testid="terminal-command-input"
     placeholder={session?"输入命令后按 Enter；支持 cd、ls、git、brew 等":"请先启动本机终端"}
     disabled={!session} spellCheck={false} autoComplete="off" value={command}
     onChange={e=>setCommand(e.target.value)} maxLength={4000}/>
    <button type="submit" className="primary-button" data-testid="terminal-send" disabled={!session||!command.trim()}>执行</button>
   </form>
   <p className="subtle">Shell 使用当前登录用户权限，不是沙箱，也不是自动提权。输入的命令会真实影响本机；仅在信任来源时执行。此页面不持久化命令记录、终端内容或密码。</p>
   <p className="subtle">ANSI/VT 交互式终端：支持彩色输出、方向键和原生键盘交互；窗口尺寸自动适配。当前 {cols} 列 × {rows} 行。</p>
  </>}
  <div className="terminal-brew" data-testid="terminal-brew-manager" style={{display:tab==="brew"?"block":"none"}} aria-hidden={tab!=="brew"}>
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
   <HomebrewSoftwareCenter native={native} installed={!!brew?.installed} />
   <div className="terminal-recipe-section">
    <div className="terminal-recipe-heading"><div><h3>终端快捷命令</h3><p className="subtle">这些预设会在真实终端会话中执行；与上方图形化安装流程相互独立。</p></div><span>需要先启动终端</span></div>
    <div className="terminal-recipe-grid">
     {TERMINAL_PRESETS.filter(x=>x.id.startsWith("brew-")).map(recipe=><button type="button" key={recipe.id}
       disabled={!session||!brew?.installed} onClick={()=>requestRecipe(recipe)}>
       <strong>{recipe.title}</strong><small>{recipe.description}</small><span>↗</span>
     </button>)}
    </div>
    <p className="subtle">Homebrew 的安装/更新可能联网，并可能改变本机软件。不执行网络下载脚本，不保存管理员凭据。</p>
   </div>
  </div>
  {tab==="guide"&&<div data-testid="terminal-recipes">
   <h3>macOS 常用操作</h3>
   <p className="subtle">每个按钮都是可查看、可验证的本机操作，不需要记忆对应命令。</p>
   <div className="terminal-recipe-section">
   <div className="terminal-recipe-heading"><div><h3>macOS 常用操作</h3><p className="subtle">只读检查与常见系统命令；每个操作都可查看说明。</p></div><span>快捷预设</span></div>
   <div className="terminal-recipe-grid">
    {TERMINAL_PRESETS.filter(x=>!x.id.startsWith("brew-")).map(recipe=><button type="button" key={recipe.id}
      disabled={!session} onClick={()=>requestRecipe(recipe)}>
      <strong>{recipe.title}</strong><small>{recipe.description}</small><span>↗</span>
    </button>)}
   </div>
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
