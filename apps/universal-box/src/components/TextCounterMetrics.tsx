import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {analyzeTextMetrics,checkTextLimit,textMetricsReport,type TextMetrics} from "../lib/textMetrics";

type CounterPreset="char150"|"char280"|"word500"|"word650"|"custom";
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
const METRIC_ITEMS:{key:keyof TextMetrics;label:string}[]=[
 {key:"words",label:"词数 / Words"},
 {key:"characters",label:"可见字符 / Unicode characters"},
 {key:"withoutWhitespace",label:"不含空白字符"},
 {key:"letters",label:"字母（含其他语言）"},
 {key:"latinLetters",label:"拉丁字母 A–Z 等"},
 {key:"hanCharacters",label:"汉字"},
 {key:"numbers",label:"数字字符"},
 {key:"punctuation",label:"标点符号"},
 {key:"symbols",label:"符号"},
 {key:"emojiClusters",label:"Emoji 组合"},
 {key:"spaces",label:"空格和 Tab"},
 {key:"whitespace",label:"全部空白字符"},
 {key:"lines",label:"行数"},
 {key:"paragraphs",label:"段落"},
 {key:"sentences",label:"句数（估算）"},
 {key:"utf8Bytes",label:"UTF-8 字节"},
 {key:"codePoints",label:"Unicode 码点"},
 {key:"utf16Units",label:"UTF-16 单元"},
 {key:"readingMinutes",label:"阅读分钟（估算）"},
];
export default function TextCounterMetrics({text,selected,onImport}:{text:string;selected:string;onImport:(text:string)=>void}){
 const [preset,setPreset]=useState<CounterPreset>("char150");
 const [unit,setUnit]=useState<"characters"|"words">("characters");
 const [customLimit,setCustomLimit]=useState("150");
 const [status,setStatus]=useState("");
 const full=useMemo(()=>analyzeTextMetrics(text),[text]);
 const selectedMetrics=useMemo(()=>selected?analyzeTextMetrics(selected):null,[selected]);
 const activeLimit=preset==="custom"?{unit,value:Number(customLimit)}:
  preset==="char150"?{unit:"characters" as const,value:150}:
  preset==="char280"?{unit:"characters" as const,value:280}:
  preset==="word500"?{unit:"words" as const,value:500}:{unit:"words" as const,value:650};
 const limit=useMemo(()=>{try{return checkTextLimit(full,activeLimit.unit,activeLimit.value);}
  catch{return null;}},[full,activeLimit.unit,activeLimit.value]);
 async function upload(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";setStatus("");
  if(!file)return;
  try{
   if(!/\.(txt|md|csv|srt|vtt|json)$/iu.test(file.name)||file.size>1_000_000)
    throw Error("Please select a UTF-8 text file (.txt, .md, .csv, .srt, .vtt, .json) no larger than 1 MB.");
   const content=new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
   if(content.length>1_000_000)throw Error("Decoded text exceeds the 1,000,000 character limit.");
   onImport(content);setStatus("Text loaded locally from "+file.name+". The original file was not changed.");
  }catch(e){setStatus("Import: "+err(e));}
 }
 async function pasteClipboard(){
  setStatus("");
  try{
   if(!navigator.clipboard?.readText)throw Error("Clipboard read permission is not available in this WebView. Use keyboard paste instead.");
   const content=await navigator.clipboard.readText();
   if(content.length>1_000_000)throw Error("Clipboard text exceeds 1,000,000 UTF-16 characters.");
   onImport(content);setStatus("Pasted clipboard text after your explicit click; no background clipboard monitoring.");
  }catch(e){setStatus("Clipboard import: "+err(e)+". You can paste into the text box manually.");}
 }
 async function copySummary(){
  try{await navigator.clipboard.writeText(textMetricsReport(text,selected));setStatus("Copied statistics to clipboard.");}
  catch{setStatus("Clipboard unavailable. You can save the statistics as TXT instead.");}
 }
 async function saveSummary(){
  try{const done=await exportFile("sentinel-box-text-count.txt",textMetricsReport(text,selected));
   setStatus(done?"Statistics report saved locally.":"Save cancelled.");}
  catch(e){setStatus("Export: "+err(e));}
 }
 return <div data-testid="unicode-text-counter">
  <p className="subtle">实时计算中文、英文、数字、标点与 Emoji。可见字符使用 Unicode 字素簇，避免把一个组合 Emoji 算成多个显示字符；UTF-16 和 UTF-8 另行显示，方便查看不同软件的限制。</p>
  <div className="metrics" data-testid="unicode-count-summary">
   <span data-testid="count-characters">{full.characters} 字符</span>
   <span data-testid="count-words">{full.words} 词</span>
   <span data-testid="count-letters">{full.letters} 字母</span>
   <span>{full.hanCharacters} 汉字</span>
   <span>{full.utf8Bytes} UTF-8 字节</span>
   <span>{full.withoutWhitespace} 不含空白字符</span>
  </div>
  <div className="tools-pair">
   <label className="field-label">文字长度限制预设
    <select className="field" data-testid="counter-preset" value={preset} onChange={e=>setPreset(e.target.value as CounterPreset)}>
     <option value="char150">150 字符</option><option value="char280">280 字符</option>
     <option value="word500">500 词</option><option value="word650">650 词</option>
     <option value="custom">自定义</option>
    </select>
   </label>
   {preset==="custom"&&<>
    <label className="field-label">限制单位<select className="field" data-testid="counter-limit-unit" value={unit} onChange={e=>setUnit(e.target.value as "characters"|"words")}><option value="characters">字符</option><option value="words">词</option></select></label>
    <label className="field-label">最大值<input className="field" type="number" data-testid="counter-custom-limit" min={1} max={1000000} step={1} value={customLimit} onChange={e=>setCustomLimit(e.target.value)}/></label>
   </>}
  </div>
  {limit?
   <p data-testid="counter-limit-summary" role="status" className="subtle">
    当前 {limit.used} / {limit.value} {limit.unit==="words"?"词":"字符"} · {limit.exceeded?"超过限制 "+Math.abs(limit.remaining):"剩余 "+limit.remaining}
   </p>:
   <p role="alert">请输入 1–1,000,000 之间的整数。</p>}
  <div style={{width:"100%",height:9,background:"#dce5ed",borderRadius:5,overflow:"hidden",margin:"8px 0"}}>
   <div data-testid="counter-limit-bar" style={{width:limit?Math.min(100,Math.round(100*limit.used/limit.value))+"%":"0%",height:"100%",
    background:limit?.exceeded?"#b63e3e":"#397eb9"}}/>
  </div>
  <h3>详细统计</h3>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
   {METRIC_ITEMS.map(x=><div key={x.key} style={{border:"1px solid #dce5ed",borderRadius:7,padding:"7px 10px"}}>
    <span className="subtle">{x.label}</span><div style={{fontWeight:650}}>{String(full[x.key])}</div>
   </div>)}
  </div>
  {selectedMetrics?<p className="subtle" data-testid="counter-selection">
   已选中文字：{selectedMetrics.characters} 可见字符 · {selectedMetrics.words} 词 · {selectedMetrics.letters} 字母 · {selectedMetrics.utf8Bytes} 字节
  </p>:<p className="subtle">在上方文本框中选中一部分文字，即可查看这一部分的独立统计。</p>}
  {full.approximateSegmentation&&<p role="status" className="subtle">当前系统不支持 Intl.Segmenter，字符/单词分段为简化模式，组合 Emoji 数量可能与可见字符不一致。</p>}
  <div className="actions">
   <label className="field-label">导入 UTF-8 文本文件
    <input data-testid="counter-import" type="file" className="field" accept=".txt,.md,.csv,.srt,.vtt,.json" onChange={e=>void upload(e)}/>
   </label>
   <button type="button" data-testid="counter-paste" onClick={()=>void pasteClipboard()}>主动读取剪贴板并统计</button>\n   <button type="button" data-testid="counter-copy" onClick={()=>void copySummary()}>复制统计</button>
   <button type="button" data-testid="counter-save" className="primary-button" onClick={()=>void saveSummary()}>导出 TXT 统计报告</button>
  </div>
  {status&&<p role="status" className="subtle" data-testid="counter-status">{status}</p>}
 </div>;
}
