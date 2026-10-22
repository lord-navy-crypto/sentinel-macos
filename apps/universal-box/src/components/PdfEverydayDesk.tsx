import {type ChangeEvent,type DragEvent as ReactDragEvent,useState} from "react";
import {exportFile} from "../lib/output";
import {
  type PdfBasicInfo,type PdfMetadataEdit,type PdfCropMargins,type PdfFormText,type PageFormat,
  inspectPdfEveryday,savePdfMetadata,cropPdfPages,insertBlankPdfPages,inspectPdfTextFields,fillPdfTextFields,exportSelectedPdfPages,
  type PdfPageQuickAction,pdfQuickPageExpression,
} from "../lib/pdfEveryday";
import PdfPagePreview from "./PdfPagePreview";
import PdfStructureOptimizationPanel from "./PdfStructureOptimizationPanel";
import ScanPdfCompressionPanel from "./ScanPdfCompressionPanel";
import PdfLinkRegionPicker from "./PdfLinkRegionPicker";
import {
 type PdfExternalLink,inspectPdfExternalLinks,editPdfExternalLink,addPdfExternalLink,
 parseBatchPdfPages,previewPdfBatchLinks,batchEditPdfExternalLinks,pdfLinkInventoryCsv,
} from "../lib/pdfLinks";

export type PdfEverydayMode="scan-compress"|"optimize"|"metadata"|"crop"|"blank"|"form"|"pages"|"links";
const tabs:{id:PdfEverydayMode;label:string}[]=[
  {id:"scan-compress",label:"Compress Scanned PDF · 扫描件真压缩"},
  {id:"optimize",label:"Compress PDF · 文件体积优化"},
  {id:"metadata",label:"Properties · 文件属性"},
  {id:"crop",label:"Crop margins · 裁边"},
  {id:"blank",label:"Insert pages · 插入空白页"},
  {id:"form",label:"Fill text forms · 填写表单"},
  {id:"pages",label:"Extract & reorder · 提取排序"},
  {id:"links",label:"Hyperlinks · PDF 超链接"},
];
const EMPTY_METADATA:PdfMetadataEdit={title:"",author:"",subject:"",keywords:""};
const EMPTY_CROP:PdfCropMargins={left:0,right:0,top:0,bottom:0};
function err(e:unknown){return e instanceof Error?e.message:String(e);}
export default function PdfEverydayDesk({initialMode="metadata"}:{initialMode?:PdfEverydayMode}){
  const [mode,setMode]=useState<PdfEverydayMode>(initialMode);
  const [file,setFile]=useState<File|null>(null);
  const [bytes,setBytes]=useState<Uint8Array|null>(null);
  const [info,setInfo]=useState<PdfBasicInfo|null>(null);
  const [metadata,setMetadata]=useState<PdfMetadataEdit>(EMPTY_METADATA);
  const [crop,setCrop]=useState<PdfCropMargins>(EMPTY_CROP);
  const [cropPage,setCropPage]=useState("all");
  const [afterPage,setAfterPage]=useState(0);
  const [blankCount,setBlankCount]=useState(1);
  const [format,setFormat]=useState<PageFormat>("a4");
  const [pageExpression,setPageExpression]=useState("1");
  const [preparedPages,setPreparedPages]=useState<{expression:string;file:File;bytes:Uint8Array}|null>(null);
  const [fields,setFields]=useState<PdfFormText[]|null>(null);
  const [links,setLinks]=useState<PdfExternalLink[]|null>(null);
  const [linkTarget,setLinkTarget]=useState("");
  const [linkSelection,setLinkSelection]=useState("");
  const [linkNewPage,setLinkNewPage]=useState(1);
  const [showLinkPicker,setShowLinkPicker]=useState(false);
  const [linkRect,setLinkRect]=useState({x:36,y:36,width:170,height:25});
  const [linkNewUrl,setLinkNewUrl]=useState("https://example.com/");
  const [batchFrom,setBatchFrom]=useState("");
  const [batchTo,setBatchTo]=useState("");
  const [batchPages,setBatchPages]=useState("all");
  const [batchAction,setBatchAction]=useState<"replace"|"remove">("replace");
  const [linkDirty,setLinkDirty]=useState(false);
  const [linkPreview,setLinkPreview]=useState<File|null>(null);
  const [formValues,setFormValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [dropActive,setDropActive]=useState(false);
  const [status,setStatus]=useState("");
  async function importPdfFile(selected:File|null){
    if(busy)return;
    setFile(null);setBytes(null);setInfo(null);setFields(null);setFormValues({});
    setLinks(null);setLinkSelection("");setLinkDirty(false);setLinkPreview(null);
    setBatchFrom("");setBatchTo("");setBatchPages("all");setShowLinkPicker(false);
    setMetadata(EMPTY_METADATA);setPageExpression("1");setPreparedPages(null);setStatus("");
    if(!selected)return;
    setBusy(true);
    try{
      if(!/\.pdf$/iu.test(selected.name)||selected.size>15_000_000)
        throw Error("Choose an unencrypted .pdf file up to 15 MB.");
      const content=new Uint8Array(await selected.arrayBuffer());
      const inspected=await inspectPdfEveryday(content);
      setFile(selected);setBytes(content);setInfo(inspected);
      setLinkNewPage(1);
      setMetadata({title:inspected.title,author:inspected.author,subject:inspected.subject,keywords:inspected.keywords});
      setStatus("Loaded "+inspected.pages+" PDF pages locally. Original remains unchanged.");
    }catch(e){setStatus("PDF import failed: "+err(e));}
    finally{setBusy(false);}
  }
  function importPdf(event:ChangeEvent<HTMLInputElement>){
    const chosen=event.target.files?.[0]??null;
    event.target.value="";
    if(chosen)void importPdfFile(chosen);
  }
  function dropPdf(event:ReactDragEvent<HTMLDivElement>){
    event.preventDefault();setDropActive(false);
    if(busy)return;
    const files=Array.from(event.dataTransfer.files);
    if(files.length!==1){setStatus("请一次拖入一份 PDF；本工具不会覆盖原文件。");return;}
    void importPdfFile(files[0]);
  }
  function shortcutPdfPages(action:PdfPageQuickAction){
    if(!info||busy||linkDirty)return;
    try{
      const expression=pdfQuickPageExpression(action,info.pages);
      setPageExpression(expression);setPreparedPages(null);setMode("pages");
      setStatus("已填写页码顺序："+expression+"。请核对后点击“提取并另存”，原 PDF 保持不变。");
    }catch(e){setStatus("PDF 快捷操作不可用："+err(e));}
  }
  async function previewPdfPages(){
    if(!bytes||busy||linkDirty)return;
    setBusy(true);setPreparedPages(null);setStatus("");
    try{
      const result=await exportSelectedPdfPages(bytes,pageExpression);
      const previewFile=new File([new Uint8Array(result)],"sentinel-box-selected-pages-preview.pdf",
        {type:"application/pdf"});
      setPreparedPages({expression:pageExpression,file:previewFile,bytes:result});
      setStatus("已在本机生成所选页面的实际预览。检查页序与内容后，再另存新文件。");
    }catch(e){setStatus("PDF 页面预览失败："+err(e));}
    finally{setBusy(false);}
  }
  async function savePdf(name:string,process:()=>Promise<Uint8Array>){
    if(!bytes||busy)return;
    setBusy(true);setStatus("");
    try{
      const result=await process();
      const ok=await exportFile(name,result);
      setStatus(ok?"New PDF saved successfully; original file unchanged.":"Save cancelled.");
    }catch(e){setStatus("PDF processing failed: "+err(e));}
    finally{setBusy(false);}
  }
  async function loadFields(){
    if(!bytes||busy)return;
    setBusy(true);setStatus("");
    try{
      const found=await inspectPdfTextFields(bytes);
      setFields(found);
      setFormValues(Object.fromEntries(found.filter(f=>!f.readOnly).map(f=>[f.name,f.text])));
      setStatus(found.length?found.length+" text fields found. Checkbox/signature/XFA fields are not editable here.":"No standard text form fields were found.");
    }catch(e){setFields(null);setStatus("Form inspection failed: "+err(e));}
    finally{setBusy(false);}
  }
  async function inspectLinks(){
    if(!bytes||busy)return;
    setBusy(true);setStatus("");
    try{
      const found=await inspectPdfExternalLinks(bytes);
      setLinks(found);setLinkSelection("");setLinkTarget("");
      setStatus("Found "+found.length+" external URL link annotation(s). Internal page links, JavaScript actions and other annotation types are not editable here.");
    }catch(e){setStatus("Link inspection failed: "+err(e));}
    finally{setBusy(false);}
  }
  async function stageLinkEdit(run:()=>Promise<Uint8Array>){
    if(!bytes||busy)return;
    setBusy(true);setStatus("");
    try{
      const output=await run();
      const next=await inspectPdfExternalLinks(output);
      setBytes(output);setPreparedPages(null);setLinks(next);setLinkSelection("");
      setLinkPreview(new File([new Uint8Array(output)],file?.name??"working.pdf",{type:"application/pdf"}));
      setLinkDirty(true);
      setStatus("Link edit staged locally. Review the preview, then save a new PDF. Original file on disk remains unchanged.");
    }catch(e){setStatus("Link edit failed: "+err(e));}
    finally{setBusy(false);}
  }
  async function saveLinkCopy(){
    if(!bytes||busy||!linkDirty)return;
    setBusy(true);setStatus("");
    try{
      const saved=await exportFile("universal-box-pdf-links-edited.pdf",bytes);
      setStatus(saved?"Edited PDF saved as a new copy; source file unchanged.":"Save cancelled; in-memory edits remain.");
      if(saved)setLinkDirty(false);
    }catch(e){setStatus("Saving edited links failed: "+err(e));}
    finally{setBusy(false);}
  }
  async function exportLinkInventory(){
    if(!links||busy)return;
    try{
      const saved=await exportFile("universal-box-pdf-links-report.csv",pdfLinkInventoryCsv(links));
      setStatus(saved?"PDF link inventory exported locally as CSV.":"Export cancelled.");
    }catch(e){setStatus("Could not save link inventory: "+err(e));}
  }
  function getBatchPlan(){
    if(!info||!links)throw Error("Inspect the PDF's existing links first.");
    const pages=parseBatchPdfPages(batchPages,info.pages);
    const plan={action:batchAction,sourceUrl:batchFrom,targetUrl:batchTo,pages};
    const matches=previewPdfBatchLinks(links,plan);
    return {plan,matches};
  }
  async function applyBatch(){
    if(!bytes)return;
    let plan:ReturnType<typeof getBatchPlan>["plan"];
    try{
      const current=getBatchPlan();
      if(!current.matches.length)throw Error("No matching links in the selected pages.");
      plan=current.plan;
    }catch(e){setStatus("Batch edit not applied: "+err(e));return;}
    await stageLinkEdit(async()=>{
      const output=await batchEditPdfExternalLinks(bytes,plan);
      if(output.changed===0)throw Error("No links were changed.");
      return output.bytes;
    });
  }
  const pageCount=info?.pages??0;
  return <section className="panel pdf-everyday-desk">
    <p className="eyebrow">SENTINEL BOX · FREE PDF EVERYDAY EDITORS</p>
    <h2>PDF Mini Editor / PDF 日常编辑器</h2>
    <p className="subtle">Free PDF utilities that process a file locally: edit properties, crop visible margins, insert blank pages, fill standard text forms, or extract and reorder pages. No paid plan, cloud upload or forced registration.</p>
    <div className="pill-row" role="group" aria-label="PDF mini editor modes">
      {tabs.map(tab=><button key={tab.id} type="button" className={tab.id===mode?"pill active-pill":"pill"}
        aria-pressed={tab.id===mode} onClick={()=>{setMode(tab.id);setStatus("");}}>{tab.label}</button>)}
    </div>
    <div data-testid="pdf-mini-drop-zone" role="region" aria-label="拖入 PDF 或选择本地 PDF"
      className="panel" onDragOver={event=>{event.preventDefault();if(!busy)setDropActive(true);}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDropActive(false);}}
      onDrop={dropPdf}>
      <label className="field-label" htmlFor="mini-pdf-input">{dropActive?"松开鼠标导入 PDF":"拖入一个 PDF，或点击选择文件（≤15 MB，最多 200 页）"}</label>
      <input type="file" id="mini-pdf-input" className="field" disabled={busy}
        accept=".pdf,application/pdf" onChange={importPdf}/>
      <p className="subtle">仅在本机读取；不会上传，也不会覆盖原 PDF。处理完成后另存新文件。</p>
    </div>
    {info&&file&&<>
      <div className="metrics" aria-label="Imported PDF document information">
        <span><strong>{pageCount}</strong> pages</span>
        <span><strong>{(file.size/1_000_000).toFixed(2)}</strong> MB</span>
        <span><strong>{Math.round(info.dimensions[0].width)}×{Math.round(info.dimensions[0].height)}</strong> pt first page</span>
      </div>
      <div className="panel" data-testid="pdf-mini-quick-tasks">
        <p><strong>日常 PDF 快捷操作</strong> · 先选任务，再检查设置并另存</p>
        <div className="actions" role="group" aria-label="常用 PDF 快捷操作">
          <button type="button" className="secondary-button" data-testid="pdf-quick-optimize"
            disabled={busy||linkDirty} onClick={()=>{setMode("optimize");setStatus("已切换到 PDF 体积优化；先生成并核对实际结果，再另存。");}}>
            压缩 PDF
          </button>
          {([["first","提取首页"],["last","提取末页"],["odd","只留奇数页"],
            ["even","只留偶数页"],["reverse","页面倒序"]] as const).map(([action,label])=>
            <button type="button" key={action} className="secondary-button"
              data-testid={`pdf-quick-${action}`} disabled={busy||linkDirty||(action==="even"&&pageCount<2)}
              onClick={()=>shortcutPdfPages(action)}>{label}</button>
          )}
        </div>
        {linkDirty&&<p role="note" className="subtle">有尚未另存的 PDF 链接修改。请先保存工作副本，再使用快捷提取，以免混淆原件与编辑稿。</p>}
        <p className="subtle">提取和倒序复用现有 PDF 页面导出；不是批量拆分多个文件。目录、表单等复杂文档级对象可能不会随页面导出。</p>
      </div>
      {mode==="scan-compress"&&bytes&&<ScanPdfCompressionPanel key={file.name} source={bytes}/>}
      {mode==="optimize"&&bytes&&<PdfStructureOptimizationPanel key={file.name} source={bytes}/>}
      {mode==="metadata"&&<>
        <p className="subtle">Edit standard PDF document properties, without modifying page contents. This does <strong>not</strong> remove embedded XMP metadata, attachments, author traces or prior saved revisions; do not treat it as full anonymization.</p>
        <div className="tools-pair">
          {(["title","author","subject","keywords"] as const).map(key=><label key={key} className="field-label">{key==="keywords"?"Keywords (comma-separated)":key[0].toUpperCase()+key.slice(1)}
            <input className="field" maxLength={250} value={metadata[key]} onChange={e=>setMetadata(prev=>({...prev,[key]:e.target.value}))}/>
          </label>)}
        </div>
        <p className="subtle">Existing PDF Creator: {info.creator||"(empty)"} · Producer: {info.producer||"(empty)"}. These fields are shown for inspection, not removed.</p>
        <button className="primary-button" type="button" disabled={busy}
          onClick={()=>{void savePdf("universal-box-pdf-properties.pdf",()=>savePdfMetadata(bytes!,metadata));}}>
          Save updated PDF properties
        </button>
      </>}
      {mode==="crop"&&<>
        <p className="subtle"><strong>Visual crop only.</strong> Removes margins from the visible region using PDF CropBox; underlying document text and objects may remain recoverable. NOT secure redaction. Margin direction uses the underlying PDF page coordinates and may appear rotated for sideways pages.</p>
        <div className="tools-pair">
          {(["left","right","top","bottom"] as const).map(side=><label key={side} className="field-label">{side[0].toUpperCase()+side.slice(1)} margin %
            <input className="field" type="number" min={0} max={45} step={1} value={crop[side]} onChange={e=>setCrop(p=>({...p,[side]:Number(e.target.value)}))}/>
          </label>)}
          <label className="field-label">Which pages?
            <select className="field" value={cropPage} onChange={e=>setCropPage(e.target.value)}>
              <option value="all">All pages</option>
              {Array.from({length:pageCount},(_,i)=><option key={i} value={i+1}>Page {i+1}</option>)}
            </select>
          </label>
        </div>
        <p className="subtle">Cropping adjusts visible boundaries, not the contents or physical MediaBox. It may not be supported by every viewer. Existing CropBoxes are cropped again by the selected percentages.</p>
        <button className="primary-button" type="button" disabled={busy}
          onClick={()=>{void savePdf("universal-box-pdf-cropped.pdf",()=>cropPdfPages(bytes!,crop,cropPage==="all"?"all":Number(cropPage)));}}>
          Save visually cropped PDF
        </button>
      </>}
      {mode==="blank"&&<>
        <p className="subtle">Insert blank pages into your existing PDF to create writing space or dividers. Choose position 0 for the beginning or the number of an existing page to insert immediately after it.</p>
        <div className="tools-pair">
          <label className="field-label">Insert after page (0–{pageCount})
            <input type="number" className="field" min={0} max={pageCount} step={1} value={afterPage}
              onChange={e=>setAfterPage(Number(e.target.value))}/>
          </label>
          <label className="field-label">Number of blank pages
            <input type="number" className="field" min={1} max={10} step={1} value={blankCount}
              onChange={e=>setBlankCount(Number(e.target.value))}/>
          </label>
          <label className="field-label">Paper size
            <select className="field" value={format} onChange={e=>setFormat(e.target.value as PageFormat)}>
              <option value="a4">A4 portrait</option>
              <option value="letter">US Letter portrait</option>
              <option value="same-as-first">Match original first-page dimensions</option>
            </select>
          </label>
        </div>
        <button className="primary-button" type="button" disabled={busy}
          onClick={()=>{void savePdf("universal-box-pdf-with-blanks.pdf",()=>insertBlankPdfPages(bytes!,afterPage,blankCount,format));}}>
          Insert and save a new PDF
        </button>
      </>}
      {mode==="pages"&&<>
        <p className="subtle">Export chosen PDF pages in your specified order. Use e.g. 3,1-2,5 to output page 3, then pages 1–2, then 5. Repeating page numbers duplicates pages in the output. A fresh PDF is saved locally; the original stays unchanged. Some document-level features such as outlines or embedded forms may not transfer to the new PDF.</p>
        <label className="field-label">Page order / 页面顺序 (1–{pageCount})
          <input className="field" type="text" data-testid="pdf-page-expression" maxLength={900} value={pageExpression} onChange={e=>{setPageExpression(e.target.value);setPreparedPages(null);}} placeholder="3,1-2,5"/>
        </label>
        <div className="actions">
          <button className="secondary-button" type="button" data-testid="pdf-quick-preview-pages"
            disabled={busy||linkDirty} onClick={()=>{void previewPdfPages();}}>
            先预览所选页面
          </button>
          <button className="primary-button" type="button" data-testid="pdf-quick-export-pages" disabled={busy||linkDirty}
            onClick={()=>{void savePdf("universal-box-selected-pages.pdf",async()=>
              preparedPages?.expression===pageExpression?preparedPages.bytes:exportSelectedPdfPages(bytes!,pageExpression));}}>
            提取并另存 PDF
          </button>
        </div>
        {preparedPages&&preparedPages.expression===pageExpression&&
          <div data-testid="pdf-quick-output-preview" className="panel">
            <p className="subtle">实际导出页面预览：{preparedPages.file.size.toLocaleString()} 字节。原文件未修改；请核对页面顺序。</p>
            <PdfPagePreview file={preparedPages.file} onPickPage={()=>{}}/>
          </div>}
      </>}
      {mode==="links"&&<>
        <p className="subtle"><strong>PDF Hyperlink Studio · 可点击链接编辑。</strong> 只处理标准外部 URI 链接批注，可查看、替换、移除或创建透明的可点击区域。不会修改页面上肉眼看见的文字，也不会自动打开 PDF 中的任何网址。</p>
        <div className="actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={()=>void inspectLinks()}>扫描现有 PDF 超链接</button>
          <button type="button" className="primary-button" disabled={busy||!linkDirty} onClick={()=>void saveLinkCopy()}>另存已修改的 PDF</button>
        </div>
        {links&&<>
          <p className="subtle">检测到 {links.length} 条可编辑的外部链接。非 HTTP(S) 链接会标为「不安全/不支持」，仍可移除或替换，但不会执行它们。所有修改在本地内存累积；离开前请另存。</p>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={()=>void exportLinkInventory()}>
              导出全部链接清单 CSV（含页码和坐标）
            </button>
          </div>
          <details className="panel" open>
            <summary><strong>批量修改或删除重复超链接</strong></summary>
            <p className="subtle">对完全相同的旧网址执行批量操作，可限制页面。修改前会预览命中数量；不会修改 PDF 正文、内部页码跳转或表单。</p>
            <label className="field-label">已有目标网址（精确匹配）
              <select className="field" value={batchFrom} onChange={e=>setBatchFrom(e.target.value)}>
                <option value="">选择要查找的旧网址…</option>
                {[...new Set(links.map(l=>l.url))].map(url=><option key={url} value={url}>{url.slice(0,170)}</option>)}
              </select>
            </label>
            <div className="tools-pair">
              <label className="field-label">操作
                <select className="field" value={batchAction} onChange={e=>setBatchAction(e.target.value as "replace"|"remove")}>
                  <option value="replace">全部替换目标 URL</option>
                  <option value="remove">删除选中范围的可点击链接</option>
                </select>
              </label>
              <label className="field-label">作用页面（all 或 1,3,5）
                <input className="field" value={batchPages} maxLength={500} onChange={e=>setBatchPages(e.target.value)}/>
              </label>
            </div>
            {batchAction==="replace"&&<label className="field-label">新网址
              <input className="field" type="url" maxLength={2048} value={batchTo} onChange={e=>setBatchTo(e.target.value)} placeholder="https://new.example.com/path"/>
            </label>}
            {(()=>{
              if(!batchFrom)return <p className="subtle">先选择一个现有网址。</p>;
              try{
                const {matches}=getBatchPlan();
                return <p className="subtle" role="status">预计匹配 {matches.length} 条可点击注释，涉及 {[...new Set(matches.map(x=>x.page))].length} 页。</p>;
              }catch(e){return <p className="subtle" role="alert">{err(e)}</p>;}
            })()}
            <button type="button" className="primary-button" disabled={busy||!batchFrom} onClick={()=>void applyBatch()}>
              预览命中后在工作副本中执行批量操作
            </button>
          </details>
          <label className="field-label">选择要编辑的超链接
            <select className="field" value={linkSelection} onChange={e=>{
              setLinkSelection(e.target.value);
              const link=links.find(x=>x.page+":"+x.annotationIndex===e.target.value);
              setLinkTarget(link?.url??"");
            }}>
              <option value="">请选择已有链接…</option>
              {links.map(link=><option key={link.page+":"+link.annotationIndex} value={link.page+":"+link.annotationIndex}>
                第 {link.page} 页 · {link.permitted?"HTTP(S)":"不支持的链接"} · {link.url.slice(0,100)}
              </option>)}
            </select>
          </label>
          {linkSelection&&(()=>{
            const chosen=links.find(link=>link.page+":"+link.annotationIndex===linkSelection);
            if(!chosen)return null;
            return <div className="panel">
              <p className="subtle">页面 {chosen.page} · 点击区域 PDF pt：x={chosen.rect.x}, y={chosen.rect.y}, w={chosen.rect.width}, h={chosen.rect.height}</p>
              <label className="field-label">链接目标 URL
                <input type="url" className="field" maxLength={2048} value={linkTarget} onChange={e=>setLinkTarget(e.target.value)} placeholder="https://example.com/article"/>
              </label>
              <div className="actions">
                <button className="primary-button" type="button" disabled={busy} onClick={()=>void stageLinkEdit(()=>editPdfExternalLink(bytes!,{action:"replace",page:chosen.page,annotationIndex:chosen.annotationIndex,url:linkTarget}))}>修改链接目标</button>
                <button className="secondary-button" type="button" disabled={busy} onClick={()=>void stageLinkEdit(()=>editPdfExternalLink(bytes!,{action:"remove",page:chosen.page,annotationIndex:chosen.annotationIndex}))}>移除可点击链接</button>
              </div>
            </div>;
          })()}
          <h3>新增可点击区域</h3>
          <p className="subtle">将一个不可见的超链接热区覆盖在页面现有文字或图形上。不会自动生成文字。PDF 坐标原点位于可见页面的左下角，旋转页面可能需要自行调整坐标。</p>
          <div className="tools-pair">
            <label className="field-label">目标页面
              <input className="field" type="number" min={1} max={pageCount} step={1} value={linkNewPage} onChange={e=>setLinkNewPage(Number(e.target.value))}/>
            </label>
            {(["x","y","width","height"] as const).map(key=><label className="field-label" key={key}>{key}（PDF pt）
              <input className="field" type="number" min={0} step={1} value={linkRect[key]} onChange={e=>setLinkRect(old=>({...old,[key]:Number(e.target.value)}))}/>
            </label>)}
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" disabled={busy}
              onClick={()=>setShowLinkPicker(current=>!current)}>
              {showLinkPicker?"关闭可视化框选":"在 PDF 页面上拖拽框选链接区域"}
            </button>
          </div>
          {showLinkPicker&&file&&<PdfLinkRegionPicker
            file={linkPreview??file} pageNumber={linkNewPage}
            onChoose={rect=>setLinkRect(rect)}
          />}
          <label className="field-label">新超链接网址（HTTPS / HTTP）
            <input className="field" type="url" maxLength={2048} value={linkNewUrl} onChange={e=>setLinkNewUrl(e.target.value)}/>
          </label>
          <div className="actions">
            <button className="primary-button" type="button" disabled={busy} onClick={()=>void stageLinkEdit(()=>addPdfExternalLink(bytes!,{page:linkNewPage,...linkRect,url:linkNewUrl}))}>
              添加可点击区域
            </button>
            <button className="secondary-button" type="button" disabled={busy||!linkDirty} onClick={()=>void saveLinkCopy()}>
              保存编辑结果
            </button>
          </div>
        </>}
        <p className="subtle"><strong>注意：</strong>编辑 PDF 后，原有数字签名可能失效；并非所有 PDF 阅读器以相同方式处理链接批注。某些链接也可能来自页面文本的自动识别，而不是 PDF 注释对象，本工具无法编辑这种自动识别结果。输出另存新文件，建议检查后再分享。</p>
      </>}
      {mode==="form"&&<>
        <p className="subtle">Fill existing standard AcroForm <strong>text fields</strong> only. This baseline editor is limited to printable English/ASCII input because the built-in PDF appearance font does not support Chinese glyphs. Complex XFA forms, digital signatures, checkboxes, radio buttons and handwriting are not supported. No form data is sent online.</p>
        <div className="actions"><button className="secondary-button" type="button" disabled={busy}
          onClick={()=>{void loadFields();}}>Find fillable text fields</button></div>
        {fields&&fields.length>0&&<>
          <div className="pdf-form-grid">
            {fields.map(field=><label key={field.name} className="field-label">{field.name}{field.readOnly?" (read-only)":""}
              <input type="text" className="field" maxLength={Math.min(500,field.maxLength??500)}
                disabled={field.readOnly} value={formValues[field.name]??field.text}
                onChange={e=>setFormValues(old=>({...old,[field.name]:e.target.value}))}/>
            </label>)}
          </div>
          <button className="primary-button" type="button" disabled={busy||!Object.keys(formValues).length}
            onClick={()=>{void savePdf("universal-box-filled-form.pdf",()=>fillPdfTextFields(bytes!,formValues));}}>
            Fill and save new PDF
          </button>
        </>}
      </>}
      {mode!=="form"&&<details className="pdf-dimensions"><summary>Page dimensions / 页面尺寸</summary>
        <div className="pdf-dimensions-list">{info.dimensions.slice(0,50).map(p=><span key={p.page}>P{p.page}: {p.width}×{p.height}pt · {p.rotation}°</span>)}</div>
        {pageCount>50&&<p className="subtle">Showing first 50 of {pageCount} pages.</p>}
      </details>}
      <div className="pdf-mini-original"><p className="subtle">{mode==="links"&&linkPreview?"Working copy preview; original is unchanged.":"Original file preview — output is saved as a new copy."}</p>
        <PdfPagePreview file={mode==="links"?(linkPreview??file):file} onPickPage={page=>{
          if(mode==="links"){setLinkNewPage(page);}else{setCropPage(String(page));setMode("crop");}
        }}/></div>
    </>}
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
