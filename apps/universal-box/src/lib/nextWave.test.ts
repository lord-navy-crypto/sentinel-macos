import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {makeEpub} from "./epubMaker";
import {hashSelectedFiles,readIntegrityManifest,checkSelectedFiles} from "./integrityVerifier";
import {inspectCsvKeys,exportCsvDuplicateAudit} from "./csvDuplicateAudit";

describe("real offline EPUB 3 package",()=>{
 it("builds a complete ebook, escapes content and preserves Chinese",async()=>{
  const bytes=await makeEpub({title:"物理 & Math",author:"A <B>",language:"zh-CN",kind:"markdown",body:"# 第一章\n\n测试 <script>alert(1)</script> & ideas\n\n- one\n- two"});
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  expect(Object.keys(zip.files)[0]).toBe("mimetype");
  expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  const opf=await zip.file("EPUB/package.opf")!.async("string");
  expect(opf).toContain("<dc:title>物理 &amp; Math</dc:title>");
  expect(opf).toContain("<dc:creator>A &lt;B&gt;</dc:creator>");
  expect(opf).toContain('properties="nav"');
  const chapter=await zip.file("EPUB/chapter.xhtml")!.async("string");
  expect(chapter).toContain("<h1>第一章</h1>");
  expect(chapter).toContain("&lt;script&gt;");
  expect(chapter).toContain("<li>one</li>");
  expect(zip.file("META-INF/container.xml")).not.toBeNull();
  expect(zip.file("EPUB/nav.xhtml")).not.toBeNull();
 });
 it("refuses invalid book payload",async()=>{
  await expect(makeEpub({title:"",author:"N",language:"en",kind:"text",body:"body"})).rejects.toThrow(/title/);
  await expect(makeEpub({title:"ok",author:"N",language:"en",kind:"text",body:"test\u0000"})).rejects.toThrow(/content/);
 });
});
describe("SHA-256 file integrity validation",()=>{
 const file=(name:string,text:string)=>new File([text],name,{type:"text/plain"});
 it("finds changed, missing and extra files from a real baseline",async()=>{
  const original=await hashSelectedFiles([file("a.txt","alpha"),file("b.txt","beta")]);
  expect(original.files[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
  const raw=JSON.stringify(original);
  const verified=await checkSelectedFiles([file("a.txt","alpha"),file("b.txt","beta")],readIntegrityManifest(raw));
  expect(verified.map(x=>x.state)).toEqual(["match","match"]);
  const changed=await checkSelectedFiles([file("a.txt","ALPHA"),file("c.txt","extra")],readIntegrityManifest(raw));
  expect(changed.map(x=>x.state)).toEqual(["modified","missing","extra"]);
 });
 it("rejects ambiguous duplicate names and forged malformed manifests",async()=>{
  await expect(hashSelectedFiles([file("x","1"),file("x","2")])).rejects.toThrow(/Duplicate/);
  expect(()=>readIntegrityManifest('{"format":"sentinel-box-sha256-v1","files":[{"name":"../evil","size":1,"sha256":"'+("0".repeat(64))+'"}]}')).toThrow(/Invalid/);
 });
});
describe("CSV key collision and conflict reports",()=>{
 const csv="ID,Description,Code\n001,First,=2+3\n002,Same,safe\n001,Second,=4+4\n002,Same,safe\n,Missing,id";
 it("reports exact duplicates separately from conflicted keys",()=>{
  const report=inspectCsvKeys(csv,[0]);
  expect(report.groups).toHaveLength(2);
  expect(report.duplicateRows).toBe(4);
  expect(report.conflictingGroups).toBe(1);
  expect(report.blankKeys).toEqual([6]);
  expect(report.groups[0].rowNumbers).toEqual([2,4]);
  expect(report.groups[0].conflict).toBe(true);
  expect(report.groups[1].conflict).toBe(false);
  expect(inspectCsvKeys(csv,[0,1]).groups).toHaveLength(1);
 });
 it("exports real CSV evidence without unescaped formulas",async()=>{
  const {zip}=await exportCsvDuplicateAudit(csv,[0]);
  const files=await JSZip.loadAsync(zip,{checkCRC32:true});
  const data=await files.file("duplicate-key-rows.csv")!.async("string");
  expect(data).toContain("'=2+3");
  expect(data).toContain("source_row");
  expect(JSON.parse(await files.file("audit.json")!.async("string")).conflictingGroups).toBe(1);
 });
 it("rejects invalid key definitions and ragged CSV",()=>{
  expect(()=>inspectCsvKeys(csv,[0,0])).toThrow(/distinct/);
  expect(()=>inspectCsvKeys("ID,Value\n1,x\n2", [0])).toThrow(/column counts/);
 });
});
