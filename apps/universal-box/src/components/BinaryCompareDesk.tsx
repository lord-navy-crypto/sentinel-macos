import {useEffect,useRef,useState,type ChangeEvent,type DragEvent} from "react";
import {exportFile} from "../lib/output";
import {
 compareBlobs,comparisonReport,COMPARE_MAX_BYTES,
 type BinaryCompareResult,type CompareProgress,
} from "../lib/binaryCompare";
import {sizeLabel} from "../lib/fileIntake";
import {consumeHandoff,subscribeRecentOutputs,getCompareSlot,setCompareSlot} from "../lib/recentOutputs";

export default function BinaryCompareDesk({onOpenTool}:{onOpenTool:(view:string,module?:string)=>void}){
 const [left,setLeft]=useState<File|null>(()=>getCompareSlot("left"));
 const [right,setRight]=useState<File|null>(()=>getCompareSlot("right"));
 const [result,setResult]=useState<BinaryCompareResult|null>(null);
 const [progress,setProgress]=useState<CompareProgress>({done:0,total:0});
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState("");
 const [hover,setHover]=useState<"left"|"right"|null>(null);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>{controller.current?.abort();},[]);
 function choose(side:"left"|"right",file?:File){
  setResult(null);setMessage("");
  setCompareSlot(side,file??null);
  if(side==="left")setLeft(file??null);else setRight(file??null);
 }
 useEffect(()=>{
  const acceptSavedResult=()=>{
   const first=consumeHandoff("binary-left");
   if(first)choose("left",first);
   const second=consumeHandoff("binary-right");
   if(second)choose("right",second);
  };
  const unsubscribe=subscribeRecentOutputs(acceptSavedResult);
  acceptSavedResult();
  return unsubscribe;
 },[]);
 function pick(event:ChangeEvent<HTMLInputElement>,side:"left"|"right"){
  const selected=event.currentTarget.files?.[0];event.currentTarget.value="";
  if(selected)choose(side,selected);
 }
 function drop(event:DragEvent<HTMLElement>,side:"left"|"right"){
  event.preventDefault();setHover(null);
  if(working)return;
  const selected=event.dataTransfer.files?.[0];
  if(selected)choose(side,selected);
 }
 async function compare(){
  if(!left||!right||working)return;
  if(left.size>COMPARE_MAX_BYTES||right.size>COMPARE_MAX_BYTES){
   setMessage("文件超过 256 MB 单文件上限；为保护内存，本工具拒绝此次比较。");return;
  }
  const signal=new AbortController();controller.current=signal;
  setWorking(true);setResult(null);setMessage("");
  setProgress({done:0,total:Math.max(left.size,right.size)});
  try{
   const next=await compareBlobs(left,right,{
    signal:signal.signal,
    onProgress:value=>{if(!signal.signal.aborted)setProgress(value);}
   });
   if(signal.signal.aborted)return;
   setResult(next);
   setMessage(next.status==="identical"?"全部字节一致：两个文件内容完全相同。":"发现字节差异。原始文件未被修改。");
  }catch(e){
   setMessage(e instanceof Error&&e.name==="AbortError"?"已取消比较。":("比较失败："+(e instanceof Error?e.message:String(e))));
  }finally{
   if(controller.current===signal)controller.current=null;
   setWorking(false);
  }
 }
 async function saveReport(){
  if(!result||!left||!right)return;
  try{
   const saved=await exportFile("universal-box-binary-diff.json",comparisonReport(result,left.name,right.name));
   setMessage(saved?"本机比较报告已导出；文件内容不会进入报告。":"已取消导出。");
  }catch(e){setMessage("无法保存报告："+(e instanceof Error?e.message:String(e)));}
 }
 const fraction=progress.total===0?0:Math.max(0,Math.min(100,progress.done/progress.total*100));
 return <section className="panel ub-compare">
  <div className="ub-intake-heading">
   <div>
    <p className="eyebrow">FILE LAB · EXACT BINARY DIFFERENCE · LOCAL ONLY</p>
    <h2>文件差异分析 · Binary Compare</h2>
    <p className="subtle">直接比较两个文件的每一个字节，生成差异分布图。适合验证 PDF 编辑前后、图片重新导出、文件传输结果。不同于仅比较文件名或大小。</p>
   </div>
   <div className="ub-intake-lock">⌁ 无需上传 · 每个文件 ≤256 MB</div>
  </div>
  <div className="ub-compare-pair">
   {(["left","right"] as const).map((side,index)=>{
    const file=side==="left"?left:right;
    return <div key={side} className="ub-compare-drop"
      data-dragging={hover===side}
      onDragOver={event=>{event.preventDefault();if(!working)setHover(side);}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setHover(null);}}
      onDrop={event=>drop(event,side)}>
      <div className="ub-compare-drop-heading"><span>{index===0?"A":"B"}</span><strong>{index===0?"原始文件":"对比文件"}</strong></div>
      <div className="ub-compare-symbol" aria-hidden="true">{file?"▣":"⇪"}</div>
      <strong className="ub-compare-file-name">{file?.name??"拖入文件 / 选择文件"}</strong>
      <span className="subtle">{file?sizeLabel(file.size):"支持任意文件类型，按实际字节比较"}</span>
      <input className="field" type="file" disabled={working} aria-label={index===0?"选择原始文件":"选择对比文件"}
       onChange={event=>pick(event,side)}/>
      {file&&<button type="button" className="secondary-button" disabled={working} onClick={()=>choose(side)}>移除此文件</button>}
     </div>;
   })}
  </div>
  <div className="ub-compare-controls">
   <button className="primary-button" type="button" disabled={!left||!right||working} onClick={()=>void compare()}>
    {working?"正在逐字节比较…":"开始精确对比"}
   </button>
   {working&&<button className="secondary-button" type="button" onClick={()=>controller.current?.abort()}>取消比较</button>}
   <button className="secondary-button" type="button" onClick={()=>onOpenTool("file-intake")}>SHA-256 校验清单 →</button>
  </div>
  {working&&<div className="ub-compare-progress" role="status">
   <div><strong>已检查 {sizeLabel(progress.done)} / {sizeLabel(progress.total)}</strong><span>{fraction.toFixed(0)}%</span></div>
   <progress max={progress.total||1} value={progress.done} aria-label="逐字节检查进度"/>
  </div>}
  {message&&<p className="subtle" role="status">{message}</p>}
  {result&&<div className="ub-compare-results">
   <div className="ub-compare-banner" data-status={result.status}>
    <span aria-hidden="true">{result.status==="identical"?"✓":"≠"}</span>
    <div><strong>{result.status==="identical"?"文件内容完全一致":"两个文件存在差异"}</strong>
     <p className="subtle">{result.status==="identical"?"所有字节均已完整比较。":"不同区域会在下方差异分布图中突出显示。"}</p></div>
   </div>
   <div className="ub-intake-metrics">
    <div><span>已比较</span><strong>{sizeLabel(result.comparedBytes)}</strong></div>
    <div><span>差异字节</span><strong>{result.changedBytes.toLocaleString()}</strong></div>
    <div><span>差异数据块</span><strong>{result.dirtyChunks} / {result.totalChunks}</strong></div>
    <div><span>首次差异偏移</span><strong>{result.firstDifference===null?"无":result.firstDifference.toLocaleString()}</strong></div>
   </div>
   <h3>字节差异分布图</h3>
   <p className="subtle">每格代表文件整体的一段位置。蓝色为一致，橙色为至少一个字节发生变化；末尾长度差异也会标记。图示经过分段汇总，不是逐字节图。</p>
   {result.segments.length>0
    ?<div className="ub-compare-map" role="img" aria-label={"文件差异分布图：共 "+result.segments.length+" 个区间，"+result.segments.filter(x=>x.different).length+" 个存在差异"}>
      {result.segments.map((segment,index)=><span key={index} className={segment.different?"changed":"same"} title={(segment.start+1).toLocaleString()+"–"+segment.end.toLocaleString()+" 字节："+(segment.different?"存在差异":"相同")}/>)}
     </div>
    :<p className="subtle">两个文件都为空，没有任何字节需要比较。</p>}
   <div className="ub-compare-legend"><span><i className="same"/>一致</span><span><i className="changed"/>发生变化</span></div>
   <div className="ub-compare-summary">
    <span>文件 A：{sizeLabel(result.aSize)}</span><span>文件 B：{sizeLabel(result.bSize)}</span>
    <span>大小差异：{sizeLabel(Math.abs(result.aSize-result.bSize))}</span>
   </div>
   <button type="button" className="secondary-button" onClick={()=>void saveReport()}>导出 JSON 对比报告</button>
  </div>}
  <p className="subtle">本工具只读取你主动选择的两个文件，不会覆盖、删除或上传文件。此功能进行完整字节比较，但不能判断文件是否安全，也不能证明来源可信；导出的报告仅包含文件名称、统计数字和差异位置，不包含文件原始数据。</p>
 </section>;
}
