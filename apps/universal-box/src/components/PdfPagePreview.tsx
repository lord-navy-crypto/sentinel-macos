import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Vite bundles the worker locally: no CDN or file upload.
GlobalWorkerOptions.workerSrc = pdfWorker;

function CanvasPage({ page, width }: { page: PDFPageProxy; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) { setError("Canvas is unavailable."); return; }
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    async function renderPage() {
      if (!context || !element) return;
      const base = page.getViewport({scale:1});
      const scale = Math.min(2.5, width/base.width);
      const viewport = page.getViewport({scale});
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.max(1, Math.floor(viewport.width*ratio));
      element.height = Math.max(1, Math.floor(viewport.height*ratio));
      element.style.width = Math.floor(viewport.width)+"px";
      element.style.height = Math.floor(viewport.height)+"px";
      task = page.render({canvasContext:context,viewport,transform:[ratio,0,0,ratio,0,0]});
      await task.promise;
      if (!cancelled) setError("");
    }
    void renderPage().catch((problem: unknown) => {
      if (!cancelled) setError("Page preview error: "+String(problem));
    });
    return () => {cancelled=true;task?.cancel();};
  }, [page,width]);

  return <div className="pdf-canvas-wrap"><canvas ref={canvas} aria-label="Rendered PDF page"/>{error&&<p role="status" className="subtle">{error}</p>}</div>;
}

export default function PdfPagePreview({ file, onPickPage }: { file: File; onPickPage: (page: number) => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [selected, setSelected] = useState(1);
  const [batch, setBatch] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Loading PDF pages locally...");
  const [activePage, setActivePage] = useState<PDFPageProxy | null>(null);

  useEffect(() => {
    let active=true;
    let loading: ReturnType<typeof getDocument> | null=null;
    setPdf(null);setPages([]);setSelected(1);setBatch(0);setActivePage(null);
    if(file.size>25_000_000){setStatus("Preview limit: 25 MB. Other PDF operations may still work.");return;}
    setStatus("Reading PDF pages...");
    void (async()=>{
      try {
        loading=getDocument({data:new Uint8Array(await file.arrayBuffer())});
        const document=await loading.promise;
        if(!active){await document.destroy();return;}
        setPdf(document);
        setStatus(document.numPages+" pages loaded. Rendering thumbnails locally.");
      }catch(error){if(active)setStatus("Preview unavailable: "+String(error));}
    })();
    return ()=>{active=false;void loading?.destroy().catch(()=>{});};
  },[file]);

  useEffect(()=>{
    if(!pdf)return;
    let active=true;
    setPages([]);
    void (async()=>{
      const chosen=[];
      for(let i=batch*8+1;i<=Math.min(pdf.numPages,batch*8+8);i++){
        try{const page=await pdf.getPage(i);if(!active)return;chosen.push(page);}
        catch{ /* malformed page is skipped */ }
      }
      if(active)setPages(chosen);
    })();
    return()=>{active=false;};
  },[pdf,batch]);

  useEffect(()=>{
    if(!pdf)return;
    let active=true;
    setActivePage(null);
    void pdf.getPage(selected).then(p=>{if(active)setActivePage(p);}).catch(e=>{if(active)setStatus("Cannot show selected page: "+String(e));});
    return()=>{active=false;};
  },[pdf,selected]);

  if(!pdf)return <section className="pdf-preview"><p className="subtle" role="status">{status}</p></section>;
  const totalBatches=Math.ceil(pdf.numPages/8);
  return <section className="pdf-preview">
    <div className="section-heading"><div><h3>PDF page preview</h3><p className="subtle">{pdf.numPages} pages · no server upload · click a thumbnail to select its page for split/rotate</p></div></div>
    <div className="pdf-thumbnail-grid">
      {pages.map(page=><button type="button" key={page.pageNumber} className={selected===page.pageNumber?"pdf-thumbnail selected":"pdf-thumbnail"}
        onClick={()=>{setSelected(page.pageNumber);onPickPage(page.pageNumber);}}>
        <CanvasPage page={page} width={135}/><span>Page {page.pageNumber}</span>
      </button>)}
    </div>
    <div className="actions spaced">
      <button type="button" className="secondary-button" disabled={batch===0} onClick={()=>setBatch(index=>Math.max(0,index-1))}>Previous 8</button>
      <span className="subtle">Set {batch+1} of {totalBatches}</span>
      <button type="button" className="secondary-button" disabled={batch>=totalBatches-1} onClick={()=>setBatch(index=>Math.min(totalBatches-1,index+1))}>Next 8</button>
    </div>
    <div className="actions">
      <strong>Page {selected}</strong>
      <button className="secondary-button" type="button" onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>Zoom out</button>
      <button className="secondary-button" type="button" onClick={()=>setZoom(z=>Math.min(2,z+.25))}>Zoom in</button>
      <span className="subtle">{Math.round(zoom*100)}%</span>
    </div>
    <div className="pdf-main-page">{activePage ? <CanvasPage page={activePage} width={Math.floor(520*zoom)}/> : <p className="subtle">Rendering selected page...</p>}</div>
    <p className="subtle">{status}. Thumbnail preview loads only 8 pages at a time to limit memory use.</p>
  </section>;
}
