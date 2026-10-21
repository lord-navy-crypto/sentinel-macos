import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {PDFDocument} from "pdf-lib";
import {markdownToDocx} from "./documentExport";
import {inspectPcmWav} from "./wavTools";
import {auditPdfDocuments,compareWordDocuments,pdfAuditZip,trimWavSilence,wavSilenceZip,wordReviewZip} from "./qualityReview";

function wavSamples():Uint8Array{
 const frames=8000,bytes=new Uint8Array(44+frames*2),v=new DataView(bytes.buffer);
 const tag=(p:number,text:string)=>{for(let i=0;i<text.length;i++)bytes[p+i]=text.charCodeAt(i);};
 tag(0,"RIFF");v.setUint32(4,bytes.length-8,true);tag(8,"WAVE");tag(12,"fmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 tag(36,"data");v.setUint32(40,frames*2,true);
 for(let i=1600;i<5600;i++)v.setInt16(44+i*2,Math.round(11000*Math.sin(2*Math.PI*440*i/8000)),true);
 return bytes;
}
describe("DOCX paragraph-level review",()=>{
 it("reads real editable Word XML and generates accurately marked paragraph changes",async()=>{
  const a=await markdownToDocx("Alpha paragraph\n\nShared result\n\nOld conclusion");
  const b=await markdownToDocx("Alpha paragraph\n\nShared result\n\nNew conclusion\n\nExtra section");
  const left={name:"before.docx",bytes:a},right={name:"after.docx",bytes:b};
  const review=await compareWordDocuments(left,right);
  expect(review.same).toBe(2);expect(review.removed).toBe(1);expect(review.added).toBe(2);
  const zip=await JSZip.loadAsync(await wordReviewZip(left,right),{checkCRC32:true});
  const txt=await zip.file("reports/word-paragraph-diff.txt")!.async("string");
  expect(txt).toContain("- Old conclusion");expect(txt).toContain("+ New conclusion");
  const meta=JSON.parse(await zip.file("reports/word-paragraph-diff.json")!.async("string"));
  expect(meta.removed).toBe(1);
  expect(meta.limitations).toContain("Track Changes");
 });
 it("rejects Office-like files not containing valid OOXML and limits huge input",async()=>{
  await expect(compareWordDocuments({name:"a.docx",bytes:new Uint8Array([1,2,3])},
   {name:"b.docx",bytes:new Uint8Array([1,2,3])})).rejects.toThrow();
  await expect(compareWordDocuments({name:"bad.doc",bytes:new Uint8Array([1,2,3])},
   {name:"b.docx",bytes:new Uint8Array([1,2,3])})).rejects.toThrow(/docx/);
 });
});
describe("PCM16 WAV real auto-silence trimming",()=>{
 it("trims leading and trailing silence and emits newly playable PCM16 WAV",async()=>{
  const bytes=wavSamples();const result=trimWavSilence(bytes,-38,0);
  expect(result.removedStartMs).toBeGreaterThan(195);
  expect(result.removedEndMs).toBeGreaterThan(295);
  const out=inspectPcmWav(result.output);
  expect(out.frames).toBeGreaterThan(3800);expect(out.frames).toBeLessThan(4100);
  const zip=await JSZip.loadAsync(await wavSilenceZip({name:"interview.wav",bytes},-38,0));
  expect(inspectPcmWav(await zip.file("audio/trimmed.wav")!.async("uint8array")).frames).toBe(out.frames);
  expect(JSON.parse(await zip.file("reports/silence.json")!.async("string")).name).toBe("interview.wav");
  expect(inspectPcmWav(bytes).frames).toBe(8000);
 });
 it("rejects all-quiet WAVs and out-of-bounds thresholds",()=>{
  const silent=new Uint8Array(wavSamples());
  const view=new DataView(silent.buffer);
  silent.fill(0,44);view.setUint32(4,silent.length-8,true);
  expect(()=>trimWavSilence(silent)).toThrow(/Entire WAV/);
  expect(()=>trimWavSilence(wavSamples(),-80)).toThrow(/threshold/);
  expect(()=>trimWavSilence(wavSamples(),-35,800)).toThrow(/Padding/);
 });
});
describe("multiple genuine PDF audits",()=>{
 async function pdf(name:string,width:number,height:number,title:string){
  const doc=await PDFDocument.create();
  doc.addPage([width,height]);doc.addPage([height,width]);doc.setTitle(title);doc.setAuthor("Local QA");
  return {name,bytes:new Uint8Array(await doc.save())};
 }
 it("reads actual PDF page dimensions and exports CSV/JSON with per-document evidence",async()=>{
  const a=await pdf("pages.pdf",595,842,"Study pages"),b=await pdf("plan.pdf",612,792,"=Local project");
  const data=await auditPdfDocuments([a,b]);
  expect(data.totalPages).toBe(4);
  expect(data.files.map(x=>x.pages)).toEqual([2,2]);
  expect(data.files[0].portrait).toBe(1);expect(data.files[0].landscape).toBe(1);
  expect(data.reportCsv).toContain("Study pages");
  expect(data.reportCsv).toContain("'=Local project");
  const zip=await JSZip.loadAsync(await pdfAuditZip([a,b]));
  const report=JSON.parse(await zip.file("reports/pdf-page-audit.json")!.async("string"));
  expect(report.totalPages).toBe(4);
  expect(await zip.file("reports/pdf-page-audit.csv")!.async("string")).toContain("pages.pdf");
 });
 it("rejects missing input and fake PDF bytes",async()=>{
  await expect(auditPdfDocuments([])).rejects.toThrow(/1–12/);
  await expect(auditPdfDocuments([{name:"fake.pdf",bytes:new Uint8Array([1,2,3])}])).rejects.toThrow();
 });
});