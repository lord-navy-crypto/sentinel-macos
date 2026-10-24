import {useMemo,useRef,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {auditPdfDocuments,compareWordDocuments,pdfAuditZip,trimWavSilence,wavSilenceZip,wordReviewZip,wordReviewText,
 type ReviewInput,type WordReview,type PdfAuditResult,type WavSilenceReview} from "../lib/qualityReview";

export type QualityMode="word-diff"|"wav-silence"|"pdf-audit";
const textError=(e:unknown)=>e instanceof Error?e.message:String(e);
const read=async(file:File,limit:number):Promise<ReviewInput>=>{
 if(file.size<1||file.size>limit)throw Error("File is empty or exceeds "+limit+" bytes.");
 return {name:file.name,bytes:new Uint8Array(await file.arrayBuffer())};
};
export default function QualityReviewDesk({mode}:{mode:QualityMode}){
 const [wordA,setWordA]=useState<ReviewInput|null>(null),[wordB,setWordB]=useState<ReviewInput|null>(null),
  [wordReport,setWordReport]=useState<WordReview|null>(null),[wav,setWav]=useState<ReviewInput|null>(null),
  [threshold,setThreshold]=useState(-42),[padding,setPadding]=useState(80),
  [wavReport,setWavReport]=useState<WavSilenceReview|null>(null),[pdfs,setPdfs]=useState<ReviewInput[]>([]),
  [pdfReport,setPdfReport]=useState<PdfAuditResult|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [wordLoading,setWordLoading]=useState({left:false,right:false});
 const wordTicket=useRef({left:0,right:0});
 async function selectWord(event:ChangeEvent<HTMLInputElement>,side:"left"|"right"){
  const f=event.target.files?.[0];event.target.value="";
  if(!f||busy)return;
  const request=++wordTicket.current[side];
  setWordReport(null);setStatus("");
  setWordLoading(old=>({...old,[side]:true}));
  if(side==="left")setWordA(null);else setWordB(null);
  try{
   if(!/\.docx$/iu.test(f.name))throw Error("Choose .docx Word documents.");
   const item=await read(f,8_000_000);
   if(wordTicket.current[side]!==request)return;
   if(side==="left")setWordA(item);else setWordB(item);
  }catch(e){
   if(wordTicket.current[side]===request)setStatus("Word import: "+textError(e));
  }finally{
   if(wordTicket.current[side]===request)setWordLoading(old=>({...old,[side]:false}));
  }
 }
 async function selectWav(event:ChangeEvent<HTMLInputElement>){
  const f=event.target.files?.[0];event.target.value="";setWavReport(null);setStatus("");
  if(!f)return;
  try{if(!/\.wav$/iu.test(f.name))throw Error("Select a .wav file.");
   setWav(await read(f,20_000_000));
  }catch(e){setStatus("WAV import: "+textError(e));}
 }
 async function selectPdfs(event:ChangeEvent<HTMLInputElement>){
  const selected=[...(event.target.files??[])];event.target.value="";setPdfReport(null);setPdfs([]);setStatus("");
  if(!selected.length)return;
  try{
   if(selected.length>12)throw Error("Maximum 12 PDFs.");
   const loaded:ReviewInput[]=[];let total=0;
   for(const f of selected){if(!/\.pdf$/iu.test(f.name))throw Error("Choose PDF files only.");
    total+=f.size;if(total>30_000_000)throw Error("Selected PDFs exceed 30 MB.");
    loaded.push(await read(f,15_000_000));
   }
   setPdfs(loaded);
  }catch(e){setStatus("PDF import: "+textError(e));}
 }
 async function review(){
  if(busy||(mode==="word-diff"&&(wordLoading.left||wordLoading.right)))return;
  setBusy(true);setStatus("");
  if(mode==="word-diff")setWordReport(null);
  try{
   if(mode==="word-diff"){
    if(!wordA||!wordB)throw Error("Select two Word documents.");
    const r=await compareWordDocuments(wordA,wordB);setWordReport(r);
    setStatus("Compared Word paragraphs locally. Review the changes before exporting.");
   }else if(mode==="wav-silence"){
    if(!wav)throw Error("Select a WAV file.");
    const r=trimWavSilence(wav.bytes,threshold,padding);setWavReport(r);
    setStatus("Identified audible region using peak amplitude; original audio unchanged.");
   }else{
    const r=await auditPdfDocuments(pdfs);setPdfReport(r);
    setStatus("Inspected "+r.totalPages+" pages from "+r.files.length+" selected PDF files.");
   }
  }catch(e){setStatus("Review error: "+textError(e));}
  finally{setBusy(false);}
 }
 async function save(){
  if(busy)return;setBusy(true);setStatus("");
  try{
   const bytes=mode==="word-diff"?wordA&&wordB&&wordReport?await wordReviewZip(wordA,wordB,wordReport):null
    :mode==="wav-silence"?wav?await wavSilenceZip(wav,threshold,padding):null
    :pdfs.length?await pdfAuditZip(pdfs):null;
   if(!bytes)throw Error("Select files first.");
   const name=mode==="word-diff"?"sentinel-box-word-diff.zip":mode==="wav-silence"?"sentinel-box-trimmed-wav.zip":"sentinel-box-pdf-audit.zip";
   const ok=await exportFile(name,bytes);
   setStatus(ok?"Saved ZIP with actual results and human-readable audit files.":"Save cancelled.");
  }catch(e){setStatus("Export error: "+textError(e));}
  finally{setBusy(false);}
 }
 async function copyWordChanges(){
  if(!wordReport||busy)return;
  try{await navigator.clipboard.writeText(wordReviewText(wordReport,true));setStatus("Copied changed Word paragraphs locally.");}
  catch{setStatus("Clipboard permission unavailable. Select and copy the preview manually.");}
 }
 async function saveWordChanges(){
  if(!wordReport||busy)return;
  setBusy(true);setStatus("");
  try{
   const ok=await exportFile("sentinel-box-word-changes.txt",wordReviewText(wordReport,true));
   setStatus(ok?"Saved changes-only TXT. Original DOCX files unchanged.":"Save cancelled.");
  }catch(e){setStatus("TXT export failed: "+textError(e));}
  finally{setBusy(false);}
 }
 const isReady=mode==="word-diff"?!!wordReport:mode==="wav-silence"?!!wavReport:!!pdfReport;
 return <section className="panel" data-testid="quality-review-desk" aria-label="Document, audio and PDF verification">
  <p className="eyebrow">SENTINEL BOX · QUALITY & REPAIR</p>
  {mode==="word-diff"&&<>
   <h3>Word 段落差异对比 · DOCX Review</h3>
   <p className="subtle">对照两份 DOCX 的实际文字段落，标记未变、更改前删除和新增内容。报告是**只读文本比较**，不等同于 Microsoft Word 的 Track Changes，也不比较图片、样式、批注或表格版式。</p>
   <div className="tools-pair">
    <label className="field-label">原版本 DOCX<input data-testid="quality-word-a" className="field" type="file" accept=".docx" disabled={busy} onChange={e=>void selectWord(e,"left")}/>{wordA?.name}</label>
    <label className="field-label">新版本 DOCX<input data-testid="quality-word-b" className="field" type="file" accept=".docx" disabled={busy} onChange={e=>void selectWord(e,"right")}/>{wordB?.name}</label>
   </div>
   {(wordLoading.left||wordLoading.right)&&<p role="status" data-testid="quality-word-reading" className="subtle">Reading local Word file…</p>}
   <button data-testid="quality-review" className="primary-button" type="button" disabled={!wordA||!wordB||busy||wordLoading.left||wordLoading.right} onClick={()=>void review()}>比较两份 Word</button>
   {wordReport&&<>
    <p data-testid="quality-word-stats" className="subtle">相同 {wordReport.same} 段 · 新增 {wordReport.added} 段 · 删除 {wordReport.removed} 段</p>
    <pre data-testid="quality-word-preview" style={{maxHeight:330,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{wordReport.changes.slice(0,90).map(x=>(x.kind==="added"?"+ ":x.kind==="removed"?"- ":"  ")+x.line).join("\n")}</pre>
    <p className="subtle">Preview shows up to 90 paragraphs; complete ZIP contains every compared paragraph. Changes-only copy/TXT excludes unchanged paragraphs.</p>
    <div className="actions">
     <button type="button" data-testid="quality-word-copy-changes" className="secondary-button" disabled={busy||wordReport.added+wordReport.removed===0} onClick={()=>void copyWordChanges()}>复制变更段落 / Copy changes</button>
     <button type="button" data-testid="quality-word-txt-changes" className="secondary-button" disabled={busy||wordReport.added+wordReport.removed===0} onClick={()=>void saveWordChanges()}>保存仅变更 TXT</button>
    </div>
   </>}
  </>}
  {mode==="wav-silence"&&<>
   <h3>WAV 自动去除首尾静音</h3>
   <p className="subtle">对原始 PCM16 WAV 逐帧检查绝对振幅，按设定 dBFS 阈值裁掉开头与结尾的静音，保留指定毫秒缓冲。支持 8–192kHz 单／双声道。不是自动语音检测，不支持 MP3。</p>
   <label className="field-label">选择 WAV（≤20 MB）<input data-testid="quality-wav" className="field" type="file" accept=".wav,audio/wav" onChange={e=>void selectWav(e)}/>{wav?.name}</label>
   <div className="tools-pair">
    <label className="field-label">静音阈值（dBFS）<input data-testid="quality-db" className="field" type="number" min={-75} max={-15} step={1} value={threshold} onChange={e=>{setThreshold(Number(e.target.value));setWavReport(null);}}/></label>
    <label className="field-label">保留边缘缓冲（ms）<input data-testid="quality-pad" className="field" type="number" min={0} max={750} step={10} value={padding} onChange={e=>{setPadding(Number(e.target.value));setWavReport(null);}}/></label>
   </div>
   <button data-testid="quality-review" className="primary-button" type="button" disabled={!wav||busy} onClick={()=>void review()}>分析可听区域</button>
   {wavReport&&<p data-testid="quality-wav-stats" className="subtle">原音频 {(wavReport.durationMs/1000).toFixed(3)} 秒，保留 {(wavReport.startMs/1000).toFixed(3)}–{(wavReport.endMs/1000).toFixed(3)} 秒；首部移除 {Math.round(wavReport.removedStartMs)} ms，尾部移除 {Math.round(wavReport.removedEndMs)} ms。</p>}
  </>}
  {mode==="pdf-audit"&&<>
   <h3>多份 PDF 页面审计 · Batch PDF Inspection</h3>
   <p className="subtle">一次选择最多 12 个 PDF，统计页面总数、纵横比例、各页尺寸及文档标题／作者，生成 CSV+JSON 报告。不执行 OCR、不修改 PDF，也不声称检测隐藏敏感信息。</p>
   <label className="field-label">选择 PDF 文件（每份≤15 MB，总计≤30 MB）
    <input data-testid="quality-pdfs" className="field" type="file" multiple accept=".pdf,application/pdf" onChange={e=>void selectPdfs(e)}/>
   </label>
   {pdfs.length>0&&<p className="subtle">{pdfs.length} 份已选择</p>}
   <button data-testid="quality-review" className="primary-button" type="button" disabled={!pdfs.length||busy} onClick={()=>void review()}>生成 PDF 页面清单</button>
   {pdfReport&&<>
    <p data-testid="quality-pdf-stats" className="subtle">{pdfReport.files.length} 份 PDF · {pdfReport.totalPages} 页（尺寸根据 CropBox 计算）</p>
    <div style={{overflowX:"auto",maxHeight:260,overflowY:"auto"}}><table><thead><tr><th>PDF</th><th>总页</th><th>纵向</th><th>横向</th><th>尺寸</th></tr></thead><tbody>{pdfReport.files.map((f,i)=><tr key={i}><td>{f.name}</td><td>{f.pages}</td><td>{f.portrait}</td><td>{f.landscape}</td><td>{f.sizes.join(", ")}</td></tr>)}</tbody></table></div>
   </>}
  </>}
  {isReady&&<button data-testid="quality-export" className="primary-button" type="button" disabled={busy} onClick={()=>void save()}>保存完整结果 ZIP</button>}
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">所有输入来自用户主动选择的本地文件，不上传、不自动更改原件。导出报告可能含原始文本、文件名或 PDF 作者信息，请检查后分享。</p>
 </section>;
}
