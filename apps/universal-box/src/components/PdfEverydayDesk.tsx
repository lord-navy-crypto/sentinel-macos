import {type ChangeEvent,useState} from "react";
import {exportFile} from "../lib/output";
import {
  type PdfBasicInfo,type PdfMetadataEdit,type PdfCropMargins,type PdfFormText,type PageFormat,
  inspectPdfEveryday,savePdfMetadata,cropPdfPages,insertBlankPdfPages,inspectPdfTextFields,fillPdfTextFields,exportSelectedPdfPages,
} from "../lib/pdfEveryday";
import PdfPagePreview from "./PdfPagePreview";

export type PdfEverydayMode="metadata"|"crop"|"blank"|"form"|"pages";
const tabs:{id:PdfEverydayMode;label:string}[]=[
  {id:"metadata",label:"Properties · 文件属性"},
  {id:"crop",label:"Crop margins · 裁边"},
  {id:"blank",label:"Insert pages · 插入空白页"},
  {id:"form",label:"Fill text forms · 填写表单"},
  {id:"pages",label:"Extract & reorder · 提取排序"},
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
  const [formValues,setFormValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  async function importPdf(event:ChangeEvent<HTMLInputElement>){
    const selected=event.target.files?.[0];event.target.value="";
    setFile(null);setBytes(null);setInfo(null);setFields(null);setFormValues({});
    setMetadata(EMPTY_METADATA);setPageExpression("1");setStatus("");
    if(!selected)return;
    setBusy(true);
    try{
      if(!/\.pdf$/iu.test(selected.name)||selected.size>15_000_000)
        throw Error("Choose an unencrypted .pdf file up to 15 MB.");
      const content=new Uint8Array(await selected.arrayBuffer());
      const inspected=await inspectPdfEveryday(content);
      setFile(selected);setBytes(content);setInfo(inspected);
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
      <div className="pdf-mini-original"><p className="subtle">Original file preview — output is saved as a new copy.</p>
        <PdfPagePreview file={file} onPickPage={page=>{setCropPage(String(page));setMode("crop");}}/></div>
    </>}
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
