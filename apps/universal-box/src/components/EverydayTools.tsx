import { useMemo, useState } from "react";
import QRCode from "qrcode";
import JSZip from "jszip";
import { exportFile } from "../lib/output";
import {fileNameManifest} from "../lib/quickBatchText";
import TextCompareDesk from "./TextCompareDesk";
import MarkdownConvertDesk from "./MarkdownConvertDesk";

export type Utility = "json" | "stats" | "csv" | "diff" | "markdown" | "encode" | "groups" | "color" | "qr" | "rename";
export const UTILITIES: { id: Utility; title: string; description: string }[] = [
  { id: "json", title: "JSON formatter", description: "Validate, pretty print or minify JSON." },
  { id: "stats", title: "Word count & reading time", description: "Words, characters, paragraphs, sentences, reading time." },
  { id: "csv", title: "CSV → Markdown", description: "Convert correctly quoted CSV/TSV into a Markdown table." },
  { id: "diff", title: "Text comparator", description: "Aligned line differences, highlighted words and similarity." },
  { id: "markdown", title: "Markdown ↔ plain text", description: "Two-way conversion, links, copy, swap and export." },
  { id: "encode", title: "Base64 / URL encoding", description: "Encode and decode UTF-8 text and URLs." },
  { id: "groups", title: "Random groups", description: "Pick one name or shuffle a list into groups." },
  { id: "color", title: "Color contrast", description: "Calculate WCAG contrast and AA text guidance." },
  { id: "qr", title: "QR generator", description: "Turn text or a URL into a PNG." },
  { id: "rename", title: "Batch rename copies", description: "Preview and export renamed file copies one by one." },
];

export function csvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i], n = input[i+1];
    if (quoted) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { cells.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && n === "\n") i++;
      cells.push(cell); cell = "";
      if (cells.some(x => x.trim())) rows.push(cells);
      cells = [];
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unmatched quoted field");
  cells.push(cell);
  if (cells.some(x => x.trim())) rows.push(cells);
  if (rows.length > 2000) throw new Error("CSV exceeds the 2,000-row preview limit. No rows were silently dropped.");
  return rows;
}

export function markdownTable(rows: string[][], hasHeader = true): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map(row => row.length));
  if (width > 100) throw new Error("Too many CSV columns");
  const escapeCell = (value: string) => value.trim().replace(/\|/gu, "\\|").replace(/\r?\n/gu," ");
  const norm = rows.map(r => Array.from({length:width}, (_,i) => escapeCell(r[i] || "")));
  const header = hasHeader ? norm[0] : Array.from({length:width}, (_,i)=>"Column "+(i+1));
  const body = hasHeader ? norm.slice(1) : norm;
  return [
    "| "+header.join(" | ")+" |",
    "| "+header.map(()=>"---").join(" | ")+" |",
    ...body.map(r=>"| "+r.join(" | ")+" |")
  ].join("\n");
}

function markdownPlain(text: string): string {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/gu,"$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu,"$1")
    .replace(/^\s{0,3}#{1,6}\s+/gmu,"")
    .replace(/^\s*>\s?/gmu,"")
    .replace(/^\s*[-*+]\s+/gmu,"")
    .replace(/\*\*([^*]+)\*\*/gu,"$1")
    .replace(/__([^_]+)__/gu,"$1")
    .replace(/\*([^*]+)\*/gu,"$1")
    .replace(/`([^`]+)`/gu,"$1");
}

function channel(hex: string) {
  const n = parseInt(hex, 16) / 255;
  return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const clean = hex.replace("#","");
  return .2126*channel(clean.slice(0,2)) + .7152*channel(clean.slice(2,4)) + .0722*channel(clean.slice(4,6));
}
function ratio(a: string,b: string) {
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function shuffle<T>(values: T[]): T[] {
  const items = [...values];
  for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
  return items;
}
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let raw = "";
  for(const b of bytes)raw+=String.fromCharCode(b);
  return btoa(raw);
}
function fromBase64(value: string): string {
  const raw=atob(value.replace(/\s/gu,""));
  return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
}

export default function EverydayTools({ initial = "stats" }: { initial?: Utility }) {
  const [tab,setTab] = useState<Utility>(initial);
  const [input,setInput] = useState("");
  const [other,setOther] = useState("");
  const [output,setOutput] = useState("");
  const [status,setStatus] = useState("");
  const [delimiter,setDelimiter] = useState<"," | "\t">(",");
  const [header,setHeader] = useState(true);
  const [codec,setCodec] = useState<"base64"|"url">("base64");
  const [groupSize,setGroupSize] = useState(3);
  const [foreground,setForeground] = useState("#233654");
  const [background,setBackground] = useState("#ffffff");
  const [qrData,setQrData] = useState("");
  const [files,setFiles] = useState<File[]>([]);
  const [prefix,setPrefix] = useState("study-");
  const [find,setFind] = useState("");
  const [replace,setReplace] = useState("");
  const [start,setStart] = useState(1);
  const [renameBusy,setRenameBusy] = useState(false);

  const stats = useMemo(() => {
    const words=input.trim()?input.trim().split(/\s+/u).length:0;
    const sentences=(input.match(/[.!?。！？]+/gu)??[]).length;
    const paragraphs=input.trim()?input.trim().split(/\n\s*\n/u).length:0;
    return {words,sentences,paragraphs,characters:input.length,lines:input?input.split(/\r?\n/u).length:0,reading:Math.ceil(words/200)};
  },[input]);
  const renamed=files.map((file,i)=>{
    const extIndex=file.name.lastIndexOf(".");
    const ext=extIndex>0?file.name.slice(extIndex):"";
    const base=extIndex>0?file.name.slice(0,extIndex):file.name;
    const filename=(prefix+(find ? base.split(find).join(replace) : base)+"-"+String(start+i).padStart(2,"0")+ext)
      .replace(/[\\/:*?"<>|]/gu,"-").slice(0,130);
    return {file,filename};
  });

  function compute() {
    try {
      if(tab==="json") setOutput(JSON.stringify(JSON.parse(input) as unknown,null,2));
      else if(tab==="csv") setOutput(markdownTable(csvRows(input,delimiter),header));
      else if(tab==="diff") {
        const left=input.split(/\r?\n/u),right=other.split(/\r?\n/u);
        const lines=Array.from({length:Math.max(left.length,right.length)},(_,i)=>{
          if(left[i]===right[i])return "  "+(left[i]??"");
          return (left[i]===undefined?"":"- "+left[i]+"\n")+(right[i]===undefined?"":"+ "+right[i]);
        });
        setOutput(lines.join("\n"));
      }
      else if(tab==="markdown")setOutput(markdownPlain(input));
      else if(tab==="encode")setOutput(codec==="url"?encodeURIComponent(input):base64Utf8(input));
      else if(tab==="groups") {
        const names=shuffle(input.split(/\r?\n|,/u).map(s=>s.trim()).filter(Boolean));
        if(names.length>300)throw new Error("Up to 300 names are supported");
        setOutput(names.length ? names.reduce<string[]>((acc,name,index)=>{
          const g=Math.floor(index/groupSize);acc[g]=(acc[g]??"Group "+(g+1)+": ")+(index%groupSize===0?"":", ")+name;return acc;
        },[]).join("\n") : "");
      }
      setStatus("");
    }catch(error){setStatus(error instanceof Error?error.message:String(error));}
  }
  async function makeQr() {
    try {
      if(!input.trim())throw new Error("Enter text or a URL first");
      if(input.length>1800)throw new Error("QR content is too long");
      const uri=await QRCode.toDataURL(input,{errorCorrectionLevel:"M",width:400,margin:2});
      setQrData(uri);
      setStatus("");
    }catch(error){setStatus(error instanceof Error?error.message:String(error));}
  }
  async function saveQr() {
    const base64 = qrData.split(",")[1] ?? "";
    const decoded = atob(base64);
    const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
    const ok=await exportFile("daily-desk-qr.png",bytes);
    setStatus(ok?"QR image saved.":"Save cancelled.");
  }
  async function exportNames(format:"txt"|"csv"){
    try{
      const saved=await exportFile("universal-box-file-list."+format,fileNameManifest(files,format));
      setStatus(saved?"Saved file list locally. Originals unchanged.":"Save cancelled.");
    }catch(e){setStatus(String(e instanceof Error?e.message:e));}
  }
  async function renameFile(file:File,next:string){
    const result=await exportFile(next,new Uint8Array(await file.arrayBuffer()));
    setStatus(result?"Saved a renamed file copy. Original file unchanged.":"Save cancelled.");
  }
  async function exportRenamedZip(){
    if(!renamed.length)return;
    setRenameBusy(true);setStatus("");
    try{
      if(renamed.length>50)throw Error("At most 50 files per ZIP.");
      const sum=renamed.reduce((s,x)=>s+x.file.size,0);
      if(sum>16_000_000)throw Error("Total original file size exceeds the 16 MB batch budget.");
      const archive=new JSZip();
      const names=new Set<string>();
      for(const {file,filename} of renamed){
        const next=filename.replace(/^\.+/u,"-");
        if(!next||names.has(next))throw Error("Filename collision or invalid name: "+filename);
        names.add(next);
        archive.file(next,await file.arrayBuffer());
      }
      const result=await archive.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:3}});
      if(result.length>20_000_000)throw Error("Output exceeds 20 MB.");
      const saved=await exportFile("daily-desk-renamed-files.zip",result);
      setStatus(saved?"Saved "+renamed.length+" renamed copies in one ZIP. Originals untouched.":"Save cancelled.");
    }catch(error){setStatus("Batch rename failed: "+String(error instanceof Error?error.message:error));}
    finally{setRenameBusy(false);}
  }
  const selected = UTILITIES.find(item=>item.id===tab)!;

  return (
    <section className="panel">
      <p className="eyebrow">EVERYDAY WEB UTILITIES · DESKTOP EDITION</p>
      <h2>Quick utilities</h2>
      <p className="subtle">Local tools adapted from Knowledge Explorer; no AP website login is required.</p>
      <div className="pill-row" role="group" aria-label="Choose a utility">
        {UTILITIES.map(item=><button className={tab===item.id?"pill active-pill":"pill"} key={item.id} type="button" onClick={()=>{setTab(item.id);setOutput("");setStatus("");setQrData("");}}>{item.title}</button>)}
      </div>
      <h3>{selected.title}</h3><p className="subtle">{selected.description}</p>
      {tab==="diff"?<TextCompareDesk/>:tab==="markdown"?<MarkdownConvertDesk/>:tab==="color"?<div className="tools-pair">
        <label className="field-label">Text color <input type="color" value={foreground} onChange={e=>setForeground(e.target.value)} /></label>
        <label className="field-label">Background <input type="color" value={background} onChange={e=>setBackground(e.target.value)} /></label>
        <div className="contrast-preview" style={{color:foreground,backgroundColor:background}}>Readable sample text · Aa 123</div>
        <p className="subtle">Contrast: {ratio(foreground,background).toFixed(2)}:1 · Normal AA {ratio(foreground,background)>=4.5?"pass":"fail"} · Large AA {ratio(foreground,background)>=3?"pass":"fail"}</p>
      </div>:tab==="rename"?<>
        <label className="field-label" htmlFor="rename-files">Choose files (originals stay unchanged)</label><input id="rename-files" className="field" type="file" multiple onChange={e=>setFiles([...(e.target.files??[])].slice(0,50))} />
        <div className="tools-pair"><label className="field-label">Prefix <input className="field" value={prefix} onChange={e=>setPrefix(e.target.value)} /></label><label className="field-label">Start number <input className="field" type="number" value={start} onChange={e=>setStart(Number(e.target.value)||1)} /></label>
        <label className="field-label">Find text <input className="field" value={find} onChange={e=>setFind(e.target.value)} /></label><label className="field-label">Replace <input className="field" value={replace} onChange={e=>setReplace(e.target.value)} /></label></div>
        <div className="actions">
          <button type="button" className="secondary-button" disabled={!files.length||renameBusy} onClick={()=>{void exportNames("txt");}}>Export names TXT</button>
          <button type="button" className="secondary-button" disabled={!files.length||renameBusy} onClick={()=>{void exportNames("csv");}}>Export names CSV</button>
          <button type="button" className="primary-button" disabled={!renamed.length||renameBusy} onClick={()=>{void exportRenamedZip();}}>{renameBusy?"Creating ZIP…":"Save all renamed copies as ZIP"}</button><span className="subtle">Limit: 50 files, 16 MB input. Each original is preserved.</span></div>
        <div className="task-list">{renamed.map(({file,filename},i)=><div key={i} className="task-row"><span className="task-copy">{file.name} → {filename}</span><button type="button" className="secondary-button" onClick={()=>{void renameFile(file,filename).catch(e=>setStatus(String(e)));}}>Save copy</button></div>)}</div>
      </>:<>
        <label className="field-label" htmlFor="utility-input">{tab==="groups"?"Names, separated by lines or commas":tab==="csv"?"CSV or TSV data":tab==="qr"?"URL or text":"Enter text"}</label>
        <textarea className="field text-editor" id="utility-input" rows={6} value={input} onChange={e=>setInput(e.target.value)} />
        {tab==="csv"&&<div className="actions"><label className="field-label" htmlFor="csv-file-import">Import CSV or TSV<input type="file" id="csv-file-import" className="field" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>2_000_000){setStatus("Maximum CSV import is 2 MB.");return;}void file.text().then(t=>{setInput(t);setStatus("Loaded CSV locally");}).catch(x=>setStatus(String(x)));}e.target.value="";}} /></label><label>Delimiter <select className="field" value={delimiter} onChange={e=>setDelimiter(e.target.value as "," | "\t")}><option value=",">Comma</option><option value="\t">Tab</option></select></label><label><input type="checkbox" checked={header} onChange={e=>setHeader(e.target.checked)}/> First row is header</label></div>}
        {tab==="json"&&<div className="actions"><button type="button" className="secondary-button" onClick={()=>{try{setOutput(JSON.stringify(JSON.parse(input) as unknown));setStatus("");}catch(e){setStatus(String(e));}}}>Minify JSON</button></div>}
        {tab==="encode"&&<div className="actions"><label>Encoding <select className="field" value={codec} onChange={e=>setCodec(e.target.value as "base64"|"url")}><option value="base64">Base64 (UTF-8)</option><option value="url">URL component</option></select></label></div>}
        {tab==="groups"&&<><label className="field-label">People per group <input type="number" className="field" min={1} max={50} value={groupSize} onChange={e=>setGroupSize(Math.max(1,Math.min(50,Number(e.target.value)||1)))}/></label><button type="button" className="secondary-button" onClick={()=>{const names=input.split(/\r?\n|,/u).map(s=>s.trim()).filter(Boolean);setOutput(names.length ? "Random pick: "+shuffle(names)[0] : "Enter names first.");setStatus("");}}>Pick one randomly</button></>}
        {tab==="stats"?<div className="metrics"><span>{stats.words} words</span><span>{stats.characters} characters</span><span>{stats.sentences} sentences</span><span>{stats.paragraphs} paragraphs</span><span>{stats.lines} lines</span><span>~{stats.reading} min read</span></div>:<div className="actions">
          {tab==="qr"?<button type="button" className="primary-button" onClick={()=>{void makeQr();}}>Generate QR</button>:<button type="button" className="primary-button" onClick={compute}>Convert / compare</button>}
          {tab==="encode"&&<button type="button" className="secondary-button" onClick={()=>{try{setOutput(codec==="url"?decodeURIComponent(input):fromBase64(input));setStatus("");}catch(e){setStatus("Decode error: "+String(e));}}}>Decode</button>}
        </div>}
        {tab==="qr"&&qrData&&<><img src={qrData} alt="Generated QR code" width={200} height={200}/><div className="actions"><button className="secondary-button" type="button" onClick={()=>{void saveQr().catch(e=>setStatus(String(e)));}}>Save PNG</button></div></>}
        {output&&<><label className="field-label" htmlFor="utility-output">Result</label><textarea id="utility-output" className="field text-editor" rows={10} readOnly value={output}/><div className="actions"><button type="button" className="secondary-button" onClick={()=>{void navigator.clipboard.writeText(output).then(()=>setStatus("Copied result")).catch(()=>setStatus("Clipboard unavailable"));}}>Copy result</button><button type="button" className="secondary-button" onClick={()=>{void exportFile("daily-desk-result.txt",output).then(ok=>setStatus(ok?"Saved text result.":"Save cancelled.")).catch(e=>setStatus(String(e)));}}>Save result</button></div></>}
      </>}
      {status&&<p role="status" className="subtle">{status}</p>}
    </section>
  );
}
