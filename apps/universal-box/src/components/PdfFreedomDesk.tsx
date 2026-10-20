import {type ChangeEvent,useEffect,useState} from "react";
import {type PdfAnchor,type PdfFreedomOptions,applyPdfFreedom} from "../lib/pdfFreedom";
import {exportFile} from "../lib/output";
import PdfPagePreview from "./PdfPagePreview";

type Operation="stamp"|"watermark"|"numbers"|"image";
const anchors:{id:PdfAnchor;label:string}[]=[
  {id:"top-left",label:"Top left"},{id:"top-center",label:"Top centre"},{id:"top-right",label:"Top right"},
  {id:"center",label:"Centre"},
  {id:"bottom-left",label:"Bottom left"},{id:"bottom-center",label:"Bottom centre"},{id:"bottom-right",label:"Bottom right"},
];
const inputName=(file:File)=>file.name.replace(/\.pdf$/iu,"").replace(/[^a-z0-9_.-]/giu,"-").slice(0,70)||"edited";
export default function PdfFreedomDesk({file,pageCount}:{file:File|null;pageCount:number}){
  const [operation,setOperation]=useState<Operation>("stamp");
  const [pageRange,setPageRange]=useState("all");
  const [text,setText]=useState("APPROVED");
  const [prefix,setPrefix]=useState("Page ");
  const [suffix,setSuffix]=useState("");
  const [numberStart,setNumberStart]=useState("1");
  const [fontSize,setFontSize]=useState(22);
  const [color,setColor]=useState("#365e91");
  const [opacity,setOpacity]=useState(.75);
  const [anchor,setAnchor]=useState<PdfAnchor>("bottom-right");
  const [fontFile,setFontFile]=useState<File|null>(null);
  const [imageFile,setImageFile]=useState<File|null>(null);
  const [imageWidth,setImageWidth]=useState(25);
  const [result,setResult]=useState<Uint8Array|null>(null);
  const [previewFile,setPreviewFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  useEffect(()=>{
    setResult(null);setPreviewFile(null);setStatus("");
  },[file,operation,pageRange,text,prefix,suffix,numberStart,fontSize,color,opacity,anchor,fontFile,imageFile,imageWidth]);

  async function makeOutput():Promise<Uint8Array>{
    if(!file)throw new Error("Select a PDF first.");
    if(pageCount<1)throw new Error("PDF page count not available. Choose a readable unencrypted PDF.");
    if(file.size>25_000_000)throw new Error("PDF input limit is 25 MB.");
    const pages=pageRange.trim();
    const common={pages,opacity,anchor};
    let options:PdfFreedomOptions;
    if(operation==="image"){
      if(!imageFile)throw new Error("Select a PNG or JPEG image for the overlay.");
      if(imageFile.size>8_000_000)throw new Error("Image input limit is 8 MB.");
      const filename=imageFile.name.toLowerCase();
      const imageType=/\.(png)$/u.test(filename)?"png":/\.(jpe?g)$/u.test(filename)?"jpg":null;
      if(!imageType)throw new Error("Only PNG or JPEG images are supported.");
      options={mode:"image",imageBytes:new Uint8Array(await imageFile.arrayBuffer()),imageType,widthPercent:imageWidth,...common};
    }else{
      let fontBytes:Uint8Array|undefined;
      if(fontFile){
        if(!/\.(ttf|otf)$/iu.test(fontFile.name))throw new Error("Choose a TTF or OTF font file.");
        if(fontFile.size>12_000_000)throw new Error("Font limit is 12 MB.");
        fontBytes=new Uint8Array(await fontFile.arrayBuffer());
      }
      const ink={...common,fontSize,color,fontBytes};
      if(operation==="numbers"){
        const start=Number(numberStart);
        if(!/^\d+$/u.test(numberStart.trim()))throw new Error("Page number must be a whole number.");
        options={mode:"numbers",prefix,suffix,start,...ink};
      }else{
        options={mode:operation,text,...ink};
      }
    }
    return applyPdfFreedom(new Uint8Array(await file.arrayBuffer()),options);
  }
  async function execute(save:boolean){
    if(busy)return;
    setBusy(true);setStatus("");
    try{
      const bytes=await makeOutput();
      if(bytes.length>20_000_000)throw new Error("Edited PDF exceeds the current 20 MB export limit. Try a smaller source or image.");
      setResult(bytes);
      setPreviewFile(new File([new Uint8Array(bytes)],"daily-desk-preview.pdf",{type:"application/pdf"}));
      if(save){
        const ok=await exportFile(inputName(file!)+"-"+operation+".pdf",bytes);
        setStatus(ok?"Saved a new edited PDF locally. Your original was not modified.":"Save cancelled; preview is still available.");
      }else setStatus("Edited PDF preview is ready. Inspect pages below, then save.");
    }catch(error){setResult(null);setPreviewFile(null);setStatus("PDF editing failed: "+String(error instanceof Error?error.message:error));}
    finally{setBusy(false);}
  }
  async function exportPreview(){
    if(!file||!result)return;
    try{
      const ok=await exportFile(inputName(file)+"-"+operation+".pdf",result);
      setStatus(ok?"Saved a new edited PDF locally. Original unchanged.":"Save cancelled.");
    }catch(error){setStatus("PDF save failed: "+String(error));}
  }
  function chooseFile(event:ChangeEvent<HTMLInputElement>,kind:"font"|"image"){
    const file=event.target.files?.[0]??null;
    if(kind==="font")setFontFile(file);else setImageFile(file);
    event.target.value="";
  }

  return <section className="panel">
    <p className="eyebrow">PDF FREEDOM STUDIO · 100% LOCAL</p>
    <h3>Add text, watermarks, numbers and images for free</h3>
    <p className="subtle">No subscription or file upload. Adds a visible new layer without removing underlying PDF content. Save a new file; never overwrite the source. It is not a redaction or existing-text editor.</p>
    <div className="pill-row compact" role="group" aria-label="PDF decoration mode">
      {([["stamp","Add text"],["watermark","Watermark"],["numbers","Page numbers"],["image","Image / signature"]] as const).map(([key,label])=>
        <button type="button" className={operation===key?"pill active-pill":"pill"} key={key} onClick={()=>{setOperation(key);setOpacity(key==="watermark"?.2:.75);setAnchor(key==="watermark"?"center":"bottom-right");setText(key==="watermark"?"DRAFT":"APPROVED");}}>{label}</button>)}
    </div>
    <div className="tools-pair">
      <label className="field-label">Pages: all or 1-3,5,8- <input className="field" value={pageRange} onChange={e=>setPageRange(e.target.value)} maxLength={250}/></label>
      {operation!=="watermark"&&<label className="field-label">Position
        <select className="field" value={anchor} onChange={e=>setAnchor(e.target.value as PdfAnchor)}>
          {anchors.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
      </label>}
    </div>
    {(operation==="stamp"||operation==="watermark")&&
      <label className="field-label" htmlFor="pdf-free-text">Text to add
        <input id="pdf-free-text" className="field" style={{width:"100%"}} value={text} maxLength={120} onChange={e=>setText(e.target.value)} placeholder="APPROVED, Draft, or a short note"/>
      </label>}
    {operation==="numbers"&&<div className="tools-pair">
      <label className="field-label">Prefix <input className="field" maxLength={40} value={prefix} onChange={e=>setPrefix(e.target.value)}/></label>
      <label className="field-label">Starting number <input className="field" type="number" min={0} max={100000} step={1} value={numberStart} onChange={e=>setNumberStart(e.target.value)}/></label>
      <label className="field-label">Suffix <input className="field" maxLength={40} value={suffix} onChange={e=>setSuffix(e.target.value)}/></label>
    </div>}
    {operation==="image"&&<div className="tools-pair">
      <label className="field-label">PNG/JPEG signature or picture
        <input className="field" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={e=>chooseFile(e,"image")}/>
      </label>
      <label className="field-label">Image width: {imageWidth}% of page
        <input type="range" min={5} max={85} step={5} value={imageWidth} onChange={e=>setImageWidth(Number(e.target.value))}/>
      </label>
    </div>}
    {operation!=="image"&&<div className="tools-pair">
      <label className="field-label">Font size: {fontSize} pt <input type="range" min={8} max={120} step={2} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}/></label>
      <label className="field-label">Text colour <input type="color" className="field" value={color} onChange={e=>setColor(e.target.value)}/></label>
      <label className="field-label">Optional local TTF / OTF font for Chinese and Unicode
        <input className="field" type="file" accept=".ttf,.otf" onChange={e=>chooseFile(e,"font")}/>
        {fontFile&&<span className="subtle">{fontFile.name} · <button className="secondary-button" type="button" onClick={()=>setFontFile(null)}>Remove font</button></span>}
      </label>
    </div>}
    <label className="field-label">Opacity · {Math.round(opacity*100)}%
      <input type="range" min={.05} max={1} step={.05} value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/>
    </label>
    <p className="subtle">{operation==="watermark"?"The watermark is diagonally centred and scaled to fit pages.":operation==="numbers"?"Numbering proceeds through selected pages in ascending order.":"The PDF coordinate layer may behave differently on existing rotated pages; inspect the generated preview."}</p>
    <div className="actions">
      <button className="primary-button" type="button" disabled={!file||busy||pageCount===0} onClick={()=>{void execute(false);}}>{busy?"Processing PDF…":"Generate edited preview"}</button>
      <button className="secondary-button" type="button" disabled={!file||busy||pageCount===0} onClick={()=>{void execute(true);}}>Edit & save PDF</button>
      <button className="secondary-button" type="button" disabled={!result||busy} onClick={()=>{void exportPreview();}}>Save preview copy</button>
    </div>
    {status&&<p role="status" className="subtle">{status}</p>}
    {previewFile&&<PdfPagePreview file={previewFile} onPickPage={()=>{}}/>}
  </section>;
}
