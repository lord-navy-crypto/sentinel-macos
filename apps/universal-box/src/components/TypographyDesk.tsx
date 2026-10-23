import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {
 FONT_FAMILIES,DEFAULT_TYPOGRAPHY,typographyText,typographyToDocx,typographyToHtml,
 typographyToClipboardHtml,extractOwnHtmlText,
 type TypographyOptions,
} from "../lib/typographyInterop";
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function TypographyDesk(){
 const [source,setSource]=useState("");
 const [options,setOptions]=useState<TypographyOptions>(DEFAULT_TYPOGRAPHY);
 const [filename,setFilename]=useState("formatted-text");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const result=useMemo(()=>{
  try{return {value:typographyText(source,options),error:""};}
  catch(e){return {value:"",error:errorMessage(e)};}
 },[source,options]);
 function update<K extends keyof TypographyOptions>(key:K,value:TypographyOptions[K]){
  setOptions(old=>({...old,[key]:value}));setStatus("");
 }
 async function loadFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  try{
   const isOwnHtml=/\.html?$/iu.test(file.name);
   if(!/\.(txt|md|markdown|html?)$/iu.test(file.name)||
      file.size>(isOwnHtml?450_000:250_000)||file.size<1)
    throw Error("Select UTF-8 TXT/MD (≤250 KB) or Sentinel Box HTML (≤450 KB).");
   const decoded=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/u,"");
   const input=isOwnHtml?extractOwnHtmlText(decoded):decoded;
   if(input.length>100_000)throw Error("Imported text exceeds the character limit.");
   setSource(input);
   setStatus(isOwnHtml?"Reopened Sentinel Box HTML as plain text without executing markup. Choose new styles before exporting.":"Imported literal plain text. Markdown is not rendered or executed.");
  }catch(e){setStatus("Import failed: "+errorMessage(e));}
 }
 async function copy(){
  try{await navigator.clipboard.writeText(result.value);setStatus("Copied plain text to clipboard.");}
  catch{setStatus("Clipboard unavailable; select the visible text and copy manually.");}
 }
 async function copyFormatted(){
  try{
   if(typeof ClipboardItem==="undefined"||!navigator.clipboard?.write)
    throw Error("This system does not support copying rich HTML.");
   const html=typographyToClipboardHtml(source,options);
   const item=new ClipboardItem({
    "text/html":new Blob([html],{type:"text/html"}),
    "text/plain":new Blob([result.value],{type:"text/plain"}),
   });
   await navigator.clipboard.write([item]);
   setStatus("Copied formatted HTML and plain-text fallback. Paste into a compatible rich-text editor.");
  }catch(e){
   setStatus("Formatted copy unavailable: "+errorMessage(e)+
    " Use Save DOCX/HTML, or Copy text for plain-text applications.");
  }
 }
 async function save(format:"txt"|"html"|"docx"){
  if(result.error||busy)return;
  setBusy(true);setStatus("");
  try{
   const value=format==="txt"?result.value:
    format==="html"?typographyToHtml(source,options):
    await typographyToDocx(source,options);
   const safe=filename.trim().replace(/[^a-zA-Z0-9._-]+/gu,"-").replace(/^\.+/u,"").slice(0,60)||"formatted-text";
   const saved=await exportFile(safe+"."+format,value);
   setStatus(saved?
    "Saved "+format.toUpperCase()+" locally. "+(format==="txt"?
     "TXT cannot retain font settings.":"Style is declared; substituted fonts may appear if unavailable on the device."):
    "Save cancelled.");
  }catch(e){setStatus("Export failed: "+errorMessage(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="typography-desk">
  <h3>Typography & Symbols · 字体与特殊符号转换</h3>
  <p className="subtle">Paste text or explicitly import UTF-8 TXT/Markdown, or reopen HTML exported by this tool. Choose font, size and styling, then export an editable DOCX, styled offline HTML or plain TXT. No uploaded files, subscriptions, macros or remote fonts.</p>
  <label className="field-label" htmlFor="typography-file">Import UTF-8 TXT/MD or Sentinel Box HTML</label>
  <input className="field" id="typography-file" data-testid="typography-file"
    type="file" accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html" onChange={e=>{void loadFile(e);}}/>
  <label className="field-label" htmlFor="typography-input">Your original text (max 100,000 characters)</label>
  <textarea className="field text-editor" id="typography-input" data-testid="typography-input"
   rows={6} maxLength={100000} value={source}
   onChange={e=>{setSource(e.target.value);setStatus("");}}/>
  <div className="tools-pair">
   <label className="field-label">Font family
    <select className="field" data-testid="typography-font" value={options.font}
      onChange={e=>update("font",e.target.value as TypographyOptions["font"])}>
     {FONT_FAMILIES.map(name=><option value={name} key={name}>{name}</option>)}
    </select>
   </label>
   <label className="field-label">Font size (pt)
    <select className="field" data-testid="typography-size" value={options.sizePt}
     onChange={e=>update("sizePt",Number(e.target.value))}>
     {[8,9,10,11,12,13,14,16,18,20,24,28,32,36,48].map(n=><option key={n} value={n}>{n} pt</option>)}
    </select>
   </label>
   <label className="field-label">Alignment
    <select className="field" data-testid="typography-align" value={options.align}
     onChange={e=>update("align",e.target.value as TypographyOptions["align"])}>
     <option value="left">Left / 左对齐</option><option value="center">Center / 居中</option>
     <option value="right">Right / 右对齐</option>
    </select>
   </label>
  </div>
  <div className="actions">
   <label><input data-testid="typography-bold" type="checkbox" checked={options.bold}
     onChange={e=>update("bold",e.target.checked)}/> Bold / 粗体</label>
   <label><input data-testid="typography-italic" type="checkbox" checked={options.italic}
     onChange={e=>update("italic",e.target.checked)}/> Italic / 斜体</label>
   <label><input data-testid="typography-underline" type="checkbox" checked={options.underline}
     onChange={e=>update("underline",e.target.checked)}/> Underline / 下划线</label>
   <label><input data-testid="typography-ascii" type="checkbox" checked={options.asciiSymbols}
     onChange={e=>update("asciiSymbols",e.target.checked)}/> Special symbols → ASCII equivalents</label>
  </div>
  <p className="subtle">Optional symbol conversion: curly quotes → straight quotes, © → (c), ™ → (TM), arrows → ASCII arrows, ellipsis → ... and selected mathematical signs → descriptions. This changes characters and may lose mathematical meaning; off by default.</p>
  {result.error?<p className="subtle" role="alert" data-testid="typography-error">{result.error}</p>:<>
   <p className="subtle">Converted text preview — literal content only; never interpreted as HTML:</p>
   <div data-testid="typography-preview" className="panel" aria-label="Formatted text preview"
    style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",
     fontFamily:'"'+options.font+'",sans-serif',fontSize:options.sizePt+"pt",
     fontWeight:options.bold?"bold":"normal",fontStyle:options.italic?"italic":"normal",
     textDecoration:options.underline?"underline":"none",textAlign:options.align,
     minHeight:70,maxHeight:300,overflow:"auto"}}>
     {result.value}
   </div>
   <label className="field-label" htmlFor="typography-output">Selectable converted plain text</label>
   <textarea className="field text-editor" id="typography-output" data-testid="typography-output"
     readOnly rows={4} value={result.value.slice(0,20000)}/>
   {result.value.length>20000&&<p className="subtle">Preview shortened; exports contain the complete text.</p>}
   <label className="field-label" htmlFor="typography-name">Output base filename
    <input className="field" id="typography-name" value={filename} maxLength={70}
     onChange={e=>setFilename(e.target.value)}/>
   </label>
   <div className="actions">
    <button className="secondary-button" type="button" data-testid="typography-copy" disabled={busy}
      onClick={()=>{void copy();}}>Copy plain text</button>
    <button className="secondary-button" type="button" data-testid="typography-copy-rich" disabled={busy}
      onClick={()=>{void copyFormatted();}}>Copy with formatting</button>
    <button className="secondary-button" type="button" data-testid="typography-save-txt" disabled={busy}
      onClick={()=>{void save("txt");}}>Save TXT</button>
    <button className="secondary-button" type="button" data-testid="typography-save-html" disabled={busy}
      onClick={()=>{void save("html");}}>Save styled HTML</button>
    <button className="primary-button" type="button" data-testid="typography-save-docx" disabled={busy}
      onClick={()=>{void save("docx");}}>{busy?"Converting…":"Save editable DOCX"}</button>
   </div>
  </>}
  <p className="subtle">Compatibility: TXT does not store font or alignment; DOCX/HTML preserve specified style declarations but may substitute unavailable fonts. Imported Markdown is literal text; imported HTML must be generated by this tool, not an arbitrary webpage. Layout across Microsoft Word, Pages and browsers may differ. Originals stay unchanged.</p>
  {status&&<p className="subtle" role="status" data-testid="typography-status">{status}</p>}
 </section>;
}
