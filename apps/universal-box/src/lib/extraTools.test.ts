import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";
import {exportSlideDeck} from "./creativeStudio";
import {inspectOffice,extractOfficeMedia} from "./officeInspector";
import {parseDiagram,renderDiagram,type DiagramInput} from "./visualDiagrams";

describe("Office inspector: local files, true OOXML roundtrips",()=>{
 it("reads real exported DOCX paragraphs and non-Latin letters",async()=>{
  const doc=await markdownToDocx("# 标题 Hello\n\n内容 **安全**、原创\n\n- first\n- second");
  const result=await inspectOffice("lesson.docx",doc);
  expect(result.kind).toBe("docx");
  expect(result.plainText).toContain("标题 Hello");
  expect(result.plainText).toContain("安全");
  expect(result.plainText).toContain("first");
  expect(result.sections.length).toBeGreaterThan(2);
  expect(result.images).toHaveLength(0);
 });
 it("reads actual PPTX slide sequence and bullets, not style garbage",async()=>{
  const bytes=await exportSlideDeck({title:"报告 < & >",subtitle:"Chinese 中文",
   outline:"## First section\n- Intro\n## Final section\n- Conclusion & next",theme:"forest"});
  const result=await inspectOffice("slides.pptx",bytes);
  expect(result.kind).toBe("pptx");
  expect(result.sections).toHaveLength(3);
  expect(result.sections[0].text).toContain("报告 < & >");
  expect(result.sections[1].text).toContain("First section");
  expect(result.sections[2].text).toContain("Conclusion & next");
  expect(result.plainText).not.toContain("<a:r");
 });
 it("safely exports valid PNG images while skipping fake or script media",async()=>{
  const doc=await markdownToDocx("Hello");
  const zip=await JSZip.loadAsync(doc);
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,72,68,82,0,0,0,0]);
  zip.file("word/media/image1.png",png);
  zip.file("word/media/image2.png",new TextEncoder().encode("<script>evil</script>"));
  zip.file("word/media/code.svg",'<svg onload="alert(1)"/>');
  const input=await zip.generateAsync({type:"uint8array"});
  const report=await inspectOffice("input.docx",input);
  expect(report.images).toHaveLength(2);
  const extracted=await JSZip.loadAsync(await extractOfficeMedia("input.docx",input));
  expect(extracted.file("media/image-001.png")).not.toBeNull();
  expect(extracted.file("media/image-002.png")).toBeNull();
  expect(extracted.file("word/media/code.svg")).toBeNull();
 });
 it("rejects disguised packages and files outside bounded type/size rules",async()=>{
  await expect(inspectOffice("macro.docm",new Uint8Array([1]))).rejects.toThrow(/docx or .pptx/);
  await expect(inspectOffice("too-big.pptx",new Uint8Array(18_000_001))).rejects.toThrow(/18 MB/);
  const zip=new JSZip();zip.file("evil.txt","x");
  await expect(inspectOffice("fake.docx",await zip.generateAsync({type:"uint8array"}))).rejects.toThrow(/missing/);
 });
});

describe("Mind maps and milestone timelines",()=>{
 const base:DiagramInput={title:"Research & Delivery",theme:"ocean",mode:"mindmap",
  items:"Problem | Challenge\nSolution | Build | Test\nRelease | Iterate"};
 it("produces original escaped SVG with real connected node geometry",()=>{
  const svg=renderDiagram(base);
  expect(svg).toContain("Research &amp; Delivery");
  expect(svg).toContain("Build");
  expect((svg.match(/<path d="M /gu)||[])).toHaveLength(3);
  expect((svg.match(/<rect x="/gu)||[]).length).toBeGreaterThan(3);
  expect(svg).not.toContain("<script");
 });
 it("produces an actual timeline axis and milestones",()=>{
  const svg=renderDiagram({...base,mode:"timeline",items:"Start | Confirm scope\nLaunch | Deliver"});
  expect(svg).toContain('d="M 190 175 V ');
  expect(svg).toContain("Start");
  expect(svg).toContain("Deliver");
  expect((svg.match(/<circle /g)||[])).toHaveLength(2);
 });
 it("rejects oversized or invalid graph inputs",()=>{
  expect(parseDiagram(base)).toHaveLength(3);
  expect(()=>parseDiagram({...base,items:Array(9).fill("Step").join("\n")})).toThrow(/1–8/);
  expect(()=>parseDiagram({...base,title:""})).toThrow(/Title/);
  expect(()=>parseDiagram({...base,items:"one|two|three|four|five"})).toThrow(/Maximum 3/);
  expect(()=>renderDiagram({...base,mode:"none" as DiagramInput["mode"]})).toThrow(/Unknown diagram/);
  const svg=renderDiagram({...base,items:"Safe <script> | &"});
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain("<script>");
 });
});