import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {
 exportWordTemplate,fillWordTemplate,parseSlideOutline,exportSlideDeck,renderCreativeSvg,renderFlowchartSvg,
 type SlideDeckInput,type WordTemplateInput,
} from "./creativeStudio";

const letter:WordTemplateInput={title:"邀请函",recipient:"林同学",event:"科学展览",date:"2026-11-12",
 body:"尊敬的 {{recipient}}：\n\n欢迎参加 **{{event}}**。\n\n时间：{{date}}\n\n- 展台\n- 答疑"};

const deck:SlideDeckInput={title:"科学计划",subtitle:"创造与研究",
 outline:"## 问题\n- 为什么需要它？\n- 用户场景\n## 方案\n- 开源、免费\n- 保持独立",theme:"ocean"};

describe("Free creative studio: real native file exports",()=>{
 it("resolves only explicit Word template tokens, without mutating originals",async()=>{
  const before=JSON.stringify(letter);
  const markdown=fillWordTemplate(letter);
  expect(markdown).toContain("# 邀请函");
  expect(markdown).toContain("林同学");
  expect(markdown).toContain("科学展览");
  expect(markdown).not.toContain("{{");
  const archive=await JSZip.loadAsync(await exportWordTemplate(letter),{checkCRC32:true});
  const xml=await archive.file("word/document.xml")!.async("string");
  expect(xml).toContain("林同学");
  expect(xml).toContain("科学展览");
  expect(xml).toContain("2026-11-12");
  expect(xml).toContain("w:p");
  expect(JSON.stringify(letter)).toBe(before);
 });
 it("refuses unresolved/untrusted Word template markers and invalid title",()=>{
  expect(()=>fillWordTemplate({...letter,body:"{{secret}}"})).toThrow(/Unknown template field/);
  expect(()=>fillWordTemplate({...letter,title:""})).toThrow(/title/);
 });
 it("builds multiple editable PPTX slides with valid package relationships and escaped text",async()=>{
  const original=JSON.stringify(deck);
  const bytes=await exportSlideDeck({...deck,outline:deck.outline.replace("为什么需要它？","Q < A & B")});
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  const names=Object.keys(zip.files);
  for(const file of ["[Content_Types].xml","_rels/.rels","ppt/presentation.xml",
   "ppt/_rels/presentation.xml.rels","ppt/theme/theme1.xml",
   "ppt/slideMasters/slideMaster1.xml","ppt/slideLayouts/slideLayout1.xml",
   "ppt/slides/slide1.xml","ppt/slides/slide2.xml","ppt/slides/slide3.xml"]){
   expect(names).toContain(file);
  }
  const presentation=await zip.file("ppt/presentation.xml")!.async("string");
  expect((presentation.match(/<p:sldId id=/g)||[])).toHaveLength(3);
  const content=await zip.file("ppt/slides/slide2.xml")!.async("string");
  expect(content).toContain("Q &lt; A &amp; B");
  expect(content).toContain("<a:t>");
  expect(content).not.toContain("<script");
  expect(JSON.stringify(deck)).toBe(original);
 });
 it("enforces bounded real slide content before ZIP allocation",()=>{
  expect(parseSlideOutline(deck)).toHaveLength(2);
  expect(()=>parseSlideOutline({...deck,outline:"- no heading"})).toThrow(/Start outline/);
  expect(()=>parseSlideOutline({...deck,outline:"## Long\n"+Array(8).fill("- text").join("\n")})).toThrow(/Maximum 7/);
  expect(()=>parseSlideOutline({...deck,title:""})).toThrow(/title/);
  expect(()=>parseSlideOutline({...deck,theme:"unknown" as SlideDeckInput["theme"]})).toThrow(/Unknown creative theme/);
 });
 it("renders a real SVG flowchart with arrows and bounded escaped steps",()=>{
  const diagram=renderFlowchartSvg({title:"Research & Build",steps:"Plan\nDesign <script>\nDeliver",theme:"forest"});
  expect(diagram).toContain("Research &amp; Build");
  expect(diagram).toContain("Design &lt;script&gt;");
  expect(diagram).not.toContain("<script");
  expect((diagram.match(/<rect x="170"/gu)||[])).toHaveLength(3);
  expect((diagram.match(/<path d="M 500/gu)||[])).toHaveLength(2);
  expect(()=>renderFlowchartSvg({title:"Project",steps:Array(13).fill("Step").join("\n"),theme:"forest"})).toThrow(/1–12/);
 });
 it("generates three different SVG ratios with no active user HTML",()=>{
  for(const [format,w,h] of [["poster",900,1200],["certificate",900,650],["social",1200,675]] as const){
   const art=renderCreativeSvg({title:"Hello <script>alert(1)</script>",
    subtitle:"Safe & creative",footer:"2026",format,theme:"sunset"});
   expect(art).toContain('viewBox="0 0 '+w+" "+h+'"');
   expect(art).toContain("&lt;script&gt;");
   expect(art).not.toContain("<script");
   expect(art).not.toContain("http://external");
   expect(art).toContain("Safe &amp; creative");
  }
  expect(()=>renderCreativeSvg({title:"",subtitle:"",footer:"",format:"poster",theme:"ocean"})).toThrow(/headline/);
 });
});