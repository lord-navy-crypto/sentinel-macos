import {type ChangeEvent,useState} from "react";
import JSZip from "jszip";
import {getDocument,GlobalWorkerOptions} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {exportFile} from "../lib/output";
import {parsePdfSelection} from "../lib/pdfFreedom";
import {imagesToPdf,type ImagePdfInput,type ImagePdfPageSize} from "../lib/pdfConverters";

GlobalWorkerOptions.workerSrc=pdfWorker;
type Conversion="images-pdf"|"pdf-images";
type ImageOutput="png"|"jpg";
const safeName=(value:string)=>value.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]/gu,"-").slice(0,60)||"document";
export default function PdfConvertDesk({pdfFile,pageCount}:{pdfFile:File|null;pageCount:number}){
  const [conversion,setConversion]=useState<Conversion>("images-pdf");
  const [images,setImages]=useState<File[]>([]);
  const [pageSize,setPageSize]=useState<ImagePdfPageSize>("a4");
  const [range,setRange]=useState("1");
  const [format,setFormat]=useState<ImageOutput>("png");
  const [scale,setScale]=useState(1.5);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  function chooseImages(event:ChangeEvent<HTMLInputElement>){
    const selected=Array.from(event.target.files||[]);
    setImages(selected);setStatus(selected.length>12?"Select at most 12 images. No files have been converted yet.":"");
    event.target.value="";
  }
  async function convertToPdf(){
    if(images.length<1||images.length>12)throw new Error("Choose 1–12 images.");
    const input:ImagePdfInput[]=[];
    for(const file of images){
      if(file.size>8_000_000)throw new Error(file.name+" exceeds the 8 MB per-image limit.");
      const mime=/\.png$/iu.test(file.name)?"image/png":/\.jpe?g$/iu.test(file.name)?"image/jpeg":null;
      if(!mime)throw new Error("Only PNG and JPEG files are accepted.");
      input.push({name:file.name,mime,bytes:new Uint8Array(await file.arrayBuffer())});
    }
    const bytes=await imagesToPdf(input,pageSize);
    const saved=await exportFile("daily-desk-images.pdf",bytes);
    setStatus(saved?"Saved "+input.length+" image page(s) into a new local PDF.":"Save cancelled.");
  }
  async function convertToImages(){
    if(!pdfFile)throw new Error("Choose a PDF above first.");
    if(pdfFile.size>25_000_000||pageCount>300)throw new Error("PDF must be at most 25 MB / 300 pages.");
    const pages=parsePdfSelection(range,pageCount);
    if(pages.length>12)throw new Error("Choose at most 12 pages per ZIP to limit memory use.");
    const task=getDocument({data:new Uint8Array(await pdfFile.arrayBuffer())});
    let document:Awaited<typeof task.promise>|undefined;
    try{
      document=await task.promise;
      const zip=new JSZip();
      let totalBytes=0;
      for(const pageIndex of pages){
        const page=await document.getPage(pageIndex+1);
        const viewport=page.getViewport({scale});
        const width=Math.max(1,Math.round(viewport.width)),height=Math.max(1,Math.round(viewport.height));
        if(width*height>4_000_000)throw new Error("A page exceeds the 4-million-pixel rasterization limit. Reduce rendering scale.");
        const canvas=window.document.createElement("canvas");
        canvas.width=width;canvas.height=height;
        const context=canvas.getContext("2d");
        if(!context)throw new Error("Canvas is not available in this WebView.");
        if(format==="jpg"){
          context.fillStyle="#ffffff";context.fillRect(0,0,width,height);
        }
        await page.render({canvasContext:context,viewport}).promise;
        const mime=format==="png"?"image/png":"image/jpeg";
        const blob=await new Promise<Blob>((resolve,reject)=>
          canvas.toBlob(value=>value?resolve(value):reject(new Error("Image encoding failed.")),mime,format==="jpg"?.88:undefined));
        if(blob.type!==mime)throw new Error("Your WebView does not support this output format.");
        const bytes=new Uint8Array(await blob.arrayBuffer());
        totalBytes+=bytes.length;
        if(totalBytes>18_000_000)throw new Error("Rendered images exceed 18 MB. Reduce scale or export fewer pages.");
        const name=safeName(pdfFile.name)+"-page-"+String(pageIndex+1).padStart(3,"0")+"."+format;
        zip.file(name,bytes);
        canvas.width=0;canvas.height=0;
      }
      const archive=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:3}});
      if(archive.length>20_000_000)throw new Error("ZIP exceeds the 20 MB output limit.");
      const saved=await exportFile(safeName(pdfFile.name)+"-"+format+"-pages.zip",archive);
      setStatus(saved?"Exported "+pages.length+" page image(s) as a ZIP locally.":"Save cancelled.");
    }finally{
      await document?.destroy().catch(()=>{});
    }
  }
  async function convert(){
    if(busy)return;
    setBusy(true);setStatus("");
    try{
      if(conversion==="images-pdf")await convertToPdf();else await convertToImages();
    }catch(error){setStatus("Conversion failed: "+String(error instanceof Error?error.message:error));}
    finally{setBusy(false);}
  }
  return <section className="panel">
    <p className="eyebrow">FREE LOCAL PDF CONVERTERS · ZERO UPLOAD</p>
    <h3>Image ↔ PDF conversion</h3>
    <p className="subtle">Convert common images into a PDF or render PDF pages into an image ZIP. All processing stays on this device. No watermarks or daily limits from Daily Desk.</p>
    <div className="pill-row compact" role="group" aria-label="PDF conversion type">
      <button type="button" className={conversion==="images-pdf"?"pill active-pill":"pill"} onClick={()=>{setConversion("images-pdf");setStatus("");}}>PNG/JPEG → PDF</button>
      <button type="button" className={conversion==="pdf-images"?"pill active-pill":"pill"} onClick={()=>{setConversion("pdf-images");setStatus("");}}>PDF pages → images ZIP</button>
    </div>
    {conversion==="images-pdf"?<>
      <label className="field-label" htmlFor="images-pdf-choose">Select 1–12 PNG/JPEG images (8 MB each)</label>
      <input id="images-pdf-choose" className="field" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple onChange={chooseImages}/>
      {images.length>0&&<p className="subtle">{images.length} selected, in file-selection order: {images.map(f=>f.name).join(" · ")}</p>}
      <label className="field-label" htmlFor="images-pdf-size">Page size</label>
      <select id="images-pdf-size" className="field" value={pageSize} onChange={e=>setPageSize(e.target.value as ImagePdfPageSize)}>
        <option value="a4">A4 — white page with margin</option>
        <option value="letter">US Letter — white page with margin</option>
        <option value="fit">Fit each image aspect ratio</option>
      </select>
      <p className="subtle">Image order follows your file picker. Layout preserves each image's proportions. EXIF orientation may depend on how a source JPEG was encoded.</p>
    </>:<>
      <p className="subtle">Choose a PDF using the file picker directly above, then select pages below. A PDF's selectable text becomes raster pixels in exported images.</p>
      <div className="tools-pair">
        <label className="field-label">Pages · e.g. 1-3,5 (max 12)
          <input className="field" value={range} maxLength={160} onChange={e=>setRange(e.target.value)}/>
        </label>
        <label className="field-label">Output format
          <select className="field" value={format} onChange={e=>setFormat(e.target.value as ImageOutput)}>
            <option value="png">PNG (lossless)</option><option value="jpg">JPEG (smaller)</option>
          </select>
        </label>
        <label className="field-label">Render scale · {scale.toFixed(2)}×
          <input type="range" min="0.75" max="2" step="0.25" value={scale} onChange={e=>setScale(Number(e.target.value))}/>
        </label>
      </div>
      <p className="subtle">Each rendered page is capped at 4 million pixels; combined image bytes up to 18 MB per ZIP. Existing scanned PDFs remain raster images (no OCR).</p>
    </>}
    <div className="actions"><button className="primary-button" type="button" disabled={busy||(conversion==="images-pdf"?images.length===0:!pdfFile||pageCount<1)}
      onClick={()=>{void convert();}}>{busy?"Converting locally…":conversion==="images-pdf"?"Create & save PDF":"Export images as ZIP"}</button></div>
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
