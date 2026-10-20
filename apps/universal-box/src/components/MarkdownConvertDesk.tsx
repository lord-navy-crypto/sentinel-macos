import {useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {countWords,markdownToPlain,plainToMarkdown} from "../lib/textConvert";
export default function MarkdownConvertDesk(){
 const [mode,setMode]=useState<"to-plain"|"to-markdown">("to-plain");
 const [source,setSource]=useState("# Title\n\nHello **world** and a [link](https://example.com).");
 const [keepLinks,setKeepLinks]=useState(false);
 const [status,setStatus]=useState("");
 const output=useMemo(()=>mode==="to-plain"?markdownToPlain(source,keepLinks):plainToMarkdown(source),[mode,source,keepLinks]);
 const extension=mode==="to-plain"?"txt":"md";
 const save=async()=>{
  try{const ok=await exportFile("daily-desk-converted."+extension,output);setStatus(ok?"Exported locally.":"Save cancelled.");}
  catch(e){setStatus(String(e));}
 };
 return <section className="panel">
  <h3>Markdown ↔ plain text · 双向转换</h3>
  <p className="subtle">Matching the website's two-way workflow: convert, swap sides, copy or download without opening the website.</p>
  <div className="actions">
   <button type="button" className={mode==="to-plain"?"primary-button":"secondary-button"} onClick={()=>setMode("to-plain")}>Markdown → plain</button>
   <button type="button" className={mode==="to-markdown"?"primary-button":"secondary-button"} onClick={()=>setMode("to-markdown")}>Plain → Markdown</button>
   {mode==="to-plain"&&<label className="field-label"><input type="checkbox" checked={keepLinks} onChange={e=>setKeepLinks(e.target.checked)}/> Keep URLs after link text</label>}
  </div>
  <div className="tools-pair">
   <label className="field-label">Input<textarea className="field text-editor" rows={10} value={source} onChange={e=>setSource(e.target.value)} maxLength={200000}/></label>
   <label className="field-label">Output<textarea className="field text-editor" rows={10} value={output} readOnly /></label>
  </div>
  <p className="subtle">{countWords(source)} → {countWords(output)} words · {source.length} → {output.length} characters</p>
  <div className="actions">
   <button type="button" className="secondary-button" disabled={!output} onClick={()=>{setSource(output);setMode(mode==="to-plain"?"to-markdown":"to-plain");setStatus("Output is now input.");}}>Use output as input</button>
   <button type="button" className="secondary-button" disabled={!output} onClick={()=>{void navigator.clipboard.writeText(output).then(()=>setStatus("Copied.")).catch(()=>setStatus("Clipboard unavailable."));}}>Copy output</button>
   <button type="button" className="primary-button" disabled={!output} onClick={()=>{void save();}}>Save .{extension}</button>
  </div>
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}