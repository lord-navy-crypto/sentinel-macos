import {describe,it,expect} from "vitest";
import fs from "node:fs/promises";
import {runInNewContext} from "node:vm";

type CaptureMode=(mode:string,index?:number)=>string|{__captureError:string};
const assetUrl=new URL("../../public/web-capture/popup.js",import.meta.url);
const visible={closest:()=>null};
function mockElement(extra:Record<string,unknown>={}) {
  return {...visible,...extra};
}
async function makeCapture(opts:{
 selection?:string;
 meta?:Record<string,string>;
 links?:Record<string,unknown>[];
 tables?:Record<string,unknown>[];
 bodyText?:string;
}={}):Promise<CaptureMode>{
 const script=await fs.readFile(assetUrl,"utf8");
 const begin=script.indexOf("function capturePage(");
 const end=script.indexOf("\nasync function activeTab()",begin);
 expect(begin).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(begin);
 const metadata=opts.meta||{};
 const location={protocol:"https:",href:"https://example.com/research",origin:"https://example.com"};
 const document={
  title:"Example Research",
  body:mockElement({innerText:opts.bodyText??"A complete sample article.",textContent:opts.bodyText??"A complete sample article.",querySelectorAll:()=>[]}),
  querySelector(selector:string){
   if(selector.startsWith("meta[")){
    const key=/="([^"]+)"/.exec(selector)?.[1]||"";
    return metadata[key] ? {content:metadata[key]} : null;
   }
   return null;
  },
  querySelectorAll(selector:string){
   if(selector==="a[href]")return opts.links||[];
   if(selector==="table")return opts.tables||[];
   return [];
  }
 };
 const context={
  document,location,URL,Date,
  window:{getSelection:()=>({toString:()=>opts.selection||""})},
  getComputedStyle:()=>({display:"block",visibility:"visible"}),
  Node:{TEXT_NODE:3,ELEMENT_NODE:1}
 };
 return runInNewContext("("+script.slice(begin,end)+")",context) as CaptureMode;
}
describe("Web Capture 0.8 on-demand page processing",()=>{
 it("creates a complete attributed research note without silently truncating text",async()=>{
  const capture=await makeCapture({bodyText:"A measured experiment found a discrepancy."});
  const out=capture("research-brief") as string;
  expect(out).toContain("Example Research");
  expect(out).toContain("https://example.com/research");
  expect(out).toContain("A measured experiment found a discrepancy.");
  expect(out).toContain("并非独立事实核查");
 });
 it("rejects overlong research briefs instead of producing incomplete notes",async()=>{
  const capture=await makeCapture({bodyText:"A".repeat(160001)});
  expect(capture("research-brief")).toMatchObject({__captureError:expect.stringContaining("160,000")});
 });
 it("inspects a chosen table with merged/blank/duplicate rows without corrupting the source",async()=>{
  const cell=(value:string,span=1)=>({tagName:"TD",innerText:value,textContent:value,colSpan:span,rowSpan:1});
  const row=(...cells:ReturnType<typeof cell>[])=>mockElement({children:cells});
  const rows=[row(cell("Name"),cell("Result")),row(cell("Ada"),cell("")),row(cell("Ada"),cell("")),
   row(cell("Combined",2))];
  const table=mockElement({querySelector:()=>rows[0],querySelectorAll:()=>rows});
  const capture=await makeCapture({tables:[table]});
  const out=capture("table-audit",0) as string;
  expect(out).toContain("合并单元格：1");
  expect(out).toContain("空单元格：2");
  expect(out).toContain("完全重复的数据行（不含首行）：1");
  expect(out).toContain("https://example.com/research");
 });

 it("exports the selected paragraph with webpage citation and no background content",async()=>{
  const capture=await makeCapture({selection:"A careful\nobservation."});
  const out=capture("selection") as string;
  expect(out).toContain("> A careful");
  expect(out).toContain("> observation.");
  expect(out).toContain("https://example.com/research");
  expect(out).not.toContain("password");
 });
 it("creates a source metadata card without silently checking outside sites",async()=>{
  const capture=await makeCapture({meta:{author:"Researcher",description:"Local evidence"}});
  const out=capture("research-metadata") as string;
  expect(out).toContain("Example Research");
  expect(out).toContain("https://example.com/research");
  expect(out).toContain("Researcher");
  expect(out).toContain("Local evidence");
  expect(out).toContain("未检查");
 });
 it("rejects an empty selection without exporting a page snapshot",async()=>{
  const capture=await makeCapture();
  expect(capture("selection")).toMatchObject({__captureError:expect.stringContaining("选中文字")});
 });
 it("creates an importable RIS citation with explicitly unverified metadata",async()=>{
  const capture=await makeCapture({meta:{author:"A. Author",citation_date:"2026-10-18"}});
  const out=capture("citation-ris") as string;
  expect(out).toContain("TY  - ELEC\r\n");
  expect(out).toContain("TI  - Example Research");
  expect(out).toContain("AU  - A. Author");
  expect(out).toContain("PY  - 2026");
  expect(out).toContain("not independently verified");
  expect(out.trimEnd().endsWith("ER  -")).toBe(true);
 });
 it("classifies same-origin versus external links without fetching them",async()=>{
  const link=(href:string,label:string)=>mockElement({
    href,innerText:label,textContent:label,getAttribute:()=>null
  });
  const capture=await makeCapture({links:[
    link("https://example.com/about","About"),
    link("https://another.example/page","External"),
    link("http://plain.example/",""),
    link("https://another.example/page","Duplicate")
  ]});
  const out=capture("links-audit") as string;
  expect(out).toContain("不同链接：3");
  expect(out).toContain("同源链接：1");
  expect(out).toContain("站外链接：2");
  expect(out).toContain("HTTP 链接：1");
  expect(out).toContain("无标签链接：1");
  expect(out).not.toContain("https://another.example/page");
 });
 it("exports the chosen table as Markdown, escaping pipe characters",async()=>{
  const cell=(value:string)=>({tagName:"TD",innerText:value,colSpan:1,rowSpan:1});
  const row=(...values:string[])=>mockElement({children:values.map(cell)});
  const rows=[row("Name","Note"),row("Ada","line | value")];
  const table=mockElement({querySelector:()=>rows[0],querySelectorAll:()=>rows});
  const capture=await makeCapture({tables:[table]});
  const out=capture("table-markdown",0) as string;
  expect(out).toContain("| Name | Note |");
  expect(out).toContain("| --- | --- |");
  expect(out).toContain("line \\| value");
  expect(out).toContain("https://example.com/research");
 });
 it("rejects merged HTML table cells instead of silently damaging the export",async()=>{
  const row=mockElement({children:[{tagName:"TD",innerText:"Merged",colSpan:2,rowSpan:1}]});
  const table=mockElement({querySelector:()=>row,querySelectorAll:()=>[row]});
  const capture=await makeCapture({tables:[table]});
  expect(capture("table-markdown",0)).toMatchObject({__captureError:expect.stringContaining("合并单元格")});
 });
});
