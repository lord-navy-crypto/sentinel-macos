import {useState} from "react";
import {exportFile} from "../lib/output";
import {optimizePdfStructure,type PdfOptimizeResult} from "../lib/pdfStructureOptimize";
export default function PdfStructureOptimizationPanel({source}:{source:Uint8Array}){
 const [result,setResult]=useState<PdfOptimizeResult|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 async function analyze(){
  setResult(null);setBusy(true);setStatus("");
  try{
   const r=await optimizePdfStructure(source);setResult(r);
   setStatus(r.improved?"Candidate is smaller. Review size comparison and PDF compatibility warning before saving.":"No smaller file was produced; the original is already at least as compact under this method.");
  }catch(e){setStatus("Optimization unavailable: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function save(){
  if(!result?.optimized||busy)return;
  setBusy(true);setStatus("");
  try{
   const ok=await exportFile("sentinel-box-structure-optimized.pdf",result.optimized);
   setStatus(ok?"Saved a smaller PDF copy. Original file remains untouched. Please recheck its appearance and links.":"Save cancelled.");
  }catch(e){setStatus("Save failed: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 return <div data-testid="pdf-structure-optimizer">
  <h3>PDF 文件大小优化 · 本地结构重排</h3>
  <p className="subtle">尝试通过 PDF 对象流重排减少文件结构开销，真实比较前后字节数，只有结果确实更小时才允许保存。<strong>不会重新压缩扫描图片、降低图片 DPI 或自动移除 PDF 内容。</strong> 因此一些 PDF 可能完全没有节省空间。</p>
  <p className="subtle" role="note"><strong>兼容性提醒：</strong>对已签名文档或交互表单不提供此操作；高级结构、PDF/A 合规性、附件等也可能受重写影响。不能将这项功能当作无损保证或全面 PDF 压缩器。</p>
  <div className="actions">
   <button data-testid="pdf-optimize-run" className="primary-button" type="button" disabled={busy} onClick={()=>void analyze()}>分析是否能缩小文件</button>
   <button data-testid="pdf-optimize-save" className="secondary-button" type="button" disabled={busy||!result?.optimized} onClick={()=>void save()}>另存更小的 PDF</button>
  </div>
  {result&&<div data-testid="pdf-optimize-report">
   <p>页数：{result.pages} · 源文件：{result.originalBytes.toLocaleString()} 字节 · 候选：{result.candidateBytes.toLocaleString()} 字节</p>
   <p>{result.improved?"实际节省 "+result.savedBytes.toLocaleString()+" 字节（"+result.percent+"%）":"没有体积收益；无需输出一个更大的副本"}</p>
  </div>}
  {status&&<p data-testid="pdf-optimize-status" role="status" className="subtle">{status}</p>}
 </div>;
}
