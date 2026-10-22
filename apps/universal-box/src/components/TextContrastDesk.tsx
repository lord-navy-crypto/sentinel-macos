import {useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {wcagContrast,suggestBlackOrWhite,contrastTextReport} from "../lib/wcagTextContrast";

export default function TextContrastDesk(){
 const [foreground,setForeground]=useState("#777777");
 const [background,setBackground]=useState("#FFFFFF");
 const [sample,setSample]=useState("这是一段用于检查文字对比度的示例 · Sample text");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const verdict=useMemo(()=>{
  try{
   const result=wcagContrast(foreground,background);
   return {result,error:""};
  }catch(error){
   return {result:null,error:error instanceof Error?error.message:String(error)};
  }
 },[foreground,background]);
 const result=verdict.result;
 const recommendation=useMemo(()=>{
  try{return suggestBlackOrWhite(background);}
  catch{return null;}
 },[background]);
 async function save(){
  if(!result||busy)return;
  setBusy(true);setStatus("");
  try{
   const confirmed=await exportFile("sentinel-wcag-text-contrast.txt",contrastTextReport(result));
   setStatus(confirmed?"已保存真实对比度与判断报告（不是整份文档的无障碍认证）。":"已取消保存。");
  }catch(error){setStatus("保存失败："+String(error instanceof Error?error.message:error));}
  finally{setBusy(false);}
 }
 const pass=(value:boolean)=>value?"通过":"未达到";
 return <section className="panel" data-testid="wcag-contrast-desk">
  <p className="eyebrow">SENTINEL BOX · ACCESSIBILITY BASICS · OFFLINE</p>
  <h2>文字颜色对比度检查 · WCAG 2.2</h2>
  <p className="subtle">用于网页、文档和演示文稿的文字配色。输入两种不透明的 sRGB 颜色即可本地计算对比度，按 <strong>WCAG 2.2</strong> 普通文字/大字号文字的 AA、AAA 阈值判定。无联网、无文件扫描。</p>
  <div className="tools-pair">
   <label className="field-label">文字颜色（#RGB / #RRGGBB）
    <input className="field" data-testid="contrast-foreground" maxLength={16}
     value={foreground} onChange={e=>setForeground(e.target.value)}/>
    <input type="color" aria-label="选择文字颜色" data-testid="contrast-foreground-picker"
     value={result?.foreground??"#777777"}
     onChange={e=>setForeground(e.target.value)}/>
   </label>
   <label className="field-label">背景颜色（#RGB / #RRGGBB）
    <input className="field" data-testid="contrast-background" maxLength={16}
     value={background} onChange={e=>setBackground(e.target.value)}/>
    <input type="color" aria-label="选择背景颜色" data-testid="contrast-background-picker"
     value={result?.background??"#FFFFFF"}
     onChange={e=>setBackground(e.target.value)}/>
   </label>
  </div>
  <label className="field-label">预览文字（仅供视觉参考）
   <input className="field" data-testid="contrast-sample" value={sample}
    maxLength={140} onChange={e=>setSample(e.target.value)}/>
  </label>
  {result?<div data-testid="contrast-result">
   <div className="panel" data-testid="contrast-preview"
    style={{backgroundColor:result.background,color:result.foreground,padding:22,
     borderRadius:8,minHeight:80}}>
    <strong style={{fontSize:22}}>{sample||"Sample text"}</strong>
    <p style={{fontSize:15,marginTop:8}}>Regular size · 常规文字</p>
   </div>
   <div className="metrics">
    <span data-testid="contrast-ratio">实际对比度：{result.ratio.toFixed(2)}:1</span>
    <span data-testid="contrast-aa-normal">AA 普通文字 4.5:1：{pass(result.aaNormal)}</span>
    <span data-testid="contrast-aa-large">AA 大字号 3:1：{pass(result.aaLarge)}</span>
    <span data-testid="contrast-aaa-normal">AAA 普通文字 7:1：{pass(result.aaaNormal)}</span>
    <span data-testid="contrast-aaa-large">AAA 大字号 4.5:1：{pass(result.aaaLarge)}</span>
   </div>
   <p className="subtle">建议：在此背景上使用 {recommendation?.foreground??"黑色或白色"} 文字时的对比度约为 {recommendation?.ratio.toFixed(2)??"—"}:1。建议值仅为黑白二选一，不会自动更改原颜色。</p>
   <div className="actions">
    <button className="secondary-button" type="button" data-testid="contrast-swap"
     onClick={()=>{setForeground(background);setBackground(foreground);}}>交换文字与背景</button>
    <button className="secondary-button" type="button" data-testid="contrast-use-suggestion"
     disabled={!recommendation} onClick={()=>{if(recommendation)setForeground(recommendation.foreground);}}>使用建议文字色</button>
    <button className="primary-button" type="button" data-testid="contrast-export"
     disabled={busy} onClick={()=>void save()}>导出 TXT 结果</button>
   </div>
  </div>:<p data-testid="contrast-error" role="alert">{verdict.error}</p>}
  <p className="subtle">限制：不判断实际字体大小、透明层、图片背景、图标、键盘可访问性、屏幕阅读器和整份文档的无障碍情况。计算结果的通过/未达到使用<strong>未四舍五入</strong>的真实比值；界面显示值仅用于阅读。</p>
  {status&&<p className="subtle" role="status" data-testid="contrast-status">{status}</p>}
 </section>;
}
