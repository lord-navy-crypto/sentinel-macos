import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {buildProjectPack,planProjectPack,type ProjectPackInput} from "./projectWorkflow";
const sample:ProjectPackInput={
 title:"Ocean Project",subtitle:"Real editable outputs",
 outline:"## Research\n- Why does it matter?\n- Test ideas\n## Design\n- Build prototype\n- Verify with data\n## Share\n- Present results",
 notes:"**Evidence:** Collect observations and discuss outcomes.",theme:"ocean",
};
describe("One-click offline multi-output project kit",()=>{
 it("creates real DOCX, editable multi-slide PPTX, original SVG and manifest in one ZIP",async()=>{
  const before=JSON.stringify(sample);
  const plan=planProjectPack(sample);
  expect(plan.sections).toBe(3);
  expect(plan.filenames).toHaveLength(6);
  const zip=await JSZip.loadAsync(await buildProjectPack(sample),{checkCRC32:true});
  for(const f of plan.filenames)expect(zip.file(f)).not.toBeNull();
  const docx=await JSZip.loadAsync(await zip.file("project/brief.docx")!.async("uint8array"),{checkCRC32:true});
  const word=await docx.file("word/document.xml")!.async("string");
  expect(word).toContain("Ocean Project");
  expect(word).toContain("Evidence:");
  const pptx=await JSZip.loadAsync(await zip.file("project/slides.pptx")!.async("uint8array"),{checkCRC32:true});
  const slideList=await pptx.file("ppt/presentation.xml")!.async("string");
  expect((slideList.match(/<p:sldId id=/gu)||[])).toHaveLength(4);
  expect(await pptx.file("ppt/slides/slide2.xml")!.async("string")).toContain("Research");
  const svg=await zip.file("project/process.svg")!.async("string");
  expect(svg).toContain("Research");
  expect(svg).toContain("Share");
  expect((svg.match(/<rect x="170"/gu)||[])).toHaveLength(3);
  const original=await zip.file("project/original-outline.md")!.async("string");
  expect(original).toContain("Build prototype");
  const metadata=JSON.parse(await zip.file("project/manifest.json")!.async("string"));
  expect(metadata.files).toHaveLength(5);
  expect(metadata.servicesUsed).toEqual([]);
  expect(JSON.stringify(sample)).toBe(before);
 });
 it("rejects empty project, malformed slide outline and unsafe oversized inputs",()=>{
  expect(()=>planProjectPack({...sample,title:""})).toThrow(/Project title/);
  expect(()=>planProjectPack({...sample,outline:"Not headed by ##"})).toThrow(/Start outline/);
  expect(()=>planProjectPack({...sample,notes:"A".repeat(12001)})).toThrow(/12,000|12000/);
  expect(()=>planProjectPack({...sample,theme:"bad" as ProjectPackInput["theme"]})).toThrow(/theme/);
 });
 it("supports Chinese project content without stripping text",async()=>{
  const kit=await JSZip.loadAsync(await buildProjectPack({...sample,title:"海洋生态研究",outline:"## 研究问题\n- 了解多样性\n## 项目展示\n- 分享成果"}));
  const pptx=await JSZip.loadAsync(await kit.file("project/slides.pptx")!.async("uint8array"));
  expect(await pptx.file("ppt/slides/slide1.xml")!.async("string")).toContain("海洋生态研究");
 });
});
