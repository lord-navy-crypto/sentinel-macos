import {useMemo,useState} from "react";
import {diffLines,diffWords,normalizeForComparison,unifiedDiff} from "../lib/textDiff";
import {exportFile} from "../lib/output";

const paint={same:"#546174",add:"#146c43",del:"#a43e42"};
const backgrounds={same:"transparent",add:"#e4f5ec",del:"#fee8e8"};
export default function TextCompareDesk(){
 const [left,setLeft]=useState("Force is mass times acceleration.\nDraw the FBD first.");
 const [right,setRight]=useState("Net force is mass times acceleration.\nDraw the FBD first.\nCheck units.");
 const [ignoreWhitespace,setIgnoreWhitespace]=useState(false);
 const [ignoreCase,setIgnoreCase]=useState(false);
 const [changedOnly,setChangedOnly]=useState(false);
 const [status,setStatus]=useState("");
 const analysis=useMemo(()=>{
   const l=normalizeForComparison(left,ignoreWhitespace,ignoreCase),r=normalizeForComparison(right,ignoreWhitespace,ignoreCase);
   if(l.length>100000||r.length>100000)return null;
   const lines=diffLines(l,r);
   const words=diffWords(l,r);
   const sameChars=words.filter(x=>x.type==="same").reduce((n,p)=>n+p.text.length,0);
   return {lines,words,similarity:Math.round(100*sameChars/Math.max(l.length,r.length,1)),
     additions:lines.filter(x=>x.type==="add").length,deletions:lines.filter(x=>x.type==="del").length,
     identical:l===r};
 },[left,right,ignoreWhitespace,ignoreCase]);
 async function save(){
  if(!analysis)return;
  try{const ok=await exportFile("daily-desk-text-diff.txt",unifiedDiff(analysis.lines));setStatus(ok?"Saved the complete comparison.":"Save cancelled.");}
  catch(e){setStatus(String(e));}
 }
 return <section className="panel">
  <h3>Text comparator · 文本差异比较</h3>
  <p className="subtle">Matched-line alignment, word-level highlights, case/space switches, similarity estimate and export. No network upload.</p>
  <div className="tools-pair">
   <label className="field-label">Original<textarea rows={9} className="field text-editor" value={left} maxLength={100000} onChange={e=>setLeft(e.target.value)}/></label>
   <label className="field-label">Revised<textarea rows={9} className="field text-editor" value={right} maxLength={100000} onChange={e=>setRight(e.target.value)}/></label>
  </div>
  <div className="actions">
   <label className="field-label"><input type="checkbox" checked={ignoreWhitespace} onChange={e=>setIgnoreWhitespace(e.target.checked)}/> Ignore extra spaces</label>
   <label className="field-label"><input type="checkbox" checked={ignoreCase} onChange={e=>setIgnoreCase(e.target.checked)}/> Ignore case</label>
   <label className="field-label"><input type="checkbox" checked={changedOnly} onChange={e=>setChangedOnly(e.target.checked)}/> Show changed lines only</label>
  </div>
  {analysis&&<>
   <p className="subtle">{analysis.identical?"Identical after options":"Different"} · Approx. {analysis.similarity}% textual overlap · +{analysis.additions} lines / −{analysis.deletions} lines</p>
   <h4>Word-level differences</h4>
   <div style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",padding:12,border:"1px solid #cbd5e1",borderRadius:9,maxHeight:240,overflowY:"auto"}}>
    {analysis.words.slice(0,5000).filter(t=>!changedOnly||t.type!=="same").map((part,i)=><span key={i} style={{background:backgrounds[part.type],color:paint[part.type],textDecoration:part.type==="del"?"line-through":"none"}}>{part.text}</span>)}
   </div>
   <h4>Line differences</h4>
   <div style={{maxHeight:300,overflow:"auto",border:"1px solid #cbd5e1",borderRadius:9}}>
    {analysis.lines.filter(x=>!changedOnly||x.type!=="same").slice(0,200).map((part,i)=><div key={i} style={{background:backgrounds[part.type],color:paint[part.type],fontFamily:"monospace",whiteSpace:"pre-wrap",padding:"2px 8px",overflowWrap:"anywhere"}}>{part.type==="same"?"  ":part.type==="add"?"+ ":"- "}{part.text}</div>)}
   </div>
   {analysis.lines.length>200&&<p className="subtle">On-screen line preview is limited to 200 rows. Export contains all lines.</p>}
   <div className="actions">
    <button className="secondary-button" type="button" onClick={()=>{void navigator.clipboard.writeText(unifiedDiff(analysis.lines)).then(()=>setStatus("Copied diff.")).catch(()=>setStatus("Clipboard unavailable."));}}>Copy diff</button>
    <button className="primary-button" type="button" onClick={()=>{void save();}}>Save full diff</button>
   </div>
  </>}
  {!analysis&&<p role="status" className="subtle">Comparison limit: 100,000 characters per side.</p>}
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}