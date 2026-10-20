import { type ChangeEvent, useEffect, useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { exportFile } from "../lib/output";
import PdfPagePreview from "./PdfPagePreview";
import PdfTextDesk from "./PdfTextDesk";
import PdfFreedomDesk from "./PdfFreedomDesk";
import PdfConvertDesk from "./PdfConvertDesk";
import { parsePdfOrder } from "../lib/pdfPageOrder";
import BatchImageDesk from "./BatchImageDesk";
import ImageAnnotationDesk from "./ImageAnnotationDesk";
import InteractiveCropDesk from "./InteractiveCropDesk";

export type FileTab = "pdf" | "images" | "word";
type PdfMode = "merge" | "split" | "rotate" | "organize" | "compress" | "decorate" | "convert";
type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeName(value: string): string {
  return value.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 60) || "output";
}

function parsePages(value: string, count: number): number[] {
  const chosen = new Set<number>();
  if (count < 1) return [];
  for (const raw of value.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const match = /^(\d+)(?:-(\d*))?$/.exec(part);
    if (!match) throw new Error("Use page numbers such as 1-3,5,7-");
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : match[2] === "" ? count : Number(match[2]);
    if (start < 1 || end > count || start > end) throw new Error("Page range is out of bounds");
    for (let i = start; i <= end; i += 1) chosen.add(i - 1);
  }
  if (chosen.size === 0) throw new Error("Select at least one page");
  return [...chosen].sort((a, b) => a - b);
}

/** Convert Mammoth's inert HTML output to editable Markdown without injecting HTML. */
function htmlToMarkdown(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const content = Array.from(el.childNodes).map(render).join("");
    if (/^h[1-6]$/.test(tag)) return "\n" + "#".repeat(Number(tag[1])) + " " + content.trim() + "\n\n";
    if (tag === "p" || tag === "div") return content.trim() + "\n\n";
    if (tag === "strong" || tag === "b") return "**" + content + "**";
    if (tag === "em" || tag === "i") return "*" + content + "*";
    if (tag === "code") return "`" + content + "`";
    if (tag === "br") return "\n";
    if (tag === "li") return "- " + content.trim() + "\n";
    if (tag === "ul" || tag === "ol") return "\n" + content + "\n";
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      return /^https?:\/\//i.test(href) ? "[" + content + "](" + href.replace(/[()]/g, "") + ")" : content;
    }
    if (tag === "img") return el.getAttribute("alt") ?? "[embedded image omitted]";
    return content;
  };
  return Array.from(parsed.body.childNodes).map(render).join("").replace(/\n{3,}/g,"\n\n").trim();
}

export default function FileDesk({ onSendToWriting, initialTab = "pdf", initialPdfMode = "merge" }: { onSendToWriting?: (markdown: string) => void; initialTab?: FileTab; initialPdfMode?: PdfMode }) {
  const [tab, setTab] = useState<FileTab>(initialTab);
  const [pdfMode, setPdfMode] = useState<PdfMode>(initialPdfMode);
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState("1-");
  const [rotation, setRotation] = useState(90);
  const [splitEach, setSplitEach] = useState(false);
  const [pdfCount, setPdfCount] = useState(0);
  const [image, setImage] = useState<File | null>(null);
  const [imageMode, setImageMode] = useState<"convert" | "crop">("convert");
  const [cropLeft, setCropLeft] = useState(0);
  const [cropTop, setCropTop] = useState(0);
  const [cropWidth, setCropWidth] = useState(100);
  const [cropHeight, setCropHeight] = useState(100);
  const [caption, setCaption] = useState("");
  const [imageSource, setImageSource] = useState("");
  const [imageWidth, setImageWidth] = useState(1600);
  const [imageHeight, setImageHeight] = useState(1600);
  const [imageFormat, setImageFormat] = useState<ImageFormat>("image/jpeg");
  const [quality, setQuality] = useState(.82);
  const [doc, setDoc] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!image) {
      setImageSource("");
      return;
    }
    const url = URL.createObjectURL(image);
    setImageSource(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function onPdfChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])].slice(0, 20);
    setFiles(selected);
    setPdfCount(0);
    setPages("1-");
    setStatus("");
    const first = selected[0];
    if (!first) return;
    try {
      const document = await PDFDocument.load(await first.arrayBuffer());
      const n = document.getPageCount();
      setPdfCount(n);
      setPages(`1-${n}`);
    } catch {
      setStatus("Could not read the selected PDF. Choose an unencrypted PDF file.");
    }
  }

  async function processPdf() {
    if (!files.length) return;
    setBusy(true);
    setStatus("");
    try {
      if (pdfMode === "merge") {
        const output = await PDFDocument.create();
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer());
          const copied = await output.copyPages(source, source.getPageIndices());
          copied.forEach((page) => output.addPage(page));
        }
        const saved = await exportFile("merged.pdf", await output.save());
        setStatus(saved ? `Merged ${files.length} PDFs locally.` : "Save cancelled.");
      } else {
        const file = files[0];
        const source = await PDFDocument.load(await file.arrayBuffer());
        const selected = (pdfMode === "split" || pdfMode === "rotate") ? parsePages(pages, source.getPageCount()) : [];
        if (pdfMode === "split") {
          if (splitEach) {
            if (selected.length > 50) throw new Error("Batch page ZIP exports support a maximum of 50 pages.");
            const zip = new JSZip();
            for (const pageIndex of selected) {
              const pageFile = await PDFDocument.create();
              const [page] = await pageFile.copyPages(source, [pageIndex]);
              pageFile.addPage(page);
              const outputName = safeName(file.name) + "-page-" + String(pageIndex+1).padStart(3, "0") + ".pdf";
              zip.file(outputName, await pageFile.save());
            }
            const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
            const saved = await exportFile(safeName(file.name) + "-individual-pages.zip", archive);
            setStatus(saved ? `Saved ${selected.length} one-page PDFs in a ZIP archive.` : "Save cancelled.");
          } else {
            const output = await PDFDocument.create();
            const copied = await output.copyPages(source, selected);
            copied.forEach((page) => output.addPage(page));
            const saved = await exportFile(safeName(file.name) + "-pages.pdf", await output.save());
            setStatus(saved ? `Exported ${selected.length} pages into one PDF.` : "Save cancelled.");
          }
        } else if (pdfMode === "organize") {
          const order = parsePdfOrder(pages, source.getPageCount());
          const output = await PDFDocument.create();
          const copied = await output.copyPages(source, order);
          copied.forEach((page) => output.addPage(page));
          const saved = await exportFile(safeName(file.name) + "-organized.pdf", await output.save());
          setStatus(saved ? "Saved "+order.length+" pages in your requested order. The original was not changed." : "Save cancelled.");
        } else if (pdfMode === "rotate") {
          for (const index of selected) {
            const page = source.getPage(index);
            page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
          }
          const saved = await exportFile(safeName(file.name) + "-rotated.pdf", await source.save());
          setStatus(saved ? `Rotated ${selected.length} pages.` : "Save cancelled.");
        } else {
          const saved = await exportFile(safeName(file.name) + "-optimized.pdf", await source.save({ useObjectStreams: true }));
          setStatus(saved ? "Re-serialized this PDF with object streams. File size may increase; this does not downsample embedded images." : "Save cancelled.");
        }
      }
    } catch (error) {
      setStatus("PDF operation failed: " + errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function processImage() {
    if (!image) return;
    setBusy(true);
    setStatus("");
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(image);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Unsupported image format"));
          img.src = objectUrl;
        });
        const sourceX = imageMode === "crop" ? Math.floor(img.naturalWidth * cropLeft / 100) : 0;
        const sourceY = imageMode === "crop" ? Math.floor(img.naturalHeight * cropTop / 100) : 0;
        const sourceW = imageMode === "crop" ? Math.floor(img.naturalWidth * Math.min(cropWidth, 100 - cropLeft) / 100) : img.naturalWidth;
        const sourceH = imageMode === "crop" ? Math.floor(img.naturalHeight * Math.min(cropHeight, 100 - cropTop) / 100) : img.naturalHeight;
        if (sourceW < 1 || sourceH < 1) throw new Error("Crop rectangle is empty");
        const scale = Math.min(1, imageWidth / sourceW, imageHeight / sourceH);
        const width = Math.max(1, Math.round(sourceW * scale));
        const height = Math.max(1, Math.round(sourceH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        if (imageFormat === "image/jpeg") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
        if (caption.trim()) {
          ctx.font = `bold ${Math.max(14, Math.round(width / 32))}px system-ui`;
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#17253c";
          ctx.lineWidth = 4;
          const baseline = height - Math.max(18, Math.round(height / 25));
          ctx.strokeText(caption.slice(0, 100), 16, baseline, Math.max(1, width - 32));
          ctx.fillText(caption.slice(0, 100), 16, baseline, Math.max(1, width - 32));
        }
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((output) => output ? resolve(output) : reject(new Error("Image encoding failed")), imageFormat, quality)
        );
        if (blob.type && blob.type !== imageFormat) throw new Error("This macOS WebView does not support the requested image output format");
        const extension = imageFormat === "image/jpeg" ? "jpg" : imageFormat === "image/webp" ? "webp" : "png";
        const saved = await exportFile(safeName(image.name) + "-optimized." + extension, new Uint8Array(await blob.arrayBuffer()));
        setStatus(saved ? `Saved ${width}×${height} image · ${(blob.size / 1024).toFixed(1)} KB (original ${(image.size / 1024).toFixed(1)} KB).` : "Save cancelled.");
      } finally { URL.revokeObjectURL(objectUrl); }
    } catch (error) {
      setStatus("Image operation failed: " + errorMessage(error));
    } finally { setBusy(false); }
  }

  async function convertWord() {
    if (!doc) return;
    setBusy(true);
    setStatus("");
    try {
      if (!/\.docx$/i.test(doc.name)) throw new Error("Only .docx files are supported.");
      if (doc.size > 15_000_000) throw new Error("Word import limit is 15 MB.");
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer: await doc.arrayBuffer() });
      setMarkdown(htmlToMarkdown(result.value || ""));
      setStatus(`Converted locally. ${result.messages.length} conversion note(s).`);
    } catch (error) { setStatus("Word import failed: " + errorMessage(error)); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel">
      <p className="eyebrow">OFFLINE FILE LAB</p>
      <h2>File workbench</h2>
      <p className="subtle">Ported from the web file lab. Your selected documents stay in this app, without uploading to the AP website.</p>
      <div className="pill-row" role="group" aria-label="File tool">
        {(["pdf", "images", "word"] as const).map((item) => <button key={item} type="button" className={tab === item ? "pill active-pill" : "pill"} onClick={() => { setTab(item); setStatus(""); }}>{item === "pdf" ? "PDF desk" : item === "images" ? "Image desk" : "Word → Markdown"}</button>)}
      </div>
      {tab === "pdf" && <>
        <div className="pill-row compact" role="group" aria-label="PDF operation">
          {(["merge", "split", "rotate", "organize", "decorate", "convert", "compress"] as const).map((item) => <button type="button" key={item} onClick={() => { setPdfMode(item); setFiles([]); setStatus(""); }} className={pdfMode === item ? "pill active-pill" : "pill"}>{item === "compress" ? "Optimize (light)" : item === "decorate" ? "Add text / sign / watermark" : item === "convert" ? "Image ↔ PDF" : item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
        <label htmlFor="pdf-picker" className="field-label">{pdfMode === "merge" ? "Choose up to 20 PDFs in order" : pdfMode === "convert" ? "Optional PDF source (for PDF → images)" : "Choose a PDF"}</label>
        <input id="pdf-picker" className="field" type="file" accept=".pdf,application/pdf" multiple={pdfMode === "merge"} onChange={(event) => { void onPdfChange(event); }} />
        {files.length > 0 && <p className="subtle">Selected: {files.map((file) => file.name).join(" · ")} {pdfCount > 0 && `· first PDF ${pdfCount} page(s)`}</p>}
        {(pdfMode === "split" || pdfMode === "rotate" || pdfMode === "organize") && <><label className="field-label" htmlFor="pdf-pages">{pdfMode === "organize" ? "Pages in desired order (e.g. 3,1,2,5-8). Omit pages to remove them." : "Pages (e.g. 1-3,5,7-)"}</label><input id="pdf-pages" className="field" value={pages} onChange={(e) => setPages(e.target.value)} /></>}
        {pdfMode === "organize" && <p className="subtle">Reorder pages or remove unwanted pages by listing only those you want. Each page may appear once. No changes are made to the original file.</p>}
        {pdfMode === "split" && <label className="field-label"><input type="checkbox" checked={splitEach} onChange={e => setSplitEach(e.target.checked)} /> Export each selected page as its own PDF inside a ZIP (up to 50 pages)</label>}
        {pdfMode === "rotate" && <><label className="field-label" htmlFor="pdf-angle">Degrees clockwise</label><select id="pdf-angle" className="field" value={rotation} onChange={(e) => setRotation(Number(e.target.value))}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></>}
        {pdfMode === "compress" && <p className="subtle">Like the web's light-compress mode, this reserializes PDF objects. Scanned/image-heavy PDFs may not shrink.</p>}
        {pdfMode !== "decorate" && pdfMode !== "convert" && <div className="actions"><button type="button" className="primary-button" disabled={!files.length || busy} onClick={() => { void processPdf(); }}>{busy ? "Processing…" : "Process & save PDF"}</button></div>}
        {pdfMode === "decorate" && <PdfFreedomDesk file={files[0]??null} pageCount={pdfCount}/>}
        {pdfMode === "convert" && <PdfConvertDesk pdfFile={files[0]??null} pageCount={pdfCount}/>}
        {files.length > 0 && <PdfPagePreview file={files[0]} onPickPage={page=>{if(pdfMode!=="organize")setPages(String(page));}} />}
        {files.length > 0 && <PdfTextDesk file={files[0]} />}
      </>}
      {tab === "images" && <>
        <label className="field-label" htmlFor="image-picker">Choose an image</label>
        <input id="image-picker" className="field" type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        {imageSource && <img src={imageSource} alt="Selected file preview" style={{ maxWidth: 320, maxHeight: 220, objectFit: "contain", display: "block", marginTop: 16 }} />}
        <div className="pill-row compact" role="group" aria-label="Image operation"><button type="button" className={imageMode==="convert"?"pill active-pill":"pill"} onClick={()=>setImageMode("convert")}>Resize & convert</button><button type="button" className={imageMode==="crop"?"pill active-pill":"pill"} onClick={()=>setImageMode("crop")}>Crop & caption</button></div>
        {imageMode==="crop"&&<div className="tools-pair">
          <label className="field-label">Left % <input type="number" className="field" min={0} max={99} value={cropLeft} onChange={e=>setCropLeft(Math.max(0,Math.min(99,Number(e.target.value)||0)))}/></label>
          <label className="field-label">Top % <input type="number" className="field" min={0} max={99} value={cropTop} onChange={e=>setCropTop(Math.max(0,Math.min(99,Number(e.target.value)||0)))}/></label>
          <label className="field-label">Width % <input type="number" className="field" min={1} max={100} value={cropWidth} onChange={e=>setCropWidth(Math.max(1,Math.min(100,Number(e.target.value)||100)))}/></label>
          <label className="field-label">Height % <input type="number" className="field" min={1} max={100} value={cropHeight} onChange={e=>setCropHeight(Math.max(1,Math.min(100,Number(e.target.value)||100)))}/></label>
        </div>}
        <label className="field-label" htmlFor="image-caption">Optional text annotation</label><input id="image-caption" className="field" value={caption} maxLength={100} onChange={e=>setCaption(e.target.value)} placeholder="Add a short label to the output image" style={{width:"100%"}}/>
        <label className="field-label" htmlFor="image-width">Maximum width (keeps aspect ratio)</label>
        <input id="image-width" type="number" className="field" min={64} max={8192} value={imageWidth} onChange={(e) => setImageWidth(Math.max(64,Math.min(8192,Number(e.target.value)||1600)))} />
        <label className="field-label" htmlFor="image-height">Maximum height (keeps aspect ratio)</label>
        <input id="image-height" type="number" className="field" min={64} max={8192} value={imageHeight} onChange={(e) => setImageHeight(Math.max(64,Math.min(8192,Number(e.target.value)||1600)))} />
        <label className="field-label" htmlFor="image-format">Output format</label>
        <select id="image-format" className="field" value={imageFormat} onChange={(e) => setImageFormat(e.target.value as ImageFormat)}><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option><option value="image/png">PNG</option></select>
        <label className="field-label" htmlFor="image-quality">Quality · {Math.round(quality*100)}%</label>
        <input id="image-quality" type="range" min={.3} max={1} step={.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
        <div className="actions"><button type="button" className="primary-button" disabled={!image || busy} onClick={() => { void processImage(); }}>{busy ? "Converting…" : "Convert & save image"}</button></div>
      </>}
      {tab === "images" && <InteractiveCropDesk file={image} />}
      {tab === "images" && <ImageAnnotationDesk file={image} />}
      {tab === "images" && <BatchImageDesk />}
      {tab === "word" && <>
        <label htmlFor="word-picker" className="field-label">Choose .docx Word document</label>
        <input id="word-picker" className="field" type="file" accept=".docx" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
        <p className="subtle">Word → PDF is produced from a reconstructed Markdown preview, not a pixel-identical Word layout. Complex tables, floating shapes and pagination may change.</p>
        <div className="actions"><button className="primary-button" type="button" disabled={!doc || busy} onClick={() => { void convertWord(); }}>Import document</button>
          <button type="button" className="secondary-button" disabled={!markdown} onClick={() => { void exportFile(safeName(doc?.name || "document") + ".md", markdown).then(ok=>setStatus(ok?"Markdown saved.":"Save cancelled.")).catch(e=>setStatus(errorMessage(e))); }}>Save Markdown</button>
          <button type="button" className="secondary-button" disabled={!markdown} onClick={() => { onSendToWriting?.(markdown); }} hidden={!onSendToWriting}>Send to writing desk</button>
          <button type="button" className="secondary-button" disabled={!markdown} onClick={() => window.print()}>Print preview / save PDF</button>
        </div>
        {markdown && <>
          <label htmlFor="word-converted" className="field-label">Editable Markdown</label>
          <textarea id="word-converted" className="field text-editor" rows={9} value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
          <p className="field-label">Formatted print preview</p>
          <article className="markdown-preview printable-document" aria-label="Converted Word document print preview">
            <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
          </article>
        </>}
      </>}
      {status && <p role="status" className="subtle">{status}</p>}
    </section>
  );
}
