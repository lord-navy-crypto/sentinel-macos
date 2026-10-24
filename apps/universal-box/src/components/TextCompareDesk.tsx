import {type ChangeEvent,useMemo,useRef,useState} from "react";
import {diffLines,diffWords,normalizeForComparison,unifiedDiff} from "../lib/textDiff";
import {inspectOffice} from "../lib/officeInspector";
import {exportFile} from "../lib/output";

const paint={same:"#546174",add:"#146c43",del:"#a43e42"};
const backgrounds={same:"transparent",add:"#e4f5ec",del:"#fee8e8"};
type Side="left"|"right";
const friendly=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function TextCompareDesk(){
 const [left,setLeft]=useState("Meeting agenda\nBudget review\nNext steps");
 const [right,setRight]=useState("Meeting agenda\nBudget and timeline review\nNext steps");
 const [ignoreWhitespace,setIgnoreWhitespace]=useState(false);
 const [ignoreCase,setIgnoreCase]=useState(false);
 const [changedOnly,setChangedOnly]=useState(false);
 const [status,setStatus]=useState("");
 const [source,setSource]=useState<Record<Side,string>>({left:"",right:""});
 const [loading,setLoading]=useState<Record<Side,boolean>>({left:false,right:false});
 // A later upload or manual edit invalidates the result of an older asynchronous read.
 const ticket=useRef<Record<Side,number>>({left:0,right:0});
 const active=loading.left||loading.right;
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
 function edit(side:Side,value:string){
   ticket.current[side]++;
   if(side==="left")setLeft(value);else setRight(value);
   setSource(old=>({...old,[side]:"Manually edited text"}));
   setLoading(old=>({...old,[side]:false}));
   setStatus("");
 }
 async function importDocx(side:Side,event:ChangeEvent<HTMLInputElement>){
   const file=event.currentTarget.files?.[0];event.currentTarget.value="";
   if(!file)return;
   const request=++ticket.current[side];
   setLoading(old=>({...old,[side]:true}));
   setSource(old=>({...old,[side]:"Reading "+file.name+"…"}));
   setStatus("");
   if(side==="left")setLeft("");else setRight("");
   try{
     if(!/\.docx$/iu.test(file.name)||file.size<1||file.size>8_000_000)
       throw Error("Choose a non-empty .docx file up to 8 MB (not .doc or .docm).");
     const report=await inspectOffice(file.name,new Uint8Array(await file.arrayBuffer()));
     if(ticket.current[side]!==request)return;
     if(report.kind!=="docx"||!report.plainText.trim())
       throw Error("No readable document body text found. Scanned-image-only DOCX needs OCR.");
     if(report.plainText.length>100000)
       throw Error("Extracted text exceeds 100,000 characters. Compare a shorter document.");
     if(side==="left")setLeft(report.plainText);else setRight(report.plainText);
     setSource(old=>({...old,[side]:file.name+" · "+report.sections.length+" paragraphs · "+report.plainText.length+" characters"}));
     setStatus("Imported "+file.name+" locally. Check the extracted text before comparing.");
   }catch(e){
     if(ticket.current[side]===request){
       setSource(old=>({...old,[side]:""}));
       setStatus("DOCX import failed: "+friendly(e));
     }
   }finally{
     if(ticket.current[side]===request)setLoading(old=>({...old,[side]:false}));
   }
 }
 async function save(){
  if(!analysis||active)return;
  try{const ok=await exportFile("daily-desk-text-diff.txt",unifiedDiff(analysis.lines));setStatus(ok?"Saved the complete text comparison.":"Save cancelled.");}
  catch(e){setStatus(friendly(e));}
 }
 return <section className="panel">
  <h3>Text & Word comparator · 文本／Word 差异比较</h3>
  <p className="subtle">Paste two versions or import two local .docx files (≤8 MB each); compare extracted body text, review changes and copy/save a TXT report. Nothing is uploaded or rewritten.</p>
  <p className="subtle">Text comparison only: formatting, images, headers/footers, comments and Word Track Changes are not compared. Review tracked revisions in Word before using the extracted text.</p>
  <div className="tools-pair">
   <div>
    <label className="field-label" htmlFor="diff-original-docx">Original Word DOCX</label>
    <input id="diff-original-docx" data-testid="diff-original-docx" type="file" className="field" accept=".docx" onChange={e=>void importDocx("left",e)}/>
    {source.left&&<p data-testid="diff-original-source" className="subtle">{source.left}</p>}
    <label className="field-label">Original text<textarea data-testid="diff-original-text" rows={9} className="field text-editor" value={left} maxLength={100000} onChange={e=>edit("left",e.target.value)}/></label>
   </div>
   <div>
    <label className="field-label" htmlFor="diff-revised-docx">Revised Word DOCX</label>
    <input id="diff-revised-docx" data-testid="diff-revised-docx" type="file" className="field" accept=".docx" onChange={e=>void importDocx("right",e)}/>
    {source.right&&<p data-testid="diff-revised-source" className="subtle">{source.right}</p>}
    <label className="field-label">Revised text<textarea data-testid="diff-revised-text" rows={9} className="field text-editor" value={right} maxLength={100000} onChange={e=>edit("right",e.target.value)}/></label>
   </div>
  </div>
  <div className="actions">
   <label className="field-label"><input type="checkbox" checked={ignoreWhitespace} onChange={e=>setIgnoreWhitespace(e.target.checked)}/> Ignore extra spaces</label>
   <label className="field-label"><input type="checkbox" checked={ignoreCase} onChange={e=>setIgnoreCase(e.target.checked)}/> Ignore case</label>
   <label className="field-label"><input type="checkbox" checked={changedOnly} onChange={e=>setChangedOnly(e.target.checked)}/> Show changed lines only</label>
  </div>
  {active&&<p role="status" data-testid="diff-importing" className="subtle">Reading DOCX locally… please review the extracted text when it appears.</p>}
  {!active&&analysis&&<>
   <p data-testid="docx-diff-summary" className="subtle">{analysis.identical?"Identical after options":"Different"} · Approx. {analysis.similarity}% textual overlap · +{analysis.additions} lines / −{analysis.deletions} lines</p>
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
    <button data-testid="diff-copy" className="secondary-button" type="button" onClick={()=>{void navigator.clipboard.writeText(unifiedDiff(analysis.lines)).then(()=>setStatus("Copied diff.")).catch(()=>setStatus("Clipboard unavailable. Select the text manually."));}}>Copy diff</button>
    <button data-testid="diff-save" className="primary-button" type="button" onClick={()=>{void save();}}>Save full diff</button>
   </div>
  </>}
  {!analysis&&!active&&<p role="status" className="subtle">Comparison limit: 100,000 characters per side.</p>}
  {status&&<p role="status" data-testid="diff-status" className="subtle">{status}</p>}
 </section>;
}
