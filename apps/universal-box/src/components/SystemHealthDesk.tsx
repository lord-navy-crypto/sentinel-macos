import {useEffect,useState} from "react";
import {exportFile} from "../lib/output";
import {diagnosticExport,runLocalDiagnostics,summarizeDiagnostics,type DiagnosticCheck} from "../lib/desktopDiagnostics";

export default function SystemHealthDesk({onOpenTool}:{onOpenTool:(view:string,module?:string)=>void}){
 const [checks,setChecks]=useState<DiagnosticCheck[]>([]);
 const [running,setRunning]=useState(false);
 const [status,setStatus]=useState("");
 async function run(){
  setRunning(true);setStatus("");
  try{setChecks(await runLocalDiagnostics());setStatus("本机能力自检已完成；不涉及网络连接或扫描用户文件。");}
  catch(e){setStatus("自检未完成："+(e instanceof Error?e.message:String(e)));}
  finally{setRunning(false);}
 }
 useEffect(()=>{void run();},[]);
 const summary=summarizeDiagnostics(checks);
 async function exportReport(){
  try{const saved=await exportFile("universal-box-capabilities.json",diagnosticExport(checks));
   setStatus(saved?"本机诊断报告已保存，不包含用户名和本机文件内容。":"已取消导出。");}
  catch(e){setStatus("导出失败："+(e instanceof Error?e.message:String(e)));}
 }
 return <section className="panel ub-health">
  <p className="eyebrow">SENTINEL BOX · LOCAL DIAGNOSTICS</p>
  <div className="ub-intake-heading">
   <div><h2>应用健康检查 · System Health</h2>
    <p className="subtle">检查桌面外壳、加密哈希、Canvas 渲染、偏好存储和剪贴板能力。这里只验证本机基础接口，并不替代真实 Mac 上的 PDF、DMG 安装或网络传输测试。</p></div>
   <div className="ub-intake-lock">0.31 · Local only</div>
  </div>
  <div className="ub-intake-metrics">
   <div><span>通过</span><strong>{summary.ok}</strong></div>
   <div><span>需注意</span><strong>{summary.attention}</strong></div>
   <div><span>提示</span><strong>{summary.info}</strong></div>
   <div><span>检测项</span><strong>{checks.length}</strong></div>
  </div>
  <div className="ub-health-list" role="list" aria-label="Local app capability checks">
   {checks.map(check=><div key={check.id} className="ub-health-check" role="listitem">
    <span className={"ub-health-indicator "+check.level} aria-hidden="true">{check.level==="ok"?"✓":check.level==="attention"?"!":"i"}</span>
    <div><strong>{check.title}</strong><p className="subtle">{check.detail}</p></div>
   </div>)}
  </div>
  <div className="actions" style={{marginTop:20}}>
   <button type="button" className="primary-button" disabled={running} onClick={()=>void run()}>{running?"检测中…":"重新运行自检"}</button>
   <button type="button" className="secondary-button" disabled={running||!checks.length} onClick={()=>void exportReport()}>导出诊断 JSON</button>
   <button type="button" className="secondary-button" onClick={()=>onOpenTool("data")}>打开备份与隐私工具</button>
  </div>
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">安全提醒：此工具不会取消 macOS Gatekeeper、修改系统保护设置或访问其他应用的文件。未签名或未公证应用是否被允许启动，仍由 macOS 决定。</p>
 </section>;
}
