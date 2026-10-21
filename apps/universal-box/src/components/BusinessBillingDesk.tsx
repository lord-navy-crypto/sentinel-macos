import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {parseBusinessBilling,BILLING_EXAMPLE,formatCents,pdfLatinCompatible,
 type SellerDetails} from "../lib/businessBilling";
import {exportBillingBatch} from "../lib/businessBillingExport";
const fail=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function BusinessBillingDesk(){
 const [source,setSource]=useState(BILLING_EXAMPLE);
 const [seller,setSeller]=useState<SellerDetails>({
  name:"Example Design Studio",address:"1 Example Street, Dublin",taxId:"",paymentDetails:"Payment by bank transfer; confirm account details directly.",
 });
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const prepared=useMemo(()=>{try{return {value:parseBusinessBilling(source,seller),error:""};}
  catch(e){return {value:null,error:fail(e)};}},[source,seller]);
 function change(key:keyof SellerDetails,value:string){setSeller(s=>({...s,[key]:value}));setStatus("");}
 async function importCsv(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";setStatus("");
  if(!file)return;
  try{
   if(!/\.csv$/iu.test(file.name)||file.size<1||file.size>350_000)
    throw Error("Choose a UTF-8 .csv file up to 350 KB.");
   setSource(new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/u,""));
   setStatus("Imported "+file.name+" locally; no files were sent or changed.");
  }catch(e){setStatus("CSV import failed: "+fail(e));}
 }
 async function saveExample(){
  try{const done=await exportFile("sentinel-box-business-invoice-sample.csv","\uFEFF"+BILLING_EXAMPLE+"\r\n");
   setStatus(done?"CSV template downloaded. Edit the customer, services and amounts.":"Template save cancelled.");}
  catch(e){setStatus("Could not save sample: "+fail(e));}
 }
 async function saveBundle(){
  if(busy||!prepared.value)return;
  setBusy(true);setStatus("");
  try{
   const result=await exportBillingBatch(prepared.value);
   const done=await exportFile("sentinel-box-business-documents.zip",result.bytes);
   setStatus(done?"Saved "+result.wordCount+" editable Word documents, "+result.pdfCount+
    " Latin PDF documents and CSV/JSON reports. "+
    (result.pdfSkipped.length?result.pdfSkipped.length+" non-Latin PDF files were intentionally skipped; editable Word is included. ":"")+
    "Review names, tax and documents before sharing.":"Save cancelled.");
  }catch(e){setStatus("Business documents export failed: "+fail(e));}
  finally{setBusy(false);}
 }
 const field=(key:keyof SellerDetails,label:string,maxLength:number)=>
  <label className="field-label">{label}
   <input data-testid={"billing-seller-"+key} className="field" value={seller[key]} maxLength={maxLength}
    onChange={e=>change(key,e.target.value)}/>
  </label>;
 return <section className="panel" data-testid="business-billing-desk">
  <p className="eyebrow">SENTINEL BOX · BUSINESS ESSENTIALS · OFFLINE-FIRST</p>
  <h3>商务报价与发票 · CSV → Word / PDF / 汇总表</h3>
  <p className="subtle">将客户和项目 CSV 按相同 document_id 分组，检查数量、单价、税率与截止日期；一次生成真实可编辑 Word、可用时生成 PDF，附带逐单汇总表。不发送邮件、不处理付款、不上传客户信息。</p>
  <div className="tools-pair">
   {field("name","企业／个人名称",110)}
   {field("address","企业／个人地址",240)}
   {field("taxId","注册号／税号（可留空）",70)}
   {field("paymentDetails","付款说明／备注（可留空）",240)}
  </div>
  <div className="actions">
   <button type="button" data-testid="billing-example" className="secondary-button" onClick={()=>void saveExample()}>下载 CSV 填写模板</button>
  </div>
  <label className="field-label">导入本地客户和项目 CSV（≤350 KB）
   <input type="file" accept=".csv,text/csv" className="field" data-testid="billing-import" onChange={e=>void importCsv(e)}/>
  </label>
  <label className="field-label">逐行项目 CSV（可直接编辑）
   <textarea className="field text-editor" data-testid="billing-csv" rows={9} maxLength={350000}
    spellCheck={false} value={source} onChange={e=>{setSource(e.target.value);setStatus("");}}/>
  </label>
  <p className="subtle">同一 document_id 表示同一份文件的多行项目。kind 选择 <code>invoice</code>（发票）或 <code>quote</code>（报价）；价格为不含税的单位金额；tax_rate 按百分比填写，如 7.50 表示 7.50%，按每行金额四舍五入到分。支持 USD、EUR、GBP、CNY；必须自行核对适用的税务及开票规定。</p>
  {prepared.error?<p role="alert" data-testid="billing-error">{prepared.error}</p>:prepared.value&&<>
   <p data-testid="billing-plan" role="status">已验证 {prepared.value.lineCount} 项，准备生成 {prepared.value.documents.length} 份文件。</p>
   <div data-testid="billing-preview" style={{display:"grid",gap:12}}>
    {prepared.value.documents.map(doc=><div className="panel" key={doc.id} style={{padding:12}}>
     <strong>{doc.kind==="invoice"?"发票":"报价单"} {doc.id}</strong>
     <p className="subtle">客户：{doc.client} · {doc.lines.length} 个项目 · {doc.issueDate} → {doc.dueDate}</p>
     {doc.lines.map((item,i)=><p key={i} className="subtle">
      {item.description} · {item.quantity} × {doc.currency} {formatCents(item.unitCents)}
      · 税率 {(item.taxBasisPoints/100).toFixed(2)}% = {doc.currency} {formatCents(item.totalCents)}
     </p>)}
     <p data-testid={"billing-total-"+doc.id}><strong>含税合计 {doc.currency} {formatCents(doc.totalCents)}</strong>
      <span className="subtle"> · 税额 {formatCents(doc.taxCents)}</span></p>
     {!pdfLatinCompatible(prepared.value,doc)&&<p className="subtle">包含中文或其他非 ASCII 字符：将输出完整 Word；当前矢量 PDF 字体不支持该文本，因此不会生成缺字 PDF。</p>}
    </div>)}
   </div>
   <button data-testid="billing-export" className="primary-button" disabled={busy} type="button" onClick={()=>void saveBundle()}>
    {busy?"正在生成 Word / PDF…":"导出客户文件 ZIP（Word / PDF / CSV）"}
   </button>
  </>}
  {status&&<p role="status" className="subtle" data-testid="billing-status">{status}</p>}
  <p className="subtle"><strong>开票提示：</strong>这是通用文件生成器，不提供税务或法律合规认证，不自动分配法定连续单号，也不报税或收款。实际发票字段、VAT/GST、币种折算和发票格式要求因司法辖区而异，发送前请人工核对。</p>
 </section>;
}
