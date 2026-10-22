import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {parseLocalVcf,vcfToCsv,VCF_MAX_BYTES,type VcfReport} from "../lib/localVcfImport";

function explanation(e:unknown):string{return e instanceof Error?e.message:String(e);}

export default function VcfToCsvDesk(){
 const [report,setReport]=useState<VcfReport|null>(null);
 const [filename,setFilename]=useState("");
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 async function importVcf(event:ChangeEvent<HTMLInputElement>){
  const items=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(!items.length||busy)return;
  if(items.length!==1){setStatus("Select one VCF file; prior validated contacts are preserved.");return;}
  const file=items[0];
  if(!/\.vcf$/iu.test(file.name)||file.size<24||file.size>VCF_MAX_BYTES){
   setStatus("Choose a .vcf file between 24 bytes and 500 KB; existing contacts remain.");return;
  }
  setBusy(true);setStatus("");
  try{
   const source=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   const parsed=parseLocalVcf(source,file.size);
   setReport(parsed);setFilename(file.name);
   setStatus("Read "+parsed.contacts.length+" UTF-8 vCard records locally. Your system address book was not accessed.");
  }catch(e){setStatus("VCF import failed; previously imported contacts remain: "+explanation(e));}
  finally{setBusy(false);}
 }
 async function saveCsv(){
  if(!report||busy)return;
  setBusy(true);setStatus("");
  try{
   const ok=await exportFile("sentinel-contacts-from-vcf.csv",vcfToCsv(report));
   setStatus(ok?"Saved "+report.contacts.length+" contacts as CSV. Source VCF was not modified.":
    "Save cancelled. Source VCF and preview remain unchanged.");
  }catch(e){setStatus("CSV export failed: "+explanation(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="vcf-import-desk">
  <h3>VCF → CSV · 离线联系人反向转换</h3>
  <p className="subtle">Complements the CSV → vCard converter above. Choose an existing UTF-8 vCard 3.0 or 4.0 file and preview names, phone numbers and emails before saving an Excel-compatible CSV. Files remain in this window's memory only; no address book permissions, website visits or uploads.</p>
  <label className="field-label">Choose one .vcf file (≤500 KB, ≤300 contacts)
   <input className="field" data-testid="vcf-import-file" type="file" accept=".vcf,text/vcard"
    disabled={busy} onChange={e=>void importVcf(e)}/>
  </label>
  {report&&<>
   <p className="subtle" data-testid="vcf-import-stats">{filename} · {report.contacts.length} contacts · vCard {report.versions.join(", ")} · {report.ignoredProperties} unsupported fields skipped</p>
   <p className="subtle">Name, phones, emails, organization, website and title are exported. Photos, keys, unknown properties and attached media are excluded. Multiple phone/email values are joined with " | ". The preview displays at most 12 contacts, but export contains every validated contact.</p>
   <div className="task-list" data-testid="vcf-import-preview">
    {report.contacts.slice(0,12).map((contact,i)=><div className="task-row" key={i}>
     <span className="task-copy">{i+1}. {contact.name} · {contact.phones.join(" | ")} · {contact.emails.join(" | ")} · {contact.organization}</span>
    </div>)}
   </div>
   <div className="actions">
    <button type="button" className="primary-button" data-testid="vcf-export-csv"
     disabled={busy} onClick={()=>void saveCsv()}>Export complete CSV</button>
    <button type="button" className="secondary-button" data-testid="vcf-clear"
     disabled={busy} onClick={()=>{setReport(null);setFilename("");setStatus("Imported VCF preview cleared; the original file is unchanged.");}}>Clear VCF preview</button>
   </div>
  </>}
  <p className="subtle">The CSV may contain private contact details. Review it before sending it anywhere. Legacy vCard 2.1, special encodings and photos are deliberately not supported.</p>
  {status&&<p role="status" className="subtle" data-testid="vcf-import-status">{status}</p>}
 </section>;
}
