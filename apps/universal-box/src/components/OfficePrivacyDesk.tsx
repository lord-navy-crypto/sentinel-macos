import {type ChangeEvent,useMemo,useState} from "react";
import JSZip from "jszip";
import {exportFile} from "../lib/output";
import {mailMergeText,parseOfficeCsv,recordsToVcf} from "../lib/officePrivacy";
import {findDuplicateFiles,type DuplicateReport} from "../lib/fileDuplicates";
import {inspectUnicode} from "../lib/unicodeInspector";

export type OfficePrivacyMode="contacts"|"mail-merge"|"duplicates"|"unicode";
const tools:{id:OfficePrivacyMode;label:string}[]=[
 {id:"contacts",label:"CSV → Contacts · 通讯录"},
 {id:"mail-merge",label:"Mail Merge · 批量信函"},
 {id:"duplicates",label:"Duplicate Finder · 重复文件"},
 {id:"unicode",label:"Unicode Inspector · 隐藏字符"},
];
function friendlyError(e:unknown):string{return e instanceof Error?e.message:String(e);}
export default function OfficePrivacyDesk({initialMode="contacts"}:{initialMode?:OfficePrivacyMode}){
 const [mode,setMode]=useState<OfficePrivacyMode>(initialMode);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [csv,setCsv]=useState("Name,Phone,Email,Organization,Website\nAda Lovelace,+1 212 555 0100,ada@example.org,Mathematics,https://example.org\nGrace Hopper,+1 212 555 0200,grace@example.org,Computing,https://example.org");
 const [template,setTemplate]=useState("Hello {{Name}},\n\nThis is a sample letter for {{Organization}}.\n\nBest regards,\nUniversal Box");
 const [selectedFiles,setSelectedFiles]=useState<File[]>([]);
 const [duplicates,setDuplicates]=useState<DuplicateReport|null>(null);
 const [unicodeText,setUnicodeText]=useState("Hello\u200B world!\nR\u202Eesearch");
 const table=useMemo(()=>{
   try{return {value:parseOfficeCsv(csv),error:""};}
   catch(e){return {value:null,error:friendlyError(e)};}
 },[csv]);
 const contactData=useMemo(()=>{
   if(!table.value)return {value:null,error:table.error};
   try{return {value:recordsToVcf(table.value),error:""};}
   catch(e){return {value:null,error:friendlyError(e)};}
 },[table]);
 const mergeData=useMemo(()=>{
   if(!table.value)return {value:null,error:table.error};
   try{return {value:mailMergeText(table.value,template),error:""};}
   catch(e){return {value:null,error:friendlyError(e)};}
 },[table,template]);
 const unicode=useMemo(()=>{
   try{return {value:inspectUnicode(unicodeText),error:""};}
   catch(e){return {value:null,error:friendlyError(e)};}
 },[unicodeText]);
 async function importCsv(event:ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   if(!file)return;
   if(file.size>500_000){setStatus("Maximum CSV file is 500 KB.");return;}
   try{setCsv(await file.text());setStatus("Loaded local CSV. No file was uploaded.");}
   catch(e){setStatus("CSV import failed: "+friendlyError(e));}
 }
 async function saveContacts(){
   if(!contactData.value||busy)return;
   setBusy(true);setStatus("");
   try{
     const saved=await exportFile("universal-box-contacts.vcf",contactData.value.text);
     setStatus(saved?"Saved "+contactData.value.count+" vCard 3.0 contacts locally.":"Save cancelled.");
   }catch(e){setStatus("Contact export failed: "+friendlyError(e));}
   finally{setBusy(false);}
 }
 async function saveLetters(){
   if(!mergeData.value||busy)return;
   setBusy(true);setStatus("");
   try{
     const zip=new JSZip();
     for(const doc of mergeData.value)zip.file(doc.filename,doc.content);
     const output=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
     if(output.byteLength>20_000_000)throw Error("Generated ZIP exceeds the 20 MB output limit.");
     const saved=await exportFile("universal-box-mail-merge.zip",output);
     setStatus(saved?"Saved "+mergeData.value.length+" individual text letters. No emails were sent.":"Save cancelled.");
   }catch(e){setStatus("Mail merge failed: "+friendlyError(e));}
   finally{setBusy(false);}
 }
 function selectFiles(event:ChangeEvent<HTMLInputElement>){
   const files=[...(event.target.files??[])];event.target.value="";
   setSelectedFiles(files);setDuplicates(null);setStatus("");
 }
 async function scanDuplicates(){
   if(busy)return;
   setBusy(true);setStatus("");
   try{
     const result=await findDuplicateFiles(selectedFiles);
     setDuplicates(result);
     setStatus("Scanned locally with SHA-256. No files were modified or removed.");
   }catch(e){setDuplicates(null);setStatus("Scan failed: "+friendlyError(e));}
   finally{setBusy(false);}
 }
 async function copyText(value:string){
   try{await navigator.clipboard.writeText(value);setStatus("Copied locally.");}
   catch{setStatus("Clipboard unavailable. Select and copy manually.");}
 }
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX · OFFICE & PRIVACY</p>
   <h2>Office & Privacy / 免费办公与文件检查</h2>
   <p className="subtle">Local contact conversion, TXT mail merge, duplicate detection and Unicode inspection. No subscription, forced account, remote upload or background filesystem scanning.</p>
   <div className="pill-row" role="group" aria-label="Office and privacy tools">
     {tools.map(item=><button type="button" key={item.id} className={item.id===mode?"pill active-pill":"pill"} onClick={()=>{setMode(item.id);setStatus("");}}>{item.label}</button>)}
   </div>
   {(mode==="contacts"||mode==="mail-merge")&&<>
     <p className="subtle">Input must be CSV with a header row (up to 300 records / 30 columns). Commas and newlines in quoted CSV cells are supported. All personal information stays in your app and is only written to the destination you choose.</p>
     <label className="field-label" htmlFor="office-csv-import">Load CSV from disk (up to 500 KB)</label>
     <input id="office-csv-import" className="field" type="file" accept=".csv,text/csv" onChange={e=>{void importCsv(e);}}/>
     <label className="field-label" htmlFor="office-csv">Or paste a header + rows as CSV</label>
     <textarea id="office-csv" className="field text-editor" rows={8} maxLength={150000} value={csv} onChange={e=>{setCsv(e.target.value);setStatus("");}}/>
     {table.error?<p className="subtle" role="alert">{table.error}</p>:table.value&&<p className="subtle">{table.value.rows.length} rows · {table.value.headers.length} columns · headers: {table.value.headers.join(", ")}</p>}
   </>}
   {mode==="contacts"&&<>
     <p className="subtle">Recognized headers: Name/姓名 (required), Phone/电话, Email/邮箱, Organization/公司, Website/网址. Creates one standard vCard 3.0 (.vcf) contacts file, for importing into compatible address books. Unrecognized columns aren't exported. Review the destination before sharing personal information.</p>
     {contactData.error?<p className="subtle" role="alert">{contactData.error}</p>:contactData.value&&<>
       <p className="subtle">{contactData.value.count} contacts validated and ready for export.</p>
       <textarea className="field text-editor" aria-label="vCard output preview" rows={7} readOnly value={contactData.value.text.slice(0,5000)}/>
       {contactData.value.text.length>5000&&<p className="subtle">Preview truncated; download contains every record.</p>}
       <button className="primary-button" disabled={busy} type="button" onClick={()=>{void saveContacts();}}>{busy?"Saving…":"Save contacts.vcf"}</button>
     </>}
   </>}
   {mode==="mail-merge"&&<>
     <p className="subtle">Use exact column headers in double braces, for example <code>{"{{Name}}"}</code>. Creates one new UTF-8 TXT per record, in a ZIP. Maximum 100 letters per run. No automation sends mail; names and addresses are never used as ZIP paths.</p>
     <label className="field-label" htmlFor="office-template">Letter template</label>
     <textarea id="office-template" className="field text-editor" rows={8} maxLength={10000} value={template} onChange={e=>setTemplate(e.target.value)}/>
     {mergeData.error?<p className="subtle" role="alert">{mergeData.error}</p>:mergeData.value&&<>
       <p className="subtle">{mergeData.value.length} separate letters ready. First-letter preview:</p>
       <textarea className="field text-editor" aria-label="First generated letter preview" rows={7} readOnly value={mergeData.value[0]?.content??""}/>
       <button className="primary-button" type="button" disabled={busy} onClick={()=>{void saveLetters();}}>{busy?"Creating ZIP…":"Save letter ZIP"}</button>
     </>}
   </>}
   {mode==="duplicates"&&<>
     <p className="subtle">Select 2–30 local files (≤20 MB each, ≤80 MB combined). SHA-256 compares file *contents*, not only filenames. Matching checksums are strong evidence of identical bytes, not proof of publisher trust. Nothing is deleted. Browser file pickers reveal selected files, not entire folders.</p>
     <label className="field-label" htmlFor="duplicate-files">Select files to compare</label>
     <input id="duplicate-files" className="field" type="file" multiple onChange={selectFiles}/>
     <p className="subtle">{selectedFiles.length} files selected, {(selectedFiles.reduce((n,f)=>n+f.size,0)/1_000_000).toFixed(2)} MB.</p>
     <button className="primary-button" type="button" disabled={busy||selectedFiles.length<2||selectedFiles.length>30} onClick={()=>{void scanDuplicates();}}>{busy?"Hashing local files…":"Find duplicate contents"}</button>
     {duplicates&&<>
       <p className="subtle">{duplicates.scanned} files inspected · {duplicates.unique} distinct content groups · {duplicates.groups.length} duplicate groups.</p>
       {duplicates.groups.map(group=><div key={group.sha256} className="task-row">
         <div className="task-copy"><strong>{group.files.length} matching files</strong> · {group.size.toLocaleString()} bytes
           <p className="subtle">{group.files.map(file=>file.name).join(" · ")}</p>
           <p className="subtle">SHA-256: <code>{group.sha256}</code></p>
         </div>
       </div>)}
       {!duplicates.groups.length&&<p className="subtle">No identical hashes were found among the selected files.</p>}
       <button className="secondary-button" type="button" onClick={()=>{void exportFile("universal-box-duplicates.json",JSON.stringify(duplicates,null,2)).then(saved=>setStatus(saved?"Saved report.":"Save cancelled.")).catch(e=>setStatus(friendlyError(e)));}}>Save JSON report</button>
     </>}
   </>}
   {mode==="unicode"&&<>
     <p className="subtle">Inspect hidden spaces, directional overrides, formatting marks, and control characters without changing your text. These characters can be legitimate in languages, emoji and scientific notation; presence alone does not prove malicious intent. This is not a complete Unicode confusables or spoofing detector.</p>
     <label className="field-label" htmlFor="unicode-input">Text to inspect (max 50,000 UTF-16 code units)</label>
     <textarea id="unicode-input" className="field text-editor" rows={8} maxLength={50000} value={unicodeText} onChange={e=>setUnicodeText(e.target.value)}/>
     {unicode.error?<p className="subtle" role="alert">{unicode.error}</p>:unicode.value&&<>
       <p className="subtle">{unicode.value.length} special code points found. Indices refer to UTF-16 positions; line/column counts are for display.</p>
       <div style={{maxHeight:360,overflow:"auto"}}>
         <table style={{width:"100%"}}>
           <thead><tr><th scope="col">Position</th><th scope="col">Code point</th><th scope="col">Description</th><th scope="col">Type</th></tr></thead>
           <tbody>{unicode.value.slice(0,150).map((item,i)=><tr key={i}>
             <td>{item.line}:{item.column}</td><td><code>{item.codePoint}</code></td><td>{item.name}</td><td>{item.kind}</td>
           </tr>)}</tbody>
         </table>
       </div>
       {unicode.value.length>150&&<p className="subtle">Preview first 150 findings. Full export includes all.</p>}
       <div className="actions">
         <button className="secondary-button" type="button" onClick={()=>{void copyText(JSON.stringify(unicode.value,null,2));}}>Copy JSON</button>
         <button className="secondary-button" type="button" onClick={()=>{void exportFile("universal-box-unicode-findings.json",JSON.stringify(unicode.value,null,2)).then(saved=>setStatus(saved?"Saved report.":"Save cancelled.")).catch(e=>setStatus(friendlyError(e)));}}>Save report</button>
       </div>
     </>}
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
