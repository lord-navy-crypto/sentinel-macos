import {type ChangeEvent,useState} from "react";
import {exportFile} from "../lib/output";
import {
  type PdfBasicInfo,type PdfMetadataEdit,type PdfCropMargins,type PdfFormText,type PageFormat,
  inspectPdfEveryday,savePdfMetadata,cropPdfPages,insertBlankPdfPages,inspectPdfTextFields,fillPdfTextFields,exportSelectedPdfPages,
} from "../lib/pdfEveryday";
import PdfPagePreview from "./PdfPagePreview";
import {
 type PdfExternalLink,inspectPdfExternalLinks,editPdfExternalLink,addPdfExternalLink,
} from "../lib/pdfLinks";

export type PdfEverydayMode="metadata"|"crop"|"blank"|"form"|"pages"|"links";
const tabs:{id:PdfEverydayMode;label:string}[]=[
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
  const [fields,setFields]=useState<PdfFormText[]|null>(null);
  const [links,setLinks]=useState<PdfExternalLink[]|null>(null);
  const [linkTarget,setLinkTarget]=useState("");
  const [linkSelection,setLinkSelection]=useState("");
  const [linkNewPage,setLinkNewPage]=useState(1);
  const [linkRect,setLinkRect]=useState({x:36,y:36,width:170,height:25});
  const [linkNewUrl,setLinkNewUrl]=useState("https://example.com/");
  const [linkDirty,setLinkDirty]=useState(false);
  const [linkPreview,setLinkPreview]=useState<File|null>(null);
  const [formValues,setFormValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  async function importPdf(event:ChangeEvent<HTMLInputElement>){
    const selected=event.target.files?.[0];event.target.value="";
    setFile(null);setBytes(null);setInfo(null);setFields(null);setFormValues({});
    setLinks(null);setLinkSelection("");setLinkDirty(false);setLinkPreview(null);
    setMetadata(EMPTY_METADATA);setPageExpression("1");setStatus("");
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
      setBytes(output);setLinks(next);setLinkSelection("");
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
  const pageCount=info?.pages??0;
  return <section className="panel pdf-everyday-desk">
    <p className="eyebrow">UNIVERSAL BOX · FREE PDF EVERYDAY EDITORS</p>
    <h2>PDF Mini Editor / PDF 日常编辑器</h2>
    <p className="subtle">Free PDF utilities that process a file locally: edit properties, crop visible margins, insert blank pages, fill standard text forms, or extract and reorder pages. No paid plan, cloud upload or forced registration.</p>
    <div className="pill-row" role="group" aria-label="PDF mini editor modes">
      {tabs.map(tab=><button key={tab.id} type="button" className={tab.id===mode?"pill active-pill":"pill"}
        aria-pressed={tab.id===mode} onClick={()=>{setMode(tab.id);setStatus("");}}>{tab.label}</button>)}
    </div>
    <label className="field-label" htmlFor="mini-pdf-input">Select PDF (≤15 MB, up to 200 pages)</label>
    <input type="file" id="mini-pdf-input" className="field" accept=".pdf,application/pdf" onChange={e=>{void importPdf(e);}}/>
    {info&&file&&<>
      <div className="metrics" aria-label="Imported PDF document information">
        <span><strong>{pageCount}</strong> pages</span>
        <span><strong>{(file.size/1_000_000).toFixed(2)}</strong> MB</span>
        <span><strong>{Math.round(info.dimensions[0].width)}×{Math.round(info.dimensions[0].height)}</strong> pt first page</span>
      </div>
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
          <input className="field" type="text" maxLength={600} value={pageExpression} onChange={e=>setPageExpression(e.target.value)} placeholder="3,1-2,5"/>
        </label>
        <button className="primary-button" type="button" disabled={busy}
          onClick={()=>{void savePdf("universal-box-selected-pages.pdf",()=>exportSelectedPdfPages(bytes!,pageExpression));}}>
          Extract / reorder and save new PDF
        </button>
      </>}
      {mode==="links"&&<>
        <p className="subtle"><strong>PDF Hyperlink Studio · 可点击链接编辑。</strong> 只处理标准外部 URI 链接批注，可查看、替换、移除或创建透明的可点击区域。不会修改页面上肉眼看见的文字，也不会自动打开 PDF 中的任何网址。</p>
        <div className="actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={()=>void inspectLinks()}>扫描现有 PDF 超链接</button>
          <button type="button" className="primary-button" disabled={busy||!linkDirty} onClick={()=>void saveLinkCopy()}>另存已修改的 PDF</button>
        </div>
        {links&&<>
          <p className="subtle">检测到 {links.length} 条可编辑的外部链接。非 HTTP(S) 链接会标为「不安全/不支持」，仍可移除或替换，但不会执行它们。所有修改在本地内存累积；离开前请另存。</p>
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
