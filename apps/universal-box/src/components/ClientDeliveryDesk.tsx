import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {verifyReceivedDelivery,receiptReport,type DeliveryReceipt} from "../lib/clientDeliveryReceiver";
import {
 planClientDelivery,buildClientDelivery,type DeliveryInput,type DeliveryRecord,
} from "../lib/clientDeliveryPack";
const fail=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function ClientDeliveryDesk(){
 const [details,setDetails]=useState<DeliveryInput>({
  project:"Example project delivery",recipient:"Example client",reference:"",
  deliveryDate:"2026-10-21",note:"Included files are the agreed project deliverables. Please review before acceptance.",
 });
 const [files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false);
 const [status,setStatus]=useState(""),[progress,setProgress]=useState("");
 const [report,setReport]=useState<DeliveryRecord[]>([]);
 const [receivedZip,setReceivedZip]=useState<File|null>(null);
 const [receipt,setReceipt]=useState<DeliveryReceipt|null>(null);
 const [receiptError,setReceiptError]=useState("");
 const [receiptProgress,setReceiptProgress]=useState("");
 const planned=useMemo(()=>{try{return {value:files.length?planClientDelivery(details,files):null,error:""};}
  catch(e){return {value:null,error:fail(e)};}},[details,files]);
 function update(key:keyof DeliveryInput,value:string){setDetails(p=>({...p,[key]:value}));setReport([]);setStatus("");}
 function selectFiles(e:ChangeEvent<HTMLInputElement>){
  setFiles([...(e.target.files??[])]);e.target.value="";setProgress("");setReport([]);setStatus("");
 }
 async function save(){
  if(busy||!planned.value)return;
  setBusy(true);setStatus("");setReport([]);setProgress("Computing SHA-256 locally…");
  try{
   const result=await buildClientDelivery(details,files,(done,total)=>setProgress("Hashing "+done+" / "+total+" files"));
   setProgress("ZIP CRC-32 and SHA-256 verification complete.");
   setReport(result.records);
   const ok=await exportFile("sentinel-box-verified-client-delivery.zip",result.zip);
   setStatus(ok?
    "Saved a new verified client ZIP with checksum manifest, handover notes and CSV inventory. Originals unchanged.":
    "Save cancelled; source files remain untouched.");
  }catch(e){setStatus("Client delivery failed: "+fail(e));setProgress("");}
  finally{setBusy(false);}
 }
 async function inspectReceived(){
  if(busy||!receivedZip)return;
  setBusy(true);setReceipt(null);setReceiptError("");setReceiptProgress("Validating archive structure locally…");
  try{
   if(!/\.zip$/iu.test(receivedZip.name)||receivedZip.size<22||receivedZip.size>20_000_000)
    throw Error("Choose a received .zip between 22 bytes and 20 MB.");
   const bytes=new Uint8Array(await receivedZip.arrayBuffer());
   const result=await verifyReceivedDelivery(bytes,(done,total)=>
    setReceiptProgress("Verifying real file hashes: "+done+" / "+total));
   setReceipt(result);
   setReceiptProgress(result.passed?"All listed content matches the unsigned manifest.":
    "Problems detected. Review the individual file results before accepting this package.");
  }catch(e){setReceiptError("Cannot verify received delivery: "+fail(e));setReceiptProgress("");}
  finally{setBusy(false);}
 }
 async function saveReceipt(){
  if(!receipt||busy)return;
  try{
   const saved=await exportFile("sentinel-box-received-delivery-check.txt",receiptReport(receipt));
   setReceiptProgress(saved?"Saved local integrity check report. This is not proof of who sent the files.":
    "Report save cancelled.");
  }catch(e){setReceiptError("Could not save report: "+fail(e));}
 }
 const short=(key:keyof DeliveryInput,label:string,max:number,type:"text"|"date"="text")=>
  <label className="field-label">{label}
   <input className="field" data-testid={"delivery-"+key} type={type} maxLength={max}
    value={details[key]} onChange={e=>update(key,e.target.value)}/>
  </label>;
 return <section className="panel" data-testid="client-delivery-desk">
  <p className="eyebrow">SENTINEL BOX · BUSINESS HANDOVER</p>
  <h3>Client Delivery Pack · 文件交付与 SHA-256 校验</h3>
  <p className="subtle">选择真正要交给客户的文件，填写项目／收件人和交付说明，一键打包为新的 ZIP。自动安全重命名并逐个计算 SHA-256；导出前重新解开 ZIP，核对 CRC 与内容哈希。无需云端、登录或文件夹扫描。</p>
  <div className="tools-pair">
   {short("project","项目名称 / Project",150)}
   {short("recipient","收件客户 / Recipient",150)}
   {short("reference","合同或参考编号（可选）",90)}
   {short("deliveryDate","交付日期 / Delivery date",10,"date")}
  </div>
  <label className="field-label">客户交付说明（可选，原样写入交付 README）
   <textarea className="field text-editor" data-testid="delivery-note" rows={5} maxLength={6000}
    value={details.note} onChange={e=>update("note",e.target.value)}/>
  </label>
  <label className="field-label">明确选择交付文件（1–50 份，合计 ≤16 MB）
   <input className="field" data-testid="delivery-files" type="file" multiple onChange={selectFiles}/>
  </label>
  {planned.error&&<p role="alert" data-testid="delivery-error" className="subtle">{planned.error}</p>}
  {planned.value&&<>
   <div className="metrics" data-testid="delivery-summary">
    <span>文件：{planned.value.files.length}</span>
    <span>原始内容：{planned.value.totalBytes.toLocaleString()} bytes</span>
    <span>只处理用户选择的文件</span>
   </div>
   <div data-testid="delivery-preview" style={{maxHeight:360,overflow:"auto"}}>
    {planned.value.files.map(f=><p key={f.output} className="subtle">
     <strong>{f.source}</strong> → files/{f.output} · {f.size.toLocaleString()} bytes
    </p>)}
   </div>
   <button type="button" className="primary-button" data-testid="delivery-export"
    disabled={busy} onClick={()=>void save()}>
    {busy?"正在构建和逐项核对…":"生成并保存验证过的客户 ZIP"}
   </button>
  </>}
  {progress&&<p className="subtle" data-testid="delivery-progress" role="status">{progress}</p>}
  {report.length>0&&<div data-testid="delivery-report">
   <strong>校验结果：{report.length} 份实际内容</strong>
   {report.map(r=><p key={r.path} className="subtle">{r.path} · SHA-256: <code>{r.sha256}</code></p>)}
  </div>}
  {status&&<p className="subtle" role="status" data-testid="delivery-status">{status}</p>}
  <div className="panel" data-testid="delivery-receive-panel">
   <h3>Receive & Verify · 检查收到的交付文件</h3>
   <p className="subtle">收到 Sentinel Box 生成的客户交付 ZIP 后，可在本机查看交付说明、逐个比对 SHA-256，并发现缺少、改变或新增的文件。先验证，再决定是否信任和打开其中的文件。</p>
   <label className="field-label">选择收到的交付 ZIP（≤20 MB）
    <input className="field" type="file" accept=".zip,application/zip" data-testid="delivery-received-zip"
     onChange={e=>{
      setReceivedZip(e.target.files?.[0]??null);e.target.value="";
      setReceipt(null);setReceiptError("");setReceiptProgress("");
     }}/>
   </label>
   <button type="button" className="secondary-button" data-testid="delivery-verify-received"
    disabled={busy||!receivedZip} onClick={()=>void inspectReceived()}>
    {busy?"验证中…":"核验 ZIP 清单与每个文件的 SHA-256"}
   </button>
   {receiptError&&<p data-testid="delivery-receive-error" role="alert" className="subtle">{receiptError}</p>}
   {receiptProgress&&<p data-testid="delivery-receive-progress" role="status" className="subtle">{receiptProgress}</p>}
   {receipt&&<div data-testid="delivery-receive-result">
    <strong>{receipt.passed?"内容与清单一致 / Content matches":"交付内容存在问题 / Mismatches found"}</strong>
    <p className="subtle">项目：{receipt.project} · 收件人：{receipt.recipient} · 日期：{receipt.deliveryDate}</p>
    <div className="metrics" data-testid="delivery-receive-counts">
     <span>匹配：{receipt.counts.match}</span><span>内容改变：{receipt.counts.changed}</span>
     <span>大小不符：{receipt.counts.size_mismatch}</span>
     <span>缺失：{receipt.counts.missing}</span><span>多余：{receipt.counts.extra}</span>
    </div>
    <div style={{maxHeight:330,overflow:"auto"}}>
     {receipt.checks.map((row,i)=><p data-testid="delivery-receive-check" className="subtle" key={i}>
      <strong>{row.status.toUpperCase()}</strong> · {row.path}
      {row.actualBytes!==undefined&&" · "+row.actualBytes.toLocaleString()+" bytes"}
      {row.expectedSha256&&" · declared SHA-256 "+row.expectedSha256.slice(0,16)+"…"}
     </p>)}
    </div>
    <button type="button" className="secondary-button" data-testid="delivery-save-receipt"
     onClick={()=>void saveReceipt()}>导出本次完整校验报告 TXT</button>
    <p className="subtle">此校验只说明实际文件与同一个 ZIP 内的清单是否一致。ZIP 与清单都没有数字签名，不能证明发送者身份，也不能证明文件安全、未泄露或未被共同替换。没有执行或解压文件到磁盘。</p>
   </div>}
  </div>
  <p className="subtle"><strong>安全提醒：</strong>ZIP 默认不加密；SHA-256 可以检查内容是否变化，但不能证明文件没有恶意程序。务必检查交付清单、收件人和是否包含私人资料。此工具不自动发送文件。</p>
 </section>;
}
