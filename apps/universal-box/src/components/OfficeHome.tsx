import {useEffect,useState} from "react";
import {OFFICE_MAIN_SHORTCUTS,OFFICE_FAST_ACTIONS} from "../lib/officeHomeShortcuts";
import {getRecentExports,subscribeRecentExports,type RecentExport} from "../lib/recentExports";
import {queueFilesForIntake} from "../lib/pendingFileIntake";

export type HomeWorkspace={id:string;name:string;symbol:string;description:string};
type Props={
 favorites:HomeWorkspace[];
 recents:HomeWorkspace[];
 totalTools:number;
 onOpen:(view:string,module?:string)=>void;
 onSearch:()=>void;
 onUnpin:(id:string)=>void;
};

/** Action-first desktop start screen; all actions open existing tools, never a second converter. */
export default function OfficeHome({favorites,recents,totalTools,onOpen,onSearch,onUnpin}:Props){
 const [exports,setExports]=useState<RecentExport[]>(getRecentExports);
 const [dragging,setDragging]=useState(false);
 useEffect(()=>subscribeRecentExports(()=>setExports(getRecentExports())),[]);
 return <div className="office-home" data-testid="redesigned-home">
  <div className="home-heading">
   <div>
    <p className="eyebrow">SENTINEL BOX / YOUR WORKSPACE</p>
    <h1>今天想处理什么？</h1>
    <p className="intro">PDF、文字、图片、表格、文件整理与设备传输。免费、优先本地运行，不必翻找复杂菜单。</p>
   </div>
   <div className="home-head-actions">
    <button type="button" className="primary-button" data-testid="home-find-tool" onClick={onSearch}>⌕ 搜索所有工具 <kbd>⌘K</kbd></button>
    <button type="button" className="secondary-button" onClick={()=>onOpen("all-tools")}>浏览工具库 ↗</button>
   </div>
  </div>
  <div className="home-dropzone" data-testid="home-file-dropzone" data-dragging={dragging}
   onDragOver={event=>{event.preventDefault();setDragging(true);}}
   onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}}
   onDrop={event=>{
    event.preventDefault();setDragging(false);
    if(queueFilesForIntake(Array.from(event.dataTransfer.files)))onOpen("file-intake");
   }}>
   <span className="home-drop-icon" aria-hidden="true">⇪</span>
   <div><strong>拖入文件，或选择本机文件开始</strong>
    <p>先进入文件工作台检查格式、大小与重复项，再由你决定是否扫描或导出。</p></div>
   <label className="home-file-choose">选择文件
    <input type="file" multiple aria-label="首页选择文件进入预检" data-testid="home-file-input"
     onChange={event=>{
      const files=Array.from(event.currentTarget.files??[]);
      event.currentTarget.value="";
      if(queueFilesForIntake(files))onOpen("file-intake");
     }}/>
   </label>
  </div>
  <div className="home-facts" aria-label="Local workspace overview">
   <span><strong>{totalTools}</strong> 个可查找工具</span>
   <span><strong>{favorites.length}</strong> 个收藏工作台</span>
   <span><strong>{exports.length}</strong> 次本次启动导出</span>
   <span className="home-facts-privacy">● 本机优先 · 无需订阅</span>
  </div>
  <section className="home-section" data-testid="home-sentinel-workspaces" aria-label="Original Sentinel Mac system tools">
   <header className="home-section-title"><div><p className="eyebrow">ORIGINAL SENTINEL · MAC SYSTEM</p>
    <h2>哨兵系统工作台</h2>
    <p className="subtle">原 Go 系统监控与调查引擎已作为内置服务接入。需要你主动启动服务；不会打开页面就扫描系统。</p>
   </div>
   <button type="button" className="home-inline-action" onClick={()=>onOpen("sentinel")}>完整入口 →</button>
   </header>
   <div className="home-task-grid sentinel-home-grid">
    {([
      ["sentinel","◉","系统概览与扫描","Easy Scan · Review Queue"],
      ["sentinel-investigate","⌕","证据调查","Evidence Graph · Timeline"],
      ["sentinel-compare","⇄","历史与变化","Behavior · Trust"],
      ["sentinel-system","⌘","进程与网络","启动项 · 存储历史"],
      ["sentinel-actions","✚","系统诊断与安全操作","Doctor · 原 WebView 恢复中心"],
      ["sentinel-limits","◈","权限与状态","Visibility · Runtime Logs"]
    ] as const).map(([id,icon,title,description])=><button key={id} type="button" className="home-task"
      data-testid={"home-"+id} onClick={()=>onOpen(id)}>
      <span className="home-task-icon" aria-hidden="true">{icon}</span>
      <span className="home-task-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="home-task-arrow" aria-hidden="true">↗</span>
    </button>)}
   </div>
  </section>
  <section className="home-section" data-testid="office-home-shortcuts" aria-label="Everyday office shortcuts">
   <header className="home-section-title"><div><p className="eyebrow">01 / MOST USED</p><h2>常用办公</h2><p className="subtle">选择任务后直接进入对应的现有工具。</p></div></header>
   <div className="home-task-grid" data-testid="office-first-task-grid">
    {OFFICE_MAIN_SHORTCUTS.map(item=><button type="button" className="home-task" key={item.id}
     data-testid={item.id} onClick={()=>onOpen(item.view,item.module)}>
     <span className="home-task-icon" aria-hidden="true">{item.icon}</span>
     <span className="home-task-copy"><strong>{item.title}</strong><small>{item.hint}</small></span>
     <span className="home-task-arrow" aria-hidden="true">↗</span>
    </button>)}
   </div>
  </section>
  <section className="home-section" data-testid="office-fast-actions" aria-label="Common one-click office workflows">
   <header className="home-section-title"><div><p className="eyebrow">02 / SHORTCUTS</p><h2>一步直达</h2><p className="subtle">无需重新配置：打开 PDF 压缩、图片处理、文档制作等现有功能。</p></div></header>
   <div className="home-actions">
    {OFFICE_FAST_ACTIONS.map(item=><button type="button" className="home-action" key={item.id}
     data-testid={item.id} title={item.hint} onClick={()=>onOpen(item.view,item.module)}>{item.title}<span aria-hidden="true">→</span></button>)}
   </div>
  </section>
  <div className="home-bottom-grid">
   <section className="home-section" data-testid="home-favorites">
    <header className="home-section-title"><div><p className="eyebrow">03 / PINNED</p><h2>收藏的工作台</h2></div>
     <button className="home-inline-action" type="button" onClick={()=>onOpen("all-tools")}>全部工具 →</button></header>
    {favorites.length===0?<div className="home-empty">在任意工作台顶部点击 ☆，即可固定在首页。</div>:
     <div className="home-link-stack">{favorites.slice(0,8).map(item=><div className="home-link-row" key={item.id}>
      <button type="button" onClick={()=>onOpen(item.id)}><span aria-hidden="true">{item.symbol}</span><span>{item.name}</span></button>
      <button type="button" className="home-remove-pin" aria-label={"取消收藏 "+item.name} title="取消收藏" onClick={()=>onUnpin(item.id)}>★</button>
     </div>)}</div>}
   </section>
   <section className="home-section" data-testid="home-recents">
    <header className="home-section-title"><div><p className="eyebrow">04 / CONTINUE</p><h2>最近打开</h2></div></header>
    {recents.length===0?<div className="home-empty">你打开的工具会出现在这里，方便快速继续。</div>:
     <div className="home-link-stack">{recents.slice(0,7).map(item=><button className="home-link-row home-recent-button"
      key={item.id} type="button" onClick={()=>onOpen(item.id)}>
      <span aria-hidden="true">{item.symbol}</span><span>{item.name}</span><span aria-hidden="true">↗</span>
     </button>)}</div>}
   </section>
  </div>
  <section className="home-section" data-testid="home-recent-exports">
   <header className="home-section-title">
    <div><p className="eyebrow">05 / LOCAL OUTPUTS</p><h2>本次启动的导出记录</h2>
     <p className="subtle">只显示成功导出的文件名和大小；不读取文件内容，也不保存到云端或跨重启保存。</p></div>
   </header>
   {exports.length===0?<div className="home-empty">使用工具导出文件后，这里会显示最近的操作。</div>:
    <div className="home-export-list">{exports.map((item,index)=><div className="home-export" key={item.at+"-"+index}>
     <span className="home-file-extension">{item.extension||"FILE"}</span>
     <span className="home-export-name">{item.name}</span>
     <span className="subtle">{(item.size/1024).toFixed(1)} KB · {new Date(item.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>
    </div>)}</div>}
  </section>
  <p className="home-footnote">Sentinel 不会在首页自动上传、扫描或处理你的文件。涉及联网的操作需要你主动启动。</p>
 </div>;
}
