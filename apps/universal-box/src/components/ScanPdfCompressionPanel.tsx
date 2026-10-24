import {useEffect,useMemo,useRef,useState} from "react";
import {exportFile} from "../lib/output";
import {recompressScannedPdf,SCAN_PRESETS,type ScanPdfPreset,type ScannedPdfReport} from "../lib/scanPdfCompression";
import PdfPagePreview from "./PdfPagePreview";
const formatSize=(n:number)=>(n/1_000_000).toFixed(2)+" MB";
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function ScanPdfCompressionPanel({source}:{source:Uint8Array}){
 const [preset,setPreset]=useState<ScanPdfPreset>("balanced"),[accept,setAccept]=useState(false);
 const [result,setResult]=useState<ScannedPdfReport|null>(null),[busy,setBusy]=useState(false);
 const [progress,setProgress]=useState(""),[status,setStatus]=useState(""),[showPreview,setShowPreview]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>{controller.current?.abort();},[]);
 const outputFile=useMemo(()=>result?.output?
  new File([new Uint8Array(result.output)],"compressed-scan-preview.pdf",{type:"application/pdf"}):null,[result]);
 async function run(){
  if(busy||!accept)return;
  const job=new AbortController();controller.current=job;
  setBusy(true);setResult(null);setShowPreview(false);setStatus("");setProgress("Checking text layers and PDF interactivity...");
  try{
   const report=await recompressScannedPdf(source,{preset},p=>setProgress("Rendered "+p.done+" / "+p.total+" pages"),job.signal);
   if(job.signal.aborted)return;
   setResult(report);
   setStatus(report.improved?"A smaller candidate was created. Open the comparison preview and verify readable details before saving.":
    "The scanned-image JPEG rendering did not reduce size. No larger file will be offered for download.");
  }catch(e){setStatus(job.signal.aborted?"Compression cancelled. No output saved.":"Compression stopped: "+err(e));}
  finally{if(controller.current===job)controller.current=null;setBusy(false);setProgress("");}
 }
 async function save(){
  if(!result?.output||busy)return;
  setBusy(true);setStatus("");
  try{
   const done=await exportFile("sentinel-box-scanned-pdf-smaller.pdf",result.output);
   setStatus(done?"Saved a smaller scanned PDF copy locally; original untouched. Compare the pages before submitting.":"Save cancelled.");
  }catch(e){setStatus("Save failed: "+err(e));}
  finally{setBusy(false);}
 }
 return <section data-testid="pdf-scan-compressor">
  <h3>扫描件 PDF 真压缩 · DPI / JPEG 质量可调</h3>
  <p className="subtle">专为 <strong>没有可选中文字的扫描图片 PDF</strong> 提供实际图像重编码，而不是把文件重新保存一遍。最多 12 页，原件 ≤15 MB；逐页在本机渲染并重新编码 JPEG，再验证输出 PDF 页数和方向。</p>
  <p className="subtle" role="note"><strong>重要限制：</strong>这会把页面转换为 JPEG 图片，可能降低细小文字、图表的清晰度，删除矢量图形和 PDF 高级结构。含现有文字层、链接、批注、表单、签名、附件或书签的文件会被拒绝，避免静默破坏。输出不是 OCR PDF，不能搜索文字。</p>
  <label className="field-label">大小与画质预设
   <select className="field" data-testid="pdf-scan-preset" disabled={busy} value={preset} onChange={e=>{setPreset(e.target.value as ScanPdfPreset);setResult(null);setShowPreview(false);setStatus("");}}>
    {(Object.keys(SCAN_PRESETS) as ScanPdfPreset[]).map(key=><option key={key} value={key}>{SCAN_PRESETS[key].label}</option>)}
   </select>
  </label>
  <label className="field-label"><input type="checkbox" data-testid="pdf-scan-accept" disabled={busy} checked={accept} onChange={e=>setAccept(e.target.checked)}/>
   我了解扫描件会重新编码为图片，可能损失清晰度；我会在保存和分享前仔细检查结果
  </label>
  <div className="actions">
   <button className="primary-button" type="button" data-testid="pdf-scan-run" disabled={busy||!accept} onClick={()=>void run()}>{busy?"正在重新压缩…":"开始本地扫描件压缩"}</button>
   {busy&&<button className="secondary-button" type="button" data-testid="pdf-scan-cancel" onClick={()=>{controller.current?.abort();setProgress("Cancelling…");}}>取消当前压缩 · Cancel</button>}
   <button className="secondary-button" type="button" data-testid="pdf-scan-save" disabled={busy||!result?.output} onClick={()=>void save()}>另存真正更小的 PDF</button>
  </div>
  {progress&&<p className="subtle" role="status">{progress}</p>}
  {result&&<div data-testid="pdf-scan-report" className="panel">
   <div className="metrics">
    <span>原文件 {formatSize(result.originalBytes)}</span>
    <span>候选文件 {formatSize(result.candidateBytes)}</span>
    <span>{result.improved?"节省 "+result.savedPercent+"%":"没有体积收益"}</span>
    <span>{result.pages} 页 · {result.dpi} DPI</span>
   </div>
   <p>真实尺寸：{result.originalBytes.toLocaleString()} → {result.candidateBytes.toLocaleString()} 字节。{result.improved?"节省 "+result.savedBytes.toLocaleString()+" 字节。":"由于候选文件不小于原件，禁止保存无收益的副本。"}</p>
   {outputFile&&<button className="secondary-button" type="button" data-testid="pdf-scan-preview-toggle" onClick={()=>setShowPreview(v=>!v)}>
    {showPreview?"关闭压缩后页面预览":"打开压缩后页面预览"}
   </button>}
   {outputFile&&showPreview&&<div data-testid="pdf-scan-output-preview">
    <p className="subtle">以下是压缩后的真实 PDF；原文档预览可在当前工具下方查看。请特别检查小字、图片、页边距。</p>
    <PdfPagePreview file={outputFile} onPickPage={()=>{}}/>
   </div>}
  </div>}
  {status&&<p data-testid="pdf-scan-status" role="status" className="subtle">{status}</p>}
 </section>;
}
