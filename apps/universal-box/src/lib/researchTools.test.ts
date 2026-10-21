import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {auditDirectory,directoryAuditCsv,directoryAuditSvg} from "./directoryAudit";
import {analyzeWavLevels,wavLevelsCsv} from "./wavLevelAudit";
import {extractPptxSpeakerNotes,notesToText} from "./pptxNotesAudit";

function wav(value=16384):Uint8Array{
 const n=8000,data=2*n,out=new Uint8Array(44+data),v=new DataView(out.buffer);
 const tag=(at:number,text:string)=>{for(let i=0;i<text.length;i++)out[at+i]=text.charCodeAt(i);};
 tag(0,"RIFF");v.setUint32(4,36+data,true);tag(8,"WAVE");tag(12,"fmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 tag(36,"data");v.setUint32(40,data,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,i%2?-value:value,true);
 return out;
}
async function deck():Promise<Uint8Array>{
 const z=new JSZip();
 z.file("ppt/presentation.xml",'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>');
 z.file("ppt/_rels/presentation.xml.rels",'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
 z.file("ppt/slides/slide2.xml",'<p:sld><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>Title</a:t></a:r></a:p></p:sld>');
 z.file("ppt/slides/slide1.xml",'<p:sld><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>Second</a:t></a:r></a:p></p:sld>');
 z.file("ppt/slides/_rels/slide2.xml.rels",'<Relationships><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>');
 z.file("ppt/notesSlides/notesSlide7.xml",'<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>演讲 &amp; experiments</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><a:p><a:r><a:t>99</a:t></a:r></a:p></p:sp></p:spTree></p:cSld></p:notes>');
 return z.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
describe("File folder-space metadata audits",()=>{
 it("aggregates actual relative paths by directory and extension",()=>{
  const items=[{name:"a.txt",relativePath:"docs/a.txt",size:10},{name:"b.txt",relativePath:"docs/sub/b.txt",size:50},
   {name:"photo.png",relativePath:"pictures/photo.png",size:200}];
  const a=auditDirectory(items);
  expect(a.files).toBe(3);expect(a.bytes).toBe(260);expect(a.folders).toBe(3);
  expect(a.groups[0]).toEqual({path:"pictures",bytes:200,files:1});
  expect(a.extensions.find(x=>x.path===".txt")?.bytes).toBe(60);
  expect(directoryAuditCsv(a)).toContain("docs/sub");
  expect(directoryAuditSvg(a)).toContain("<svg");
  expect(directoryAuditSvg(a)).toContain("pictures");
 });
 it("rejects traversal and duplicate paths",()=>{
  expect(()=>auditDirectory([{name:"a",relativePath:"../a",size:1}])).toThrow(/unsafe/);
  expect(()=>auditDirectory([{name:"a",relativePath:"a",size:1},{name:"a",relativePath:"a",size:2}])).toThrow(/Repeated/);
 });
});
describe("PCM16 measured sample peak and RMS",()=>{
 it("has correct −6.02 dBFS readings for an alternating half-scale WAV",()=>{
  const r=analyzeWavLevels(wav());
  expect(r.durationMs).toBe(1000);
  expect(r.peakDbfs).toBeCloseTo(-6.02,1);
  expect(r.rmsDbfs).toBeCloseTo(-6.02,1);
  expect(r.dcOffsetPercent).toBe(0);
  expect(r.clippedSamples).toBe(0);
  expect(r.windows.length).toBeGreaterThan(4);
  expect(wavLevelsCsv(r)).toContain("peak_dbfs");
 });
 it("recognizes digital clipping and an uncompressed silent source",()=>{
  expect(analyzeWavLevels(wav(32767)).clippedSamples).toBe(8000);
  const silent=analyzeWavLevels(wav(0));
  expect(silent.peakDbfs).toBeNull();expect(silent.rmsDbfs).toBeNull();
 });
});
describe("PPTX speaker notes from actual note relationships",()=>{
 it("uses slide order, body placeholder and leaves missing notes blank",async()=>{
  const res=await extractPptxSpeakerNotes(await deck());
  expect(res.slides).toBe(2);
  expect(res.withNotes).toBe(1);
  expect(res.notes[0].text).toBe("演讲 & experiments");
  expect(res.notes[0].text).not.toContain("99");
  expect(res.notes[1].hasNotes).toBe(false);
  expect(notesToText(res)).toContain("Slide 2\n(no presenter notes)");
 });
 it("rejects invalid OOXML input",async()=>{
  await expect(extractPptxSpeakerNotes(new Uint8Array(100))).rejects.toThrow();
 });
});
