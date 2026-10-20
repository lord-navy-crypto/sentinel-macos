import {useMemo,useState} from "react";
import QRCode from "qrcode";
import JSZip from "jszip";
import {exportFile} from "../lib/output";
import {
  type WifiConfig,type ContactConfig,bulkQrRows,contactQrPayload,generateUuidList,
  makeIcsEvent,staticTextQrPayload,wifiQrPayload,
} from "../lib/universalBox";

export type UniversalBoxMode="qr"|"calendar"|"uuid";
const PNG_SIZE=640;
const MAX_QR_ZIP_BYTES=18_000_000;
function safeDateFilename(title:string):string{
 return title.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,60)||"meeting";
}
export default function UniversalBoxDesk({initialMode="qr"}:{initialMode?:UniversalBoxMode}){
 const [mode,setMode]=useState<UniversalBoxMode>(initialMode);
 const [qrKind,setQrKind]=useState<"text"|"wifi"|"contact"|"batch">("text");
 const [text,setText]=useState("https://example.org/");
 const [wifi,setWifi]=useState<WifiConfig>({ssid:"Library-Guest",password:"",security:"nopass",hidden:false});
 const [contact,setContact]=useState<ContactConfig>({name:"Ada Lovelace",phone:"",email:"",organization:"",url:""});
 const [batch,setBatch]=useState("Course notes | https://example.org/course\nClass homepage | https://example.org/class");
 const [foreground,setForeground]=useState("#12263a");
 const [background,setBackground]=useState("#ffffff");
 const [margin,setMargin]=useState(4);
 const [preview,setPreview]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [eventTitle,setEventTitle]=useState("Study group");
 const [eventLocation,setEventLocation]=useState("");
 const [eventNote,setEventNote]=useState("");
 const [eventStart,setEventStart]=useState("2026-10-19T12:00");
 const [eventEnd,setEventEnd]=useState("2026-10-19T13:00");
 const [uuidCount,setUuidCount]=useState(5);
 const [uuids,setUuids]=useState<string[]>([]);
 const payload=useMemo(()=>{
   try{
     const value=qrKind==="wifi"?wifiQrPayload(wifi):
       qrKind==="contact"?contactQrPayload(contact):
       qrKind==="text"?staticTextQrPayload(text):"";
     return {text:value,error:""};
   }catch(error){return {text:"",error:String(error instanceof Error?error.message:error)};}
 },[qrKind,wifi,contact,text]);
 const batches=useMemo(()=>{
   try{return {data:bulkQrRows(batch),error:""};}
   catch(error){return {data:[],error:String(error instanceof Error?error.message:error)};}
 },[batch]);
 const qrOptions={width:PNG_SIZE,margin,color:{dark:foreground,light:background},errorCorrectionLevel:"M" as const};
 async function generatePreview(){
   if(!payload.text)return;
   setBusy(true);setStatus("");
   try{
     const output=await QRCode.toDataURL(payload.text,qrOptions);
     setPreview(output);setStatus("Static QR code generated on-device. No server, tracking or subscription.");
   }catch(error){setPreview("");setStatus("QR creation failed: "+String(error));}
   finally{setBusy(false);}
 }
 async function saveQr(format:"png"|"svg"){
   if(!payload.text)return;
   setBusy(true);setStatus("");
   try{
     if(format==="png"){
       const data=await QRCode.toDataURL(payload.text,qrOptions);
       const b64=data.split(",")[1];
       const bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));
       const ok=await exportFile("daily-desk-static-qr.png",bytes);
       setStatus(ok?"QR PNG saved.":"Save cancelled.");
     }else{
       const svg=await QRCode.toString(payload.text,{type:"svg",margin,color:{dark:foreground,light:background},errorCorrectionLevel:"M"});
       const ok=await exportFile("daily-desk-static-qr.svg",svg);
       setStatus(ok?"Scalable QR SVG saved.":"Save cancelled.");
     }
   }catch(error){setStatus("Save failed: "+String(error));}
   finally{setBusy(false);}
 }
 async function saveBatch(){
   if(!batches.data.length||busy)return;
   setBusy(true);setStatus("");
   try{
     const zip=new JSZip();
     let total=0;
     for(const item of batches.data){
       const svg=await QRCode.toString(item.text,{type:"svg",margin,color:{dark:foreground,light:background},errorCorrectionLevel:"M"});
       const bytes=new TextEncoder().encode(svg);
       total+=bytes.length;
       if(total>MAX_QR_ZIP_BYTES)throw new Error("Batch exceeds 18 MB of SVG data.");
       zip.file(item.name+".svg",bytes);
     }
     const output=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:4}});
     const saved=await exportFile("daily-desk-static-qr-batch.zip",output);
     setStatus(saved?"Saved "+batches.data.length+" QR SVG files, no server or tracking.":"Save cancelled.");
   }catch(error){setStatus("Batch creation failed: "+String(error));}
   finally{setBusy(false);}
 }
 async function saveMeeting(){
   try{
     const uuid=crypto.randomUUID();
     const content=makeIcsEvent({summary:eventTitle,location:eventLocation,description:eventNote,
       start:eventStart,end:eventEnd,uid:uuid+"@daily-desk.local"});
     const saved=await exportFile(safeDateFilename(eventTitle)+".ics",content);
     setStatus(saved?"Saved an offline .ics event. Import it into your calendar app; no invitations were sent.":"Save cancelled.");
   }catch(error){setStatus("Calendar file failed: "+String(error));}
 }
 function createIds(){
   try{setUuids(generateUuidList(uuidCount));setStatus("Generated cryptographically random UUID v4 identifiers locally.");}
   catch(error){setStatus("UUID creation failed: "+String(error));}
 }
 async function copy(content:string){
   try{await navigator.clipboard.writeText(content);setStatus("Copied to clipboard.");}
   catch{setStatus("Clipboard access unavailable; select the text and copy manually.");}
 }
 const adjustWifi=(key:keyof WifiConfig,value:WifiConfig[keyof WifiConfig])=>{setWifi(s=>({...s,[key]:value}));setPreview("");};
 const adjustContact=(key:keyof ContactConfig,value:ContactConfig[keyof ContactConfig])=>{setContact(s=>({...s,[key]:value}));setPreview("");};
 return <section className="panel">
   <p className="eyebrow">UNIVERSAL BOX · FREE LOCAL GENERATORS</p>
   <h2>Universal Box / 万用工具箱</h2>
   <p className="subtle">Batch QR codes, personal contact/Wi-Fi QR, calendar event files and development IDs. No paid service, login, analytics or upload. Works offline.</p>
   <div className="pill-row" role="group" aria-label="Universal Box generator">
     {([["qr","QR Studio · 二维码"],["calendar","Calendar .ics · 日历"],["uuid","UUID Generator · 唯一标识"]] as const).map(([key,label])=>
       <button type="button" key={key} className={mode===key?"pill active-pill":"pill"} onClick={()=>{setMode(key);setStatus("");}}>{label}</button>)}
   </div>
   {mode==="qr"&&<>
     <p className="subtle">Static QR codes directly encode their contents and don't rely on a hosted redirect service. Printed links will only work while their actual destinations exist. Avoid sharing sensitive Wi-Fi credentials in public QR codes.</p>
     <div className="pill-row compact" role="group" aria-label="QR content type">
       {([["text","Text or URL"],["wifi","Wi-Fi network"],["contact","vCard contact"],["batch","Batch ZIP"]] as const).map(([key,label])=>
         <button type="button" key={key} className={qrKind===key?"pill active-pill":"pill"} onClick={()=>{setQrKind(key);setPreview("");setStatus("");}}>{label}</button>)}
     </div>
     {qrKind==="text"&&<label className="field-label">Static text or URL (max 1,800 characters)
       <textarea className="field text-editor" rows={4} maxLength={1800} value={text} onChange={e=>{setText(e.target.value);setPreview("");}}/>
     </label>}
     {qrKind==="wifi"&&<>
       <div className="tools-pair">
         <label className="field-label">Network name (SSID)
           <input className="field" value={wifi.ssid} maxLength={64} onChange={e=>adjustWifi("ssid",e.target.value)}/>
         </label>
         <label className="field-label">Security type
           <select className="field" value={wifi.security} onChange={e=>adjustWifi("security",e.target.value as WifiConfig["security"])}>
             <option value="WPA">WPA/WPA2/WPA3 personal</option>
             <option value="WEP">Legacy WEP</option>
             <option value="nopass">Open network (no password)</option>
           </select>
         </label>
       </div>
       {wifi.security!=="nopass"&&<label className="field-label">Wi-Fi password
         <input className="field" type="password" maxLength={128} value={wifi.password} onChange={e=>adjustWifi("password",e.target.value)}/>
       </label>}
       <label><input type="checkbox" checked={wifi.hidden} onChange={e=>adjustWifi("hidden",e.target.checked)}/> Hidden SSID</label>
       <p className="subtle">Wi-Fi QR codes contain the network name and, for secured networks, the plaintext password. Only share with people authorized to join your network.</p>
     </>}
     {qrKind==="contact"&&<div className="tools-pair">
       {([["name","Display name"],["phone","Phone"],["email","Email"],["organization","Organization"],["url","Website"]] as const).map(([key,label])=>
         <label className="field-label" key={key}>{label}
           <input className="field" value={contact[key]} maxLength={key==="url"?500:120} onChange={e=>adjustContact(key,e.target.value)}/>
         </label>)}
     </div>}
     {qrKind==="batch"?<>
       <p className="subtle">Each line: <code>File label | URL or text</code>. Maximum 40 codes per ZIP. Similar names are numbered automatically. Generates vector SVG codes; no external QR API.</p>
       <label className="field-label">Batch QR input
         <textarea className="field text-editor" rows={7} maxLength={35000} value={batch} onChange={e=>setBatch(e.target.value)}/>
       </label>
       {batches.error?<p className="subtle" role="alert">{batches.error}</p>:<p className="subtle">{batches.data.length} valid entries.</p>}
     </>:null}
     <div className="tools-pair">
       <label className="field-label">QR foreground <input className="field" type="color" value={foreground} onChange={e=>{setForeground(e.target.value);setPreview("");}}/></label>
       <label className="field-label">QR background <input className="field" type="color" value={background} onChange={e=>{setBackground(e.target.value);setPreview("");}}/></label>
       <label className="field-label">Quiet margin · {margin} modules
         <input type="range" min={2} max={8} step={1} value={margin} onChange={e=>{setMargin(Number(e.target.value));setPreview("");}}/>
       </label>
     </div>
     <p className="subtle">For reliable scans, maintain strong colour contrast and an adequate quiet margin. Test printed QR codes with more than one scanner.</p>
     {qrKind==="batch"?<button className="primary-button" type="button" disabled={busy||!!batches.error} onClick={()=>{void saveBatch();}}>{busy?"Generating ZIP…":"Generate and save batch SVG ZIP"}</button>:
       <>
         {payload.error&&<p role="alert" className="subtle">{payload.error}</p>}
         <div className="actions">
           <button className="primary-button" type="button" disabled={busy||!!payload.error} onClick={()=>{void generatePreview();}}>Generate preview</button>
           <button className="secondary-button" type="button" disabled={busy||!!payload.error} onClick={()=>{void saveQr("png");}}>Save QR PNG</button>
           <button className="secondary-button" type="button" disabled={busy||!!payload.error} onClick={()=>{void saveQr("svg");}}>Save QR SVG</button>
         </div>
         {preview&&<img src={preview} alt="Locally generated static QR code preview" width={240} height={240}/>}
       </>}
   </>}
   {mode==="calendar"&&<>
     <p className="subtle">Generate a standard calendar .ics file locally. Dates and times below are explicitly in UTC; you can then import it into Apple Calendar, Outlook or another calendar application. This tool does not send emails or book meetings.</p>
     <label className="field-label">Event title <input className="field" style={{width:"100%"}} value={eventTitle} maxLength={120} onChange={e=>setEventTitle(e.target.value)}/></label>
     <div className="tools-pair">
       <label className="field-label">Start (UTC) <input className="field" type="datetime-local" value={eventStart} onChange={e=>setEventStart(e.target.value)}/></label>
       <label className="field-label">End (UTC) <input className="field" type="datetime-local" value={eventEnd} onChange={e=>setEventEnd(e.target.value)}/></label>
       <label className="field-label">Location <input className="field" maxLength={300} value={eventLocation} onChange={e=>setEventLocation(e.target.value)}/></label>
     </div>
     <label className="field-label">Event notes <textarea className="field text-editor" rows={4} maxLength={2000} value={eventNote} onChange={e=>setEventNote(e.target.value)}/></label>
     <button className="primary-button" type="button" onClick={()=>{void saveMeeting();}}>Generate & save .ics</button>
   </>}
   {mode==="uuid"&&<>
     <p className="subtle">Generate independent random UUID v4 IDs on-device. Useful for coding, testing, spreadsheets and unique filenames. UUIDs are not passwords or authentication tokens.</p>
     <label className="field-label">Number of UUIDs (1–100)
       <input className="field" type="number" min={1} max={100} step={1} value={uuidCount} onChange={e=>{setUuidCount(Number(e.target.value));setUuids([]);}}/>
     </label>
     <div className="actions">
       <button className="primary-button" type="button" onClick={createIds}>Generate UUIDs</button>
       {uuids.length>0&&<button className="secondary-button" type="button" onClick={()=>{void copy(uuids.join("\n"));}}>Copy IDs</button>}
       {uuids.length>0&&<button className="secondary-button" type="button" onClick={()=>{void exportFile("universal-box-uuids.txt",uuids.join("\n")).then(ok=>setStatus(ok?"Saved UUIDs.":"Save cancelled.")).catch(e=>setStatus(String(e)));}}>Save TXT</button>}
     </div>
     {uuids.length>0&&<textarea className="field text-editor" aria-label="Generated UUIDs" rows={Math.min(12,uuids.length)} value={uuids.join("\n")} readOnly/>}
   </>}
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
