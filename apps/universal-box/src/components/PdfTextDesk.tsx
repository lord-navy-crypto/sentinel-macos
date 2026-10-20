import {useEffect,useMemo,useState} from "react";
import {getDocument,GlobalWorkerOptions} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {exportFile} from "../lib/output";

GlobalWorkerOptions.workerSrc=pdfWorker;
type ExtractedPage={page:number;text:string};
const MAX_BYTES=25_000_000;
const MAX_PAGES=300;
const MAX_CHARS=1_000_000;

/**
 * All PDF parsing occurs in the local PDF.js worker. Image-only/scanned documents
 * need OCR and are intentionally not silently represented as searchable text.
 */
export default function PdfTextDesk({file}:{file:File}){
 const [pages,setPages]=useState<ExtractedPage[]>([]);
 const [query,setQuery]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setPages([]);setQuery("");setStatus("");setBusy(false);},[file]);
 const matches=useMemo(()=>{
   const q=query.trim().toLocaleLowerCase();
   if(!q)return [];
   return pages.map(({page,text})=>{
     const hay=text.toLocaleLowerCase();
     let pos=0,hits=0;
     while((pos=hay.indexOf(q,pos))>=0&&hits<999){hits++;pos+=q.length;}
     return {page,hits};
   }).filter(row=>row.hits>0);
 },[pages,query]);
 const allText=pages.map(p=>"===== Page "+p.page+" =====\n"+p.text).join("\n\n");

 async function extract(){
  if(file.size>MAX_BYTES){setStatus("Text extraction accepts PDFs up to 25 MB.");return;}
  setBusy(true);setPages([]);setStatus("Extracting PDF text locally...");
  let pdf:Awaited<ReturnType<typeof getDocument>["promise"]>|undefined;
  try{
   pdf=await getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   if(pdf.numPages>MAX_PAGES)throw Error("Text extraction supports up to "+MAX_PAGES+" pages.");
   const items:ExtractedPage[]=[];
   let total=0;
   for(let index=1;index<=pdf.numPages;index++){
     const page=await pdf.getPage(index);
     const content=await page.getTextContent();
     const text=content.items.map(part=>{
        if(!("str" in part))return "";
        return part.str+(part.hasEOL?"\n":" ");
     }).join("").trim();
     total+=text.length;
     if(total>MAX_CHARS)throw Error("Extracted text exceeds 1,000,000 characters.");
     items.push({page:index,text});
   }
   setPages(items);
   const empty=items.filter(x=>!x.text).length;
   setStatus("Extracted "+items.length+" page(s), "+total.toLocaleString()+" characters. "+(empty?"Text missing from "+empty+" page(s); scanned pages may need OCR.":"No server upload."));
  }catch(error){setPages([]);setStatus("PDF text extraction failed: "+String(error instanceof Error?error.message:error));}
  finally{if(pdf)await pdf.destroy().catch(()=>{});setBusy(false);}
 }
 async function save(format:"txt"|"md"){
   try{
     const text=format==="md"?pages.map(p=>"## Page "+p.page+"\n\n"+p.text).join("\n\n"):allText;
     const ok=await exportFile("daily-desk-pdf-text."+format,text);
     setStatus(ok?"Saved locally as ."+format+".":"Save cancelled.");
   }catch(error){setStatus("Export failed: "+String(error));}
 }
 return <section className="panel">
  <h3>PDF text extraction & search</h3>
  <p className="subtle">Read selectable PDF text, find matching pages and export locally as text or Markdown. Does not perform OCR or alter the original PDF.</p>
  <button type="button" className="secondary-button" disabled={busy||file.size>MAX_BYTES} onClick={()=>{void extract();}}>{busy?"Extracting…":"Extract text from this PDF"}</button>
  {pages.length>0&&<>
    <div className="actions">
      <label className="field-label" htmlFor="pdf-text-search">Find in PDF</label>
      <input id="pdf-text-search" className="field" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search term"/>
      <button className="secondary-button" type="button" onClick={()=>{void save("txt");}}>Save TXT</button>
      <button className="secondary-button" type="button" onClick={()=>{void save("md");}}>Save Markdown</button>
    </div>
    {query.trim()&&<p className="subtle">{matches.reduce((sum,m)=>sum+m.hits,0)} matches on {matches.length} page(s): {matches.slice(0,30).map(m=>"p."+m.page+" ("+m.hits+")").join(", ")||"none"}</p>}
    <label className="field-label" htmlFor="pdf-extracted-text">Extracted content (first 20,000 characters shown)</label>
    <textarea id="pdf-extracted-text" className="field text-editor" rows={12} readOnly value={allText.slice(0,20_000)}/>
    {allText.length>20_000&&<p className="subtle">Preview shortened for responsiveness. Saved file includes all {allText.length.toLocaleString()} characters.</p>}
  </>}
  {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}