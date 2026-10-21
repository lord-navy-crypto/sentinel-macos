import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";
import {exportSlideDeck} from "./creativeStudio";
import {buildUnifiedWorkflow,planUnifiedFiles,type UnifiedSource} from "./unifiedWorkflow";
const enc=new TextEncoder();
function file(name:string,data:Uint8Array|string):UnifiedSource{
 const bytes=typeof data==="string"?enc.encode(data):data;
 return {name,size:bytes.length,arrayBuffer:async()=>new Uint8Array(bytes).buffer};
}
const fakePng=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1]);
const imageAdapter=async()=>fakePng;
describe("Sentinel Box unified mixed-file real processing",()=>{
 it("generates editable Word, safe CSV, inferred TypeScript, Office text and PNG into one ZIP",async()=>{
  const docx=await markdownToDocx("# Long research note\n\nOriginal Word document text");
  const pptx=await exportSlideDeck({title:"Project slide",subtitle:"Offline demo",outline:"## First section\n- Data collected\n## Second section\n- Conclusions",theme:"ocean"});
  const input=[
   file("story.md","# Story\n\n- Introduction\n- Evidence"),
   file("sample.csv","name,calculation\n Ann ,=1+2\n Ann ,=1+2\nBob, 3\n"),
   file("schema.json",'{"team":[{"name":"Ada","role":"dev"},{"name":"Lin"}],"ok":true}'),
   file("minutes.docx",docx),file("talk.pptx",pptx),file("photo.png",fakePng)
  ];
  const plan=planUnifiedFiles(input);
  expect(plan.map(p=>p.action)).toEqual([
   "text-to-word","csv-clean","json-to-types","office-to-text","office-to-text","image-normalize"
  ]);
  const result=await buildUnifiedWorkflow(input,{includeOriginals:false,imageMaxDimension:512},imageAdapter);
  expect(result.manifest.processed).toBe(6);
  expect(result.manifest.failed).toBe(0);
  expect(result.manifest.generator).toBe("Sentinel Box");
  expect(result.manifest.files.every(x=>/^[0-9a-f]{64}$/u.test(x.sha256))).toBe(true);
  expect(result.entries.every(p=>!p.startsWith("originals/"))).toBe(true);
  const zip=await JSZip.loadAsync(result.archive,{checkCRC32:true});
  const actualDoc=await JSZip.loadAsync(await zip.file("processed/001-story.docx")!.async("uint8array"));
  expect(await actualDoc.file("word/document.xml")!.async("string")).toContain("Introduction");
  const cleaned=await zip.file("processed/002-sample.clean.csv")!.async("string");
  expect(cleaned).toContain("'=1+2");
  expect(cleaned).not.toContain(" Ann ");
  expect(cleaned.split("\r\n").filter(Boolean)).toHaveLength(3);
  expect(await zip.file("processed/003-schema.ts")!.async("string")).toContain("role?: string");
  expect(await zip.file("processed/003-schema.paths.tsv")!.async("string")).toContain("$.team[0].name");
  expect(await zip.file("processed/004-minutes.extracted.txt")!.async("string")).toContain("Original Word document text");
  expect(await zip.file("processed/005-talk.extracted.txt")!.async("string")).toContain("Data collected");
  expect(new Uint8Array(await zip.file("processed/006-photo.png")!.async("uint8array")).subarray(0,8)).toEqual(fakePng.subarray(0,8));
  const manifest=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(manifest.files).toHaveLength(6);
  expect(manifest.files.every((x:{status:string})=>x.status==="processed")).toBe(true);
 });
 it("preserves explicit source copies and reports failed conversion per file",async()=>{
  const input=[
   file("notes.txt","My school notes"),
   file("invalid.json","{not valid"),
   file("summary.pdf",Uint8Array.from([37,80,68,70,45,49,0,5])),
   file("../mismatch.png",Uint8Array.from([37,80,68,70,45,49])),
  ];
  const result=await buildUnifiedWorkflow(input,{includeOriginals:true,imageMaxDimension:1024},imageAdapter);
  expect(result.manifest.processed).toBe(1);
  expect(result.manifest.archived).toBe(1);
  expect(result.manifest.failed).toBe(2);
  const zip=await JSZip.loadAsync(result.archive);
  expect(await zip.file("originals/002-invalid.json")!.async("string")).toBe("{not valid");
  expect(zip.file("processed/002-invalid.ts")).toBeNull();
  expect(zip.file("originals/003-summary.pdf")).not.toBeNull();
  expect(result.manifest.files[3].error).toMatch(/signature/);
  expect(Object.keys(zip.files).every(n=>!n.includes("../"))).toBe(true);
 });
 it("tracks genuinely unsupported files and never guesses a conversion",async()=>{
  const result=await buildUnifiedWorkflow([file("whiteboard.pdf",Uint8Array.from([37,80,68,70,45,49]))],
   {includeOriginals:false,imageMaxDimension:1024});
  expect(result.manifest.skipped).toBe(1);
  expect(result.manifest.processed).toBe(0);
  const zip=await JSZip.loadAsync(result.archive);
  expect(Object.keys(zip.files).filter(p=>!zip.files[p].dir)).toEqual(["reports/manifest.json","reports/README.txt"]);
 });
 it("rejects unsafe amounts and settings before loading files",()=>{
  expect(()=>planUnifiedFiles([])).toThrow(/1–16/);
  expect(()=>planUnifiedFiles(Array(17).fill({name:"a.txt",size:1}))).toThrow(/1–16/);
  expect(()=>planUnifiedFiles([{name:"oversized.docx",size:8_000_001}])).toThrow(/8 MB/);
  expect(()=>planUnifiedFiles([{name:"empty.csv",size:0}])).toThrow(/8 MB/);
  expect(()=>planUnifiedFiles([...(Array(3).fill({name:"doc.md",size:6_000_000}))])).toThrow(/16 MB/);
 });
});