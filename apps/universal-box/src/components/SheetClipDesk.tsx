import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {listXlsxWorksheets} from "../lib/spreadsheetInterop";
import {addBasketItem,moveBasketItem,combineBasket,exportSelectedXlsxSheets,type BasketItem} from "../lib/sheetClipWorkflows";
export type SheetClipMode="sheet-select"|"clip-basket";
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function SheetClipDesk({mode}:{mode:SheetClipMode}){
 const [xlsx,setXlsx]=useState<Uint8Array|null>(null),[sheetNames,setSheetNames]=useState<{index:number;name:string}[]>([]),
  [selected,setSelected]=useState<number[]>([]),[notes,setNotes]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [basket,setBasket]=useState<BasketItem[]>([]),[draft,setDraft]=useState(""),[separator,setSeparator]=useState("\n\n");
 async function selectWorkbook(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";setXlsx(null);setSheetNames([]);setSelected([]);setStatus("");setNotes("");
  if(!file)return;setBusy(true);
  try{
   if(!/\.xlsx$/iu.test(file.name)||file.size<100||file.size>4_000_000)throw Error("Select an XLSX file between 100 bytes and 4 MB.");
   const bytes=new Uint8Array(await file.arrayBuffer());
   const sheets=await listXlsxWorksheets(bytes);setXlsx(bytes);setSheetNames(sheets);setSelected(sheets.map(s=>s.index));
   setNotes(file.name);
   setStatus("Read "+sheets.length+" worksheet names locally. Data will be read only after export.");
  }catch(err){setStatus("Workbook open: "+errorText(err));}finally{setBusy(false);}
 }
 function toggle(index:number,on:boolean){
  setSelected(s=>on?[...s,index].sort((a,b)=>a-b):s.filter(n=>n!==index));setStatus("");
 }
 async function saveSheets(){
  if(!xlsx||busy)return;setBusy(true);setStatus("");
  try{
   const result=await exportSelectedXlsxSheets(xlsx,selected);
   const ok=await exportFile("sentinel-box-selected-sheets.zip",result.zip);
   setStatus(ok?"Saved "+result.results.length+" selected CSV worksheet files. Formulas were not executed.":"Save cancelled.");
  }catch(err){setStatus("Sheet export failed: "+errorText(err));}finally{setBusy(false);}
 }
 function addText(){
  try{setBasket(addBasketItem(basket,draft));setDraft("");setStatus("Added one user-supplied snippet to this temporary basket.");}
  catch(err){setStatus("Add snippet: "+errorText(err));}
 }
 function copyJoined(){
  try{
   const text=combineBasket(basket,separator);
   if(!navigator.clipboard?.writeText)throw Error("Clipboard write is unavailable here. Use the download option.");
   // Triggered by user click; clipboard contents are never read or watched.
   void navigator.clipboard.writeText(text).then(()=>setStatus("Joined snippets copied by your explicit action."),
    err=>setStatus("Copy blocked by browser permission: "+errorText(err)));
  }catch(err){setStatus("Copy: "+errorText(err));}
 }
 async function saveJoined(){
  try{
   const text=combineBasket(basket,separator);
   const ok=await exportFile("sentinel-box-clip-basket.txt",text);
   setStatus(ok?"Saved joined snippets as local UTF-8 TXT.":"Save cancelled.");
  }catch(err){setStatus("Export: "+errorText(err));}
 }
 return <section className="panel" data-testid="sheet-clip-desk">
  <p className="eyebrow">SENTINEL BOX · WORKFLOW INTEGRATION</p>
  {mode==="sheet-select"?<>
   <h3>Excel 多工作表选择与 CSV 导出</h3>
   <p className="subtle">在最多 20 个 XLSX 工作表中逐个勾选，导出真实 CSV 副本和清单。保持文字型编号，防止单元格内容被当成 CSV 公式执行；只使用公式的缓存值，不重新计算 Excel 公式、不保留样式。</p>
   <label className="field-label">选择 XLSX 工作簿（≤4 MB）
    <input className="field" data-testid="sheet-select-file" type="file" accept=".xlsx" onChange={e=>void selectWorkbook(e)}/>
   </label>
   {sheetNames.length>0&&<div data-testid="sheet-select-list">
    <p className="subtle">工作簿：{notes} · 共 {sheetNames.length} 个工作表</p>
    {sheetNames.map(s=><label key={s.index} style={{display:"flex",alignItems:"center",gap:9,margin:"7px 0"}}>
     <input type="checkbox" data-testid="sheet-select-checkbox" checked={selected.includes(s.index)}
      onChange={e=>toggle(s.index,e.target.checked)}/>
     {s.index+1}. {s.name}
    </label>)}
    <p className="subtle" data-testid="sheet-select-count">已选择 {selected.length} 个工作表</p>
   </div>}
   <button className="primary-button" type="button" data-testid="sheet-select-export"
    disabled={!xlsx||!selected.length||busy} onClick={()=>void saveSheets()}>导出选中的 CSV 工作表 ZIP</button>
  </>:<>
   <h3>多段文字收集篮 · Manual Multi-Clip Basket</h3>
   <p className="subtle">手动粘贴或输入多段文字，调整顺序后一次复制。默认仅在当前工作区内存中暂存；没有剪贴板监听、后台历史收集或自动读取密码。页面卸载后内容不保留。</p>
   <label className="field-label">要加入的文本
    <textarea className="field text-editor" rows={5} maxLength={5000} data-testid="clip-basket-draft"
     value={draft} onChange={e=>setDraft(e.target.value)} placeholder="请主动粘贴或输入文字"/>
   </label>
   <button className="primary-button" data-testid="clip-basket-add" disabled={!draft.trim()||basket.length>=20} type="button" onClick={addText}>添加到收集篮</button>
   <p data-testid="clip-basket-count" className="subtle">{basket.length} 段 · 最多 20 段／共 40,000 字符</p>
   <div style={{maxHeight:300,overflowY:"auto"}}>
    {basket.map((item,i)=><div key={item.id} data-testid="clip-basket-item" style={{border:"1px solid #b8c6d3",borderRadius:8,padding:9,marginBottom:8}}>
     <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.text}</p>
     <div className="actions">
      <button type="button" disabled={i===0} onClick={()=>setBasket(x=>moveBasketItem(x,i,-1))}>上移</button>
      <button type="button" disabled={i===basket.length-1} onClick={()=>setBasket(x=>moveBasketItem(x,i,1))}>下移</button>
      <button type="button" onClick={()=>setBasket(x=>x.filter(y=>y.id!==item.id))}>移除</button>
     </div>
    </div>)}
   </div>
   <label className="field-label">段落间隔
    <select data-testid="clip-basket-separator" className="field" value={separator} onChange={e=>setSeparator(e.target.value)}>
     <option value={"\n\n"}>空行</option><option value={"\n"}>换行</option><option value={" "}>空格</option>
     <option value={" | "}>竖线分隔</option>
    </select>
   </label>
   <div className="actions">
    <button type="button" data-testid="clip-basket-copy" className="primary-button" disabled={!basket.length} onClick={copyJoined}>主动复制全部</button>
    <button type="button" data-testid="clip-basket-save" className="secondary-button" disabled={!basket.length} onClick={()=>void saveJoined()}>导出 TXT</button>
    <button type="button" data-testid="clip-basket-clear" disabled={!basket.length} onClick={()=>{setBasket([]);setStatus("Cleared temporary snippets.");}}>清空收集篮</button>
   </div>
  </>}
  {status&&<p role="status" className="subtle" data-testid="sheet-clip-status">{status}</p>}
  <p className="subtle">资料仅在用户主动提交时处理。本工具不监测系统剪贴板，不自动打开私人文件，不传输到云端。导出前请检查是否包含私人资料。</p>
 </section>;
}
