import {describe,it,expect} from "vitest";
import {DEFAULT_ACCESS,parseAccessPreferences} from "./accessPreferences";
import {recommendLocalTools} from "./toolGuide";
import {LOCAL_TOOLS} from "../components/ToolLaunchpad";

describe("v0.28 Universal Access preference safety",()=>{
 it("keeps backwards-compatible defaults and never accepts arbitrary values",()=>{
   expect(parseAccessPreferences(null)).toEqual(DEFAULT_ACCESS);
   expect(parseAccessPreferences("{}")).toEqual(DEFAULT_ACCESS);
   expect(parseAccessPreferences("not-json")).toEqual(DEFAULT_ACCESS);
   expect(parseAccessPreferences('{"reading":"2000","highContrast":1,"simplerHome":"true"}')).toEqual(DEFAULT_ACCESS);
 });
 it("selectively restores valid local accessibility choices",()=>{
   expect(parseAccessPreferences('{"reading":"extra","highContrast":true,"simplerHome":true,"reducedMotion":true,"tracking":"forbidden"}'))
     .toEqual({reading:"extra",highContrast:true,simplerHome:true,reducedMotion:true});
   expect(parseAccessPreferences("x".repeat(1501))).toEqual(DEFAULT_ACCESS);
 });
});
describe("v0.28 offline plain-language tool helper",()=>{
 it("routes photographed documents to actual registered converters",()=>{
   const answer=recommendLocalTools("把三张照片合成PDF",LOCAL_TOOLS);
   expect(answer.kind).toBe("available");
   expect(answer.suggestions[0].id).toBe("pdf-converters");
   expect(answer.suggestions[0].view).toBe("files");
   expect(answer.suggestions[0].module).toBe("convert");
 });
 it("covers the built-in common-speech example prompts",()=>{
   const requests=[
     ["我要给 PDF 添加一页空白纸","pdf-add-blank"],
     ["把 Excel 转成 CSV","xlsx-csv-converter"],
     ["批量缩小好多张照片","image-pipeline"],
     ["检查文件有没有重复","duplicate-files"],
     ["把数据做成柱状图","charts"],
   ];
   for(const [request,id] of requests){
     const answer=recommendLocalTools(request,LOCAL_TOOLS);
     expect(answer.kind,request).toBe("available");
     expect(answer.suggestions.some(v=>v.id===id),request).toBe(true);
   }
 });
 it("rejects nonexistent or unsupported OCR capabilities and never invents a tool",()=>{
   const missing=recommendLocalTools("我想给扫描 PDF 做 OCR 识别",LOCAL_TOOLS);
   expect(missing.kind).toBe("planned");
   expect(missing.suggestions).toEqual([]);
   const unknown=recommendLocalTools("帮我治疗全球所有问题",LOCAL_TOOLS);
   expect(unknown.kind).toBe("unknown");
   expect(unknown.suggestions).toEqual([]);
   const nonexistent=recommendLocalTools("图片转PDF",[{id:"another",name:"Other",view:"overview"}]);
   expect(nonexistent.kind).toBe("unknown");
   expect(nonexistent.suggestions).toEqual([]);
 });
 it("every recommended route exists in the live catalog; guide has no external network dependency",()=>{
   const prompts=[
     "把图片转PDF","给PDF裁剪边距","我要给PDF添加空白页",
     "PDF填写表单","PDF编辑作者属性","批量压缩图片","比较照片差异",
     "Excel转CSV","zip解压提取","文件去重","批量制作信函",
     "CSV转换成通讯录","把数据做成柱状图","二维码制作",
     "备份数据","字幕转换时间","WAV裁剪音频",
   ];
   const ids=new Set(LOCAL_TOOLS.map(tool=>tool.id));
   for(const prompt of prompts){
     const answer=recommendLocalTools(prompt,LOCAL_TOOLS);
     for(const item of answer.suggestions){
       expect(ids.has(item.id),prompt).toBe(true);
       expect(item.steps.length,"missing steps for "+item.id).toBeGreaterThanOrEqual(2);
     }
   }
 });
});
