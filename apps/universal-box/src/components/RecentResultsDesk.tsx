import {useSyncExternalStore} from "react";
import {
 clearRecentOutputs,removeRecentOutput,requestHandoff,
 recentOutputSnapshot,subscribeRecentOutputs,MAX_HANDOFF_BYTES,
 type HandoffTarget,
} from "../lib/recentOutputs";
function formatSize(bytes:number):string{
 return bytes>=1_000_000?(bytes/1_000_000).toFixed(2)+" MB":(bytes/1000).toFixed(1)+" KB";
}
const shortcuts:{target:HandoffTarget;label:string;view:string}[]=[
 {target:"nearby",label:"发给附近 Mac",view:"commons"},
 {target:"file-intake",label:"检查文件指纹",view:"file-intake"},
 {target:"binary-left",label:"设为比较文件 A",view:"binary-compare"},
 {target:"binary-right",label:"设为比较文件 B",view:"binary-compare"},
];
export default function RecentResultsDesk({onOpenTool}:{onOpenTool:(view:string,module?:string)=>void}){
 const results=useSyncExternalStore(subscribeRecentOutputs,recentOutputSnapshot,recentOutputSnapshot);
 function send(id:number,target:HandoffTarget,view:string){
  if(requestHandoff(id,target))onOpenTool(view);
 }
 return <section className="panel ub-results">
  <p className="eyebrow">UNIVERSAL BOX · IN-APP HANDOFF · SESSION ONLY</p>
  <h2>最近成果 · Recent Results</h2>
  <p className="subtle">所有使用统一“导出文件”功能的工具，在你成功保存输出后，会把可共享的小文件临时显示在这里。点击后直接交给下一个应用内工具，不用去 Finder 里重新寻找，也不用使用微信或邮件传输。只进行你点击确认的操作。</p>
  <div className="ub-results-heading">
   <strong>{results.length} 个最近输出</strong>
   <span className="subtle">每个最多 {formatSize(MAX_HANDOFF_BYTES)} · 最多 6 个 · 仅内存</span>
   <button type="button" className="secondary-button" disabled={!results.length} onClick={clearRecentOutputs}>清空临时输出</button>
  </div>
  {results.length===0?
   <div className="ub-results-empty">
    <strong>没有最近输出</strong>
    <p className="subtle">先从 PDF、图片、表格或图表等工具保存一个文件，回到这里即可继续处理或发送。取消保存的输出不会出现在这里。超过 8 MB 的文件不会暂存。</p>
    <button type="button" className="primary-button" onClick={()=>onOpenTool("all-tools")}>浏览工具 →</button>
   </div>:
   <div className="ub-results-list" role="list" aria-label="Temporary outputs available for reuse">
    {results.map(item=><div className="ub-results-card" role="listitem" key={item.id}>
     <div className="ub-results-file">
      <span className="ub-results-icon" aria-hidden="true">▣</span>
      <div><strong dir="auto">{item.name}</strong>
       <small>{formatSize(item.size)} · 本次打开期间可用</small>
      </div>
      <button type="button" className="secondary-button" title="Remove temporary result from memory" onClick={()=>removeRecentOutput(item.id)}>移除</button>
     </div>
     <div className="ub-results-actions">
      {shortcuts.map(action=><button type="button" className={action.target==="nearby"?"primary-button":"secondary-button"}
       key={action.target} onClick={()=>send(item.id,action.target,action.view)}>{action.label} →</button>)}
     </div>
    </div>)}
   </div>}
  <p className="subtle">安全与隐私：所有临时结果只保留在 Universal Box 运行内存中；关闭应用或点击清空后不再从此列表提供。不会自动上传、自动授权他人、自动覆盖原文件。文件需要先成功保存，且大小不超过 8 MB；并非所有插件或系统对话框都使用统一导出接口。附近传输需要双方都使用支持应用内配对的 Universal Box 测试版，并获得对方确认。</p>
 </section>;
}
