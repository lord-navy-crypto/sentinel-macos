import {type ChangeEvent,useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {
  generatePassword,jsonRecordsToCsv,MEETING_ZONES,normalizeExpectedHash,sha256File,timeInZone,
  type PasswordConfig,
} from "../lib/universalTools";

export type UniversalMode="json-csv"|"timezones"|"checksum"|"password"|"image-privacy";
const modes:{id:UniversalMode;label:string}[]=[
  {id:"json-csv",label:"JSON → CSV"},
  {id:"timezones",label:"World Meeting Clock"},
  {id:"checksum",label:"SHA-256 Check"},
  {id:"password",label:"Password Generator"},
  {id:"image-privacy",label:"Image Metadata Cleaner"},
];
const safeFile=(name:string)=>name.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]/gu,"-").slice(0,70)||"clean-image";
export default function UniversalDesk({
  initialMode="json-csv",onOpenCsv,
}:{initialMode?:UniversalMode;onOpenCsv:()=>void}){
  const [mode,setMode]=useState<UniversalMode>(initialMode);
  const [status,setStatus]=useState("");
  const [json,setJson]=useState('[\n  {"name":"Ada","score":95},\n  {"name":"Bob","score":88}\n]');
  const [utc,setUtc]=useState("2026-10-19T12:00");
  const [file,setFile]=useState<File|null>(null);
  const [hash,setHash]=useState("");
  const [expected,setExpected]=useState("");
  const [hashBusy,setHashBusy]=useState(false);
  const [config,setConfig]=useState<PasswordConfig>({length:20,lowercase:true,uppercase:true,digits:true,symbols:true});
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [picture,setPicture]=useState<File|null>(null);
  const [imageFormat,setImageFormat]=useState<"png"|"jpeg"|"webp">("png");
  const [imageQuality,setImageQuality]=useState(.88);
  const [imageBusy,setImageBusy]=useState(false);
  const csv=useMemo(()=>{
    try{return {result:jsonRecordsToCsv(json),error:""};}
    catch(e){return {result:null,error:e instanceof Error?e.message:String(e)};}
  },[json]);
  const zoneTimes=useMemo(()=>{
    try{return {times:MEETING_ZONES.map(item=>({...item,time:timeInZone(utc,item.zone)})),error:""};}
    catch(e){return {times:[],error:e instanceof Error?e.message:String(e)};}
  },[utc]);
  function selectMode(next:UniversalMode){setMode(next);setStatus("");}
  async function copy(value:string){
    try{await navigator.clipboard.writeText(value);setStatus("Copied to clipboard.");}
    catch{setStatus("Clipboard unavailable; select and copy the result manually.");}
  }
  async function saveCsv(){
    if(!csv.result)return;
    try{
      const saved=await exportFile("daily-desk-json-records.csv",csv.result.csv);
      setStatus(saved?"Saved CSV locally.":"Save cancelled.");
    }catch(e){setStatus("Could not save CSV: "+String(e));}
  }
  async function hashSelected(){
    if(!file||hashBusy)return;
    setHashBusy(true);setHash("");setStatus("");
    try{
      if(file.size>20_000_000)throw new Error("20 MB input limit.");
      const value=await sha256File(await file.arrayBuffer());
      setHash(value);setStatus("Calculated SHA-256 locally. The file was not uploaded.");
    }catch(e){setStatus("Hash failed: "+String(e instanceof Error?e.message:e));}
    finally{setHashBusy(false);}
  }
  const match=useMemo(()=>{
    if(!hash||!expected.trim())return null;
    try{return normalizeExpectedHash(expected)===hash;}
    catch{return null;}
  },[hash,expected]);
  function updateConfig<K extends keyof PasswordConfig>(key:K,value:PasswordConfig[K]){
    setConfig(c=>({...c,[key]:value}));setPassword("");setStatus("");
  }
  function createPassword(){
    try{setPassword(generatePassword(config));setShowPassword(false);setStatus("Generated using the operating system's cryptographic random source. Not stored by Daily Desk.");}
    catch(e){setPassword("");setStatus("Unable to generate: "+String(e instanceof Error?e.message:e));}
  }
  function pickPicture(event:ChangeEvent<HTMLInputElement>){
    setPicture(event.target.files?.[0]??null);setStatus("");
    event.target.value="";
  }
  async function cleanPicture(){
    if(!picture||imageBusy)return;
    setImageBusy(true);setStatus("");
    let url="";
    try{
      if(picture.size<1||picture.size>8_000_000)throw new Error("Image must be between 1 byte and 8 MB.");
      if(!/\.(png|jpe?g|webp)$/iu.test(picture.name))throw new Error("Only PNG, JPEG and WebP are supported.");
      url=URL.createObjectURL(picture);
      const img=new Image();
      await new Promise<void>((resolve,reject)=>{
        img.onload=()=>resolve();
        img.onerror=()=>reject(new Error("Cannot decode this picture."));
        img.src=url;
      });
      const w=img.naturalWidth,h=img.naturalHeight;
      if(w<1||h<1||w*h>20_000_000)throw new Error("Image exceeds 20 million pixels.");
      const canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("Canvas is unavailable.");
      if(imageFormat==="jpeg"){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);}
      ctx.drawImage(img,0,0,w,h);
      const mime=imageFormat==="jpeg"?"image/jpeg":imageFormat==="webp"?"image/webp":"image/png";
      const blob=await new Promise<Blob>((resolve,reject)=>
        canvas.toBlob(out=>out?resolve(out):reject(new Error("Failed to encode output.")),mime,imageQuality));
      if(blob.type!==mime)throw new Error("This WebView does not support the chosen image format.");
      if(blob.size>20_000_000)throw new Error("Output exceeds the 20 MB export limit.");
      const ext=imageFormat==="jpeg"?"jpg":imageFormat;
      const saved=await exportFile(safeFile(picture.name)+"-pixels-only."+ext,new Uint8Array(await blob.arrayBuffer()));
      setStatus(saved?"Saved a newly encoded image. Common source EXIF/GPS metadata is normally omitted; inspect output if privacy is critical.":"Save cancelled.");
      canvas.width=0;canvas.height=0;
    }catch(e){setStatus("Image cleaning failed: "+String(e instanceof Error?e.message:e));}
    finally{if(url)URL.revokeObjectURL(url);setImageBusy(false);}
  }
  return <section className="panel">
    <p className="eyebrow">UNIVERSAL TOOLBOX · LOCAL-FIRST</p>
    <h2>Office, study & privacy tools / 综合小工具</h2>
    <p className="subtle">Five independent tools, with no accounts, subscriptions, online API calls or automatic clipboard/file access. Results are only exported when you choose to save.</p>
    <div className="pill-row" role="group" aria-label="Universal toolbox mode">
      {modes.map(item=><button key={item.id} type="button" className={mode===item.id?"pill active-pill":"pill"} onClick={()=>selectMode(item.id)}>{item.label}</button>)}
    </div>
    {mode==="json-csv"&&<>
      <p className="subtle">Convert JSON arrays of flat objects into spreadsheet-friendly CSV, with quoted fields and CSV formula-injection protection. Nested objects/arrays are intentionally rejected.</p>
      <label className="field-label" htmlFor="json-csv-source">JSON records · up to 2 MB, 2,000 rows, 100 columns</label>
      <textarea id="json-csv-source" className="field text-editor" rows={8} maxLength={2000000} value={json} onChange={e=>setJson(e.target.value)}/>
      {csv.error?<p role="alert" className="subtle">{csv.error}</p>:csv.result&&<>
        <p className="stat-pill">{csv.result.rows} records · {csv.result.columns} columns</p>
        <label className="field-label" htmlFor="json-csv-preview">CSV preview (first 10,000 characters)</label>
        <textarea id="json-csv-preview" className="field text-editor" rows={7} readOnly value={csv.result.csv.slice(0,10000)}/>
        <div className="actions">
          <button className="primary-button" type="button" onClick={()=>{void saveCsv();}}>Save CSV</button>
          <button className="secondary-button" type="button" onClick={()=>{void copy(csv.result!.csv);}}>Copy CSV</button>
        </div>
      </>}
      <button className="secondary-button" type="button" onClick={onOpenCsv}>Already have CSV? Open CSV Table Desk → JSON</button>
    </>}
    {mode==="timezones"&&<>
      <p className="subtle">Pick a single reference time in <strong>UTC</strong>, then compare the corresponding clock times worldwide. Historical and future daylight saving rules are taken from your device's timezone database.</p>
      <label className="field-label" htmlFor="meeting-utc">Reference date and time in UTC (not your current local timezone)</label>
      <input id="meeting-utc" type="datetime-local" className="field" value={utc} onChange={e=>setUtc(e.target.value)}/>
      {zoneTimes.error?<p role="alert" className="subtle">{zoneTimes.error}</p>:
        <div style={{overflowX:"auto",marginTop:16}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr><th scope="col" style={{textAlign:"left",padding:10}}>City / zone</th><th scope="col" style={{textAlign:"left",padding:10}}>Local time</th></tr></thead>
            <tbody>{zoneTimes.times.map(item=><tr key={item.zone}>
              <td style={{padding:10,borderTop:"1px solid #dfe5ee"}}>{item.name}</td>
              <td style={{padding:10,borderTop:"1px solid #dfe5ee"}}>{item.time}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="subtle">This converter does not guess ambiguous times during clock changes: input uses UTC. Device timezone databases can change when governments update their rules.</p>
    </>}
    {mode==="checksum"&&<>
      <p className="subtle">Verify a downloaded file against a trusted SHA-256 checksum. No uploads and no background scanning. A matching hash confirms byte identity, but does not prove the publisher is trustworthy.</p>
      <label className="field-label" htmlFor="hash-file">Choose a local file (1 byte–20 MB)</label>
      <input id="hash-file" className="field" type="file" onChange={e=>{setFile(e.target.files?.[0]??null);setHash("");setStatus("");}}/>
      {file&&<p className="subtle">{file.name} · {file.size.toLocaleString()} bytes</p>}
      <div className="actions">
        <button className="primary-button" type="button" disabled={!file||hashBusy||file.size>20_000_000} onClick={()=>{void hashSelected();}}>{hashBusy?"Hashing…":"Calculate SHA-256"}</button>
        {hash&&<button className="secondary-button" type="button" onClick={()=>{void copy(hash);}}>Copy hash</button>}
      </div>
      {hash&&<textarea className="field text-editor" aria-label="Calculated SHA-256" value={hash} readOnly rows={2}/>}
      <label className="field-label" htmlFor="expected-hash">Optional published SHA-256 hash</label>
      <input id="expected-hash" className="field" style={{width:"100%"}} value={expected} onChange={e=>setExpected(e.target.value)} placeholder="Paste 64 hexadecimal characters"/>
      {hash&&expected.trim()&&<p role="status" className="stat-pill">{match===null?"Check hash format (64 hexadecimal characters)":match?"Checksums match":"Checksums do not match — verify the source and file"}</p>}
    </>}
    {mode==="password"&&<>
      <p className="subtle">Generate random passwords using the system cryptographic random source. No account or network service, and passwords are not saved to your Daily Desk workspace.</p>
      <div className="tools-pair">
        <label className="field-label">Password length (8–64)
          <input type="number" min={8} max={64} step={1} className="field" value={config.length} onChange={e=>updateConfig("length",Number(e.target.value))}/>
        </label>
      </div>
      <div className="actions">
        {([["lowercase","Lowercase a–z"],["uppercase","Uppercase A–Z"],["digits","Digits 2–9"],["symbols","Symbols"]] as const).map(([key,label])=>
          <label key={key}><input type="checkbox" checked={config[key]} onChange={e=>updateConfig(key,e.target.checked)}/> {label}</label>)}
      </div>
      <button className="primary-button" type="button" onClick={createPassword}>Generate secure password</button>
      {password&&<>
        <div className="tools-pair">
          <label className="field-label">Generated password (not stored)
            <input className="field" type={showPassword?"text":"password"} readOnly value={password}/>
          </label>
        </div>
        <div className="actions">
          <label><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/> Show password</label>
          <button className="secondary-button" type="button" onClick={()=>{void copy(password);}}>Copy password</button>
          <button className="secondary-button" type="button" onClick={()=>{setPassword("");setShowPassword(false);}}>Clear</button>
        </div>
      </>}
      <p className="subtle">For account security, use a reputable password manager to store generated passwords, and enable multi-factor authentication where available.</p>
    </>}
    {mode==="image-privacy"&&<>
      <p className="subtle">Re-encode a photo from decoded pixels into a new image. This normally removes source EXIF/GPS/comments but may also change orientation, colour profiles, transparency or image quality. It does not certify that every possible metadata field is absent.</p>
      <label className="field-label" htmlFor="privacy-image">PNG, JPEG or WebP · maximum 8 MB / 20 million pixels</label>
      <input id="privacy-image" className="field" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={pickPicture}/>
      {picture&&<p className="subtle">{picture.name} · {(picture.size/1024).toFixed(1)} KB</p>}
      <div className="tools-pair">
        <label className="field-label">Output format
          <select className="field" value={imageFormat} onChange={e=>setImageFormat(e.target.value as typeof imageFormat)}>
            <option value="png">PNG (preserve transparency)</option>
            <option value="jpeg">JPEG (white background)</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        {imageFormat!=="png"&&<label className="field-label">Quality · {Math.round(imageQuality*100)}%
          <input type="range" min=".5" max="1" step=".05" value={imageQuality} onChange={e=>setImageQuality(Number(e.target.value))}/>
        </label>}
      </div>
      <button className="primary-button" type="button" disabled={!picture||imageBusy} onClick={()=>{void cleanPicture();}}>{imageBusy?"Re-encoding locally…":"Save re-encoded image"}</button>
      <p className="subtle">The original photo stays unchanged. For sensitive use, verify exported EXIF and GPS fields with a separate metadata inspector.</p>
    </>}
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
