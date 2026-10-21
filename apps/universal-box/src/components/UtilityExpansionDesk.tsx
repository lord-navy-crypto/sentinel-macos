import {useMemo,useState} from "react";
import ImageAnnotationDesk from "./ImageAnnotationDesk";
import {parsePrintItems,renderPrintSheet,type PrintInput} from "../lib/printSheet";
import {auditJsonToTypescript} from "../lib/jsonTypeStudio";
import {exportFile} from "../lib/output";

export type UtilityExpansionMode="annotate"|"print"|"json-types";
const tabs:{id:UtilityExpansionMode;label:string}[]=[
 {id:"annotate",label:"截图／图片标注"},
 {id:"print",label:"A4 标签／卡片／票券"},
 {id:"json-types",label:"JSON → TypeScript"},
];
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function UtilityExpansionDesk({initialMode="annotate"}:{initialMode?:UtilityExpansionMode}){
 const [mode,setMode]=useState<UtilityExpansionMode>(initialMode),[image,setImage]=useState<File|null>(null),
  [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [sheet,setSheet]=useState<PrintInput>({
  template:"cards",theme:"blue",title:"创意科学学习卡",
  items:"提出假设\n设计实验\n记录观察\n解释结果\n总结发现\n交流分享",
  footer:"Sentinel Box · Original print template",
 });
 const [json,setJson]=useState('{\n  "project": "Sentinel Box",\n  "version": 1,\n  "enabled": true,\n  "contributors": [{"name": "Ada", "role": "designer"}, {"name": "Lin"}],\n  "tags": ["office", "creative"]\n}');
 const printPreview=useMemo(()=>{try{return {svg:renderPrintSheet(sheet),count:parsePrintItems(sheet).length,error:""};}
  catch(e){return {svg:"",count:0,error:err(e)};}},[sheet]);
 const jsonPreview=useMemo(()=>{try{return {report:auditJsonToTypescript(json),error:""};}
  catch(e){return {report:null,error:err(e)};}},[json]);
 async function savePrint(){
  setBusy(true);setStatus("");
  try{
   const data=renderPrintSheet(sheet);
   const filename=sheet.template==="cards"?"study-cards-a4.svg":sheet.template==="labels"?"labels-a4.svg":"tickets-a4.svg";
   const saved=await exportFile(filename,data);
   setStatus(saved?"已保存真实 A4 尺寸的矢量 SVG；可用浏览器或支持 SVG 的排版软件打印。":"用户已取消保存。");
  }catch(e){setStatus("导出失败："+err(e));}
  finally{setBusy(false);}
 }
 async function saveTypes(kind:"ts"|"tsv"){
  setBusy(true);setStatus("");
  try{
   const report=auditJsonToTypescript(json);
   const saved=await exportFile(kind==="ts"?"universal-box-types.ts":"json-paths.tsv",
    kind==="ts"?report.typeScript:report.paths);
   setStatus(saved?"已导出 "+(kind==="ts"?"TypeScript 类型定义":"JSON 路径清单")+"；源文件未改变。":"用户已取消保存。");
  }catch(e){setStatus("导出失败："+err(e));}
  finally{setBusy(false);}
 }
 return <section className="panel" aria-label="Sentinel Box daily creative and developer workbench">
  <p className="eyebrow">FREE · ORIGINAL · OFFLINE UTILITY TOOLS</p>
  <h2>Daily Utility Studio · 图片、打印与开发工具</h2>
  <p className="subtle">这些工具直接生成实用成果：标注图片并另存 PNG，生成真实 A4 尺寸卡片/标签，或从 JSON 生成 TypeScript 类型文件。所有处理都在本地完成，无订阅、无需登录。</p>
  <div className="pill-row" role="group" aria-label="Daily utility modes">
   {tabs.map(t=><button key={t.id} type="button" className={mode===t.id?"pill active-pill":"pill"} aria-pressed={mode===t.id}
    onClick={()=>{setMode(t.id);setStatus("");}}>{t.label}</button>)}
  </div>
  {mode==="annotate"&&<>
   <label className="field-label">选择要编辑的 PNG、JPEG、WebP 图片（最大 8 MB）
    <input data-testid="utility-image-upload" className="field" type="file" accept="image/png,image/jpeg,image/webp"
     onChange={e=>{setImage(e.target.files?.[0]??null);setStatus("");}}/>
   </label>
   <ImageAnnotationDesk file={image}/>
  </>}
  {mode==="print"&&<>
   <h3>A4 Print Studio · 免费可打印模板</h3>
   <p className="subtle">真正按 A4 210 × 297 mm 排版。每行一个内容项，选学习卡、整理标签或活动票券；最后导出无水印 SVG。打印时选择 100% 比例，先用普通纸检查切割位置。</p>
   <div className="tools-pair">
    <label className="field-label">模板
     <select data-testid="utility-print-format" className="field" value={sheet.template}
      onChange={e=>{setSheet(s=>({...s,template:e.target.value as PrintInput["template"]}));setStatus("");}}>
      <option value="cards">学习卡 / 2 × 4</option><option value="labels">整理标签 / 3 × 8</option><option value="tickets">活动票券 / 2 × 5</option>
     </select>
    </label>
    <label className="field-label">主题
     <select className="field" value={sheet.theme} onChange={e=>setSheet(s=>({...s,theme:e.target.value as PrintInput["theme"]}))}>
      <option value="blue">海洋蓝</option><option value="green">森林绿</option><option value="purple">星云紫</option>
     </select>
    </label>
   </div>
   <label className="field-label">标题<input data-testid="utility-print-title" maxLength={80} className="field" value={sheet.title} onChange={e=>setSheet(s=>({...s,title:e.target.value}))}/></label>
   <label className="field-label">卡片／标签内容（每行一项）
    <textarea data-testid="utility-print-items" className="field text-editor" rows={8} maxLength={5000} value={sheet.items} onChange={e=>setSheet(s=>({...s,items:e.target.value}))}/>
   </label>
   <label className="field-label">底部文字<input className="field" maxLength={110} value={sheet.footer} onChange={e=>setSheet(s=>({...s,footer:e.target.value}))}/></label>
   {printPreview.error?<p role="alert" className="subtle">{printPreview.error}</p>:<>
    <p className="subtle" data-testid="utility-print-count">{printPreview.count} 项 · 单页 A4</p>
    <img data-testid="utility-print-preview" alt="A4 SVG page live preview"
     src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(printPreview.svg)}
     style={{display:"block",height:"auto",maxWidth:560,width:"100%",margin:"12px auto",border:"1px solid #ced9e7"}}/>
   </>}
   <button className="primary-button" type="button" data-testid="utility-print-export" disabled={busy||!!printPreview.error} onClick={()=>void savePrint()}>导出可打印 SVG</button>
  </>}
  {mode==="json-types"&&<>
   <h3>JSON → TypeScript · 结构审计工具</h3>
   <p className="subtle">粘贴 JSON，推断对象、数组和基本字段类型，导出可编辑的 .ts 类型文件，以及路径 .tsv 清单。不运行 JSON 中的内容；类型推断不是运行时验证器，数据形状不同仍需人工检查。</p>
   <label className="field-label">JSON 数据<textarea data-testid="utility-json-source" className="field text-editor" spellCheck={false}
    rows={12} maxLength={150000} value={json} onChange={e=>{setJson(e.target.value);setStatus("");}}/></label>
   {jsonPreview.error?<p role="alert" className="subtle">{jsonPreview.error}</p>:jsonPreview.report&&<>
    <p className="subtle" data-testid="utility-json-stats">访问 {jsonPreview.report.valueCount} 个节点 · {jsonPreview.report.objectCount} 对象 · {jsonPreview.report.arrayCount} 数组 · 深度 {jsonPreview.report.maxDepth}</p>
    <pre data-testid="utility-json-preview" style={{maxHeight:430,overflow:"auto",padding:16,whiteSpace:"pre",background:"#f1f5fb",borderRadius:8,color:"#17314f"}}>{jsonPreview.report.typeScript}</pre>
   </>}
   <div className="actions">
    <button className="primary-button" data-testid="utility-json-export-ts" disabled={busy||!!jsonPreview.error} onClick={()=>void saveTypes("ts")}>导出 TypeScript .ts</button>
    <button className="secondary-button" data-testid="utility-json-export-tsv" disabled={busy||!!jsonPreview.error} onClick={()=>void saveTypes("tsv")}>导出 JSON 路径 .tsv</button>
   </div>
  </>}
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}