import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {buildHexPage,findHexBytes,hexHeader,hexSummary,parseHexPattern,validateHexBytes,HEX_PAGE_BYTES,HEX_MAX_BYTES} from "../lib/safeHexViewer";

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function HexViewerDesk(){
 const [data,setData]=useState<Uint8Array|null>(null);
 const [name,setName]=useState("");
 const [offset,setOffset]=useState(0);
 const [pattern,setPattern]=useState("");
 const [search,setSearch]=useState<{matches:number;offsets:number[];truncated:boolean}|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const view=useMemo(()=>data?buildHexPage(data,offset):null,[data,offset]);
 async function importFile(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(busy||!selected.length)return;
  if(selected.length!==1){setStatus("一次只能选择一个文件；已保留之前的查看内容。");return;}
  const file=selected[0];
  if(!Number.isSafeInteger(file.size)||file.size<1||file.size>HEX_MAX_BYTES){
   setStatus("文件必须在 1 byte–8 MB 之间；之前的查看内容未改变。");return;
  }
  setBusy(true);setStatus("");
  try{
   const actual=new Uint8Array(await file.arrayBuffer());
   validateHexBytes(actual);
   setData(actual);setName(file.name);setOffset(0);setPattern("");setSearch(null);
   setStatus("已只读加载 "+file.name+" · "+actual.length.toLocaleString()+" bytes；原文件不会被修改。");
  }catch(e){setStatus("读取失败，已保留之前的数据："+errorText(e));}
  finally{setBusy(false);}
 }
 function runSearch(){
  if(!data)return;
  try{
   const found=findHexBytes(data,parseHexPattern(pattern));
   setSearch(found);
   setStatus("已在本机搜索完整原始字节，共 "+found.matches+" 处匹配。");
  }catch(e){setStatus("搜索输入无效："+errorText(e));}
 }
 function moveToOffset(next:number){
  if(!data||!Number.isSafeInteger(next)||next<0||next>=data.length)return;
  setOffset(next);
 }
 async function save(){
  if(!data||busy)return;
  setBusy(true);setStatus("");
  try{
   const result=await exportFile("sentinel-hex-summary.txt",hexSummary(name,data));
   setStatus(result?"已另存只读摘要 TXT；原文件字节仍保持原样。":"已取消保存。");
  }catch(e){setStatus("导出失败："+errorText(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="hex-viewer">
  <p className="eyebrow">SENTINEL BOX · CLASSIC TOOLS MODERNIZED · OFFLINE</p>
  <h2>只读十六进制文件查看器 · HEX Viewer</h2>
  <p className="subtle">灵感来自经典十六进制工具，但这里是安全的简易只读查看：16 字节一行、十六进制偏移、ASCII、原始字节搜索。适合检查文件头和损坏附件。<strong>不会编辑、覆盖、执行或上传文件。</strong></p>
  <label className="field-label">选择一个本地文件（1 byte–8 MB）
   <input className="field" data-testid="hex-file" type="file" disabled={busy} onChange={e=>void importFile(e)}/>
  </label>
  {data&&view&&<>
   <div className="metrics" data-testid="hex-stats">
    <span>文件：{name}</span>
    <span>{data.length.toLocaleString()} bytes</span>
    <span>文件头：{hexHeader(data)}</span>
   </div>
   <div className="actions">
    <button type="button" className="secondary-button" data-testid="hex-prev"
     disabled={busy||view.start===0} onClick={()=>moveToOffset(Math.max(0,view.start-HEX_PAGE_BYTES))}>上一页</button>
    <button type="button" className="secondary-button" data-testid="hex-next"
     disabled={busy||view.end>=data.length} onClick={()=>moveToOffset(view.end)}>下一页</button>
    <button type="button" className="secondary-button" data-testid="hex-summary"
     disabled={busy} onClick={()=>void save()}>导出只读摘要 TXT</button>
    <button type="button" className="secondary-button" data-testid="hex-clear"
     disabled={busy} onClick={()=>{setData(null);setName("");setOffset(0);setSearch(null);setStatus("当前字节预览已清空；源文件未改变。");}}>清空</button>
   </div>
   <p className="subtle" data-testid="hex-page-info">当前偏移 0x{view.start.toString(16).toUpperCase().padStart(8,"0")} – 0x{(view.end-1).toString(16).toUpperCase().padStart(8,"0")}；每页最多 512 字节，完整文件仍用于精确搜索。</p>
   <div className="panel" data-testid="hex-rows" role="table" aria-label="16 字节每行的十六进制及 ASCII 预览"
    style={{overflowX:"auto",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",fontSize:12}}>
    {view.rows.map(row=><div role="row" key={row.offset} className="task-row" style={{whiteSpace:"pre",gap:12}}>
     <span role="cell">{row.offsetHex}</span>
     <span role="cell">{row.hex.padEnd(47," ")}</span>
     <span role="cell">{row.ascii}</span>
    </div>)}
   </div>
   <div className="tools-pair">
    <label className="field-label">十六进制字节模式（1–32 bytes，如 50 4B 03 04）
     <input data-testid="hex-pattern" className="field" maxLength={100}
      value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="例如 25 50 44 46"/>
    </label>
    <div className="actions"><button type="button" className="primary-button" data-testid="hex-search"
     disabled={busy||!pattern.trim()} onClick={runSearch}>搜索文件中的字节</button></div>
   </div>
   {search&&<div data-testid="hex-matches">
    <p className="subtle">实际匹配总数：{search.matches}。以下最多列出 30 处位置，点击即可跳至对应页。</p>
    <div className="actions">
     {search.offsets.map(value=><button type="button" className="secondary-button" key={value}
       data-testid="hex-match" onClick={()=>moveToOffset(value)}>0x{value.toString(16).toUpperCase()}</button>)}
    </div>
   </div>}
  </>}
  {status&&<p role="status" className="subtle" data-testid="hex-status">{status}</p>}
 </section>;
}
