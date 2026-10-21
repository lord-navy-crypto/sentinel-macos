import {useMemo,useState} from "react";
import {exportFile} from "../lib/output";
import {
 exportSlideDeck,exportWordTemplate,fillWordTemplate,parseSlideOutline,renderCreativeSvg,renderFlowchartSvg,
 type CreativeTheme,type CreativeFormat,type SlideDeckInput,type WordTemplateInput,type PosterInput,type FlowchartInput,
} from "../lib/creativeStudio";

export type CreativeMode="word"|"slides"|"design"|"flowchart";
const TABS:{id:CreativeMode;name:string}[]=[
 {id:"word",name:"Word 文档与模板"},
 {id:"slides",name:"PowerPoint 幻灯片"},
 {id:"design",name:"海报 · 证书 · 封面"},
 {id:"flowchart",name:"流程图制作"},
];
const error=(e:unknown)=>e instanceof Error?e.message:String(e);
const exampleBody="亲爱的 {{recipient}}：\n\n诚挚邀请您参加 **{{event}}**。\n\n活动日期：{{date}}\n\n- 活动主题与流程\n- 参与者须知\n- 联系方式\n\n期待您的参与！";
export default function CreativeStudioDesk({initialMode="word"}:{initialMode?:CreativeMode}){
 const [mode,setMode]=useState<CreativeMode>(initialMode),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [word,setWord]=useState<WordTemplateInput>({
  title:"活动邀请函",recipient:"李同学",event:"创意科技分享会",date:"2026-11-12",body:exampleBody,
 });
 const [slides,setSlides]=useState<SlideDeckInput>({
  title:"我的创意项目",subtitle:"Universal Box · 离线演示文稿",
  outline:"## 我们要解决什么\n- 用户遇到的实际问题\n- 现有方案的局限\n- 我们的目标\n\n## 设计方案\n- 关键思路\n- 使用流程\n- 预期价值\n\n## 下一步\n- 小范围测试\n- 收集反馈\n- 持续完善",
  theme:"ocean",
 });
 const [design,setDesign]=useState<PosterInput>({
  title:"创意分享日",subtitle:"探索 · 设计 · 实践",footer:"2026 · Universal Box",
  theme:"sunset",format:"poster",
 });
 const [flow,setFlow]=useState<FlowchartInput>({title:"创意项目流程",
  steps:"发现问题\n提出设计\n制作原型\n收集意见\n完善成果",theme:"forest"});
 const flowPreview=useMemo(()=>{try{return {svg:renderFlowchartSvg(flow),error:""};}
  catch(e){return {svg:"",error:error(e)};}},[flow]);
 const wordPreview=useMemo(()=>{
  try{return {text:fillWordTemplate(word),error:""};}catch(e){return {text:"",error:error(e)};}
 },[word]);
 const slidePreview=useMemo(()=>{
  try{return {data:parseSlideOutline(slides),error:""};}catch(e){return {data:[],error:error(e)};}
 },[slides]);
 const artPreview=useMemo(()=>{
  try{return {svg:renderCreativeSvg(design),error:""};}catch(e){return {svg:"",error:error(e)};}
 },[design]);
 const updateWord=<K extends keyof WordTemplateInput>(key:K,v:WordTemplateInput[K])=>{
  setWord(old=>({...old,[key]:v}));setStatus("");
 };
 const updateSlides=<K extends keyof SlideDeckInput>(key:K,v:SlideDeckInput[K])=>{
  setSlides(old=>({...old,[key]:v}));setStatus("");
 };
 const updateDesign=<K extends keyof PosterInput>(key:K,v:PosterInput[K])=>{
  setDesign(old=>({...old,[key]:v}));setStatus("");
 };
 async function save(mode:CreativeMode){
  if(busy)return;
  setBusy(true);setStatus("");
  try{
   const file=mode==="word"?{name:"universal-box-template.docx",bytes:await exportWordTemplate(word)}
    :mode==="slides"?{name:"universal-box-slides.pptx",bytes:await exportSlideDeck(slides)}
    :mode==="design"?{name:"universal-box-"+design.format+".svg",bytes:renderCreativeSvg(design)}
    :{name:"universal-box-flowchart.svg",bytes:renderFlowchartSvg(flow)};
   const didSave=await exportFile(file.name,file.bytes);
   setStatus(didSave?"已保存 "+file.name+"。内容在本机生成，未上传文件。":"已取消保存，未修改任何源文件。");
  }catch(e){setStatus("无法生成文件："+error(e));}
  finally{setBusy(false);}
 }
 const themeSelect=(which:"slides"|"design")=><label className="field-label">配色主题
  <select className="field" value={which==="slides"?slides.theme:design.theme}
   onChange={e=>which==="slides"?updateSlides("theme",e.target.value as CreativeTheme):updateDesign("theme",e.target.value as CreativeTheme)}>
   <option value="ocean">海洋蓝 / Ocean</option>
   <option value="sunset">暖霞紫 / Sunset</option>
   <option value="forest">森林绿 / Forest</option>
  </select>
 </label>;
 return <section className="panel" aria-label="Free Creative Office Studio">
  <p className="eyebrow">UNIVERSAL BOX · CREATE & EXPORT · LOCAL FIRST</p>
  <h2>Creative Studio / 免费创作工作台</h2>
  <p className="subtle">不仅是 PDF 或 CSV：从模板制作可编辑 Word 文档、原生 PowerPoint 演示文稿，以及原创 SVG 海报/证书/横幅。无需账号、付费、网络服务或云端上传。</p>
  <div className="pill-row" role="group" aria-label="Creative studio tools">
   {TABS.map(item=><button key={item.id} type="button" className={mode===item.id?"pill active-pill":"pill"}
    aria-pressed={mode===item.id} onClick={()=>{setMode(item.id);setStatus("");}}>{item.name}</button>)}
  </div>
  {mode==="word"&&<>
   <h3>Word 文档模板生成</h3>
   <p className="subtle">使用明确的 {"{{recipient}}"}、{"{{event}}"}、{"{{date}}"} 占位符，生成真实 DOCX，内容可在 Word/LibreOffice 中继续编辑。支持基本标题、粗体和列表；不等于完整的 Word 页面设计。</p>
   <div className="tools-pair">
    <label className="field-label">文档标题<input className="field" data-testid="creative-word-title" maxLength={120} value={word.title} onChange={e=>updateWord("title",e.target.value)}/></label>
    <label className="field-label">收件人 / 姓名<input className="field" maxLength={120} value={word.recipient} onChange={e=>updateWord("recipient",e.target.value)}/></label>
    <label className="field-label">活动 / 主题<input className="field" maxLength={120} value={word.event} onChange={e=>updateWord("event",e.target.value)}/></label>
    <label className="field-label">日期<input className="field" maxLength={60} value={word.date} onChange={e=>updateWord("date",e.target.value)}/></label>
   </div>
   <label className="field-label">Word 模板正文（Markdown）<textarea className="field text-editor" data-testid="creative-word-body" rows={8} maxLength={12000} value={word.body} onChange={e=>updateWord("body",e.target.value)}/></label>
   {wordPreview.error?<p role="alert" className="subtle">{wordPreview.error}</p>:<pre data-testid="creative-word-preview" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:280,overflow:"auto"}}>{wordPreview.text}</pre>}
   <button type="button" className="primary-button" data-testid="creative-word-export" disabled={busy||!!wordPreview.error}
    onClick={()=>void save("word")}>{busy?"正在生成…":"生成并保存可编辑 DOCX"}</button>
  </>}
  {mode==="slides"&&<>
   <h3>PowerPoint 自动排版 · 原生 PPTX</h3>
   <p className="subtle">第一张为封面。以“## 标题”开始每张内容页，每行一个要点，最多 12 张内容页、每页 7 个要点。输出是可编辑的 PowerPoint 文本形状，而不是 PPT 图片截图；尚不支持母版编辑、动画或复杂图片布局。</p>
   <label className="field-label">演示文稿标题<input data-testid="creative-slide-title" className="field" maxLength={100} value={slides.title} onChange={e=>updateSlides("title",e.target.value)}/></label>
   <label className="field-label">封面副标题<input className="field" maxLength={180} value={slides.subtitle} onChange={e=>updateSlides("subtitle",e.target.value)}/></label>
   {themeSelect("slides")}
   <label className="field-label">每页标题与要点
    <textarea className="field text-editor" data-testid="creative-slide-outline" rows={11} maxLength={12000} value={slides.outline} onChange={e=>updateSlides("outline",e.target.value)}/>
   </label>
   {slidePreview.error?<p role="alert" className="subtle">{slidePreview.error}</p>:<>
    <p className="subtle" data-testid="creative-slide-count">{slidePreview.data.length+1} 张幻灯片（含封面）</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,maxHeight:320,overflow:"auto"}}>
     {[{title:slides.title,bullets:[slides.subtitle]},...slidePreview.data].map((slide,i)=><div key={i} style={{
      border:"1px solid #ccd7e7",borderRadius:10,padding:15,minHeight:120,background:i===0?"#152a4d":"#f7f9ff",color:i===0?"white":"#172a49"}}>
      <small>SLIDE {i+1}</small><strong style={{display:"block",margin:"8px 0"}}>{slide.title}</strong>
      {slide.bullets.slice(0,4).map((item,j)=><div key={j} style={{fontSize:11,marginTop:3,overflowWrap:"anywhere"}}>{i?"• ":""}{item}</div>)}
     </div>)}
    </div>
   </>}
   <button type="button" className="primary-button" data-testid="creative-pptx-export" disabled={busy||!!slidePreview.error}
    onClick={()=>void save("slides")}>{busy?"正在生成…":"生成并保存可编辑 PPTX"}</button>
  </>}
  {mode==="design"&&<>
   <h3>免费原创设计 · SVG 矢量输出</h3>
   <p className="subtle">制作海报、证书或横版封面。文字、主题和尺寸都可调整，实时预览。矢量图没有水印，放大仍清晰；当前属于模板设计工具，尚不是分层的任意拖拽画布。</p>
   <div className="tools-pair">
    <label className="field-label">设计用途<select data-testid="creative-design-format" className="field" value={design.format} onChange={e=>updateDesign("format",e.target.value as CreativeFormat)}>
     <option value="poster">竖版海报 900×1200</option><option value="certificate">证书 900×650</option><option value="social">横版封面 1200×675</option>
    </select></label>
    {themeSelect("design")}
   </div>
   <label className="field-label">主标题<input className="field" data-testid="creative-design-title" value={design.title} maxLength={130} onChange={e=>updateDesign("title",e.target.value)}/></label>
   <label className="field-label">副标题<input className="field" value={design.subtitle} maxLength={250} onChange={e=>updateDesign("subtitle",e.target.value)}/></label>
   <label className="field-label">底部文字<input className="field" value={design.footer} maxLength={100} onChange={e=>updateDesign("footer",e.target.value)}/></label>
   {artPreview.error?<p role="alert" className="subtle">{artPreview.error}</p>:<img
    data-testid="creative-design-preview" alt="Generated SVG design preview" style={{display:"block",width:"100%",maxWidth:620,maxHeight:420,objectFit:"contain",borderRadius:8,border:"1px solid #dbe3ee"}}
    src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(artPreview.svg)}/>}
   <button type="button" className="primary-button" data-testid="creative-svg-export" disabled={busy||!!artPreview.error}
    onClick={()=>void save("design")}>{busy?"正在生成…":"保存原创 SVG 设计文件"}</button>
  </>}
  {mode==="flowchart"&&<>
   <h3>Flowchart · 免费流程图制作</h3>
   <p className="subtle">每行一个步骤，自动添加方向箭头并生成真正的 SVG 矢量流程图。最多 12 步；这是简单的线性流程图，不支持复杂分支、多人编辑或任意拖动节点。</p>
   <label className="field-label">流程图标题
    <input className="field" data-testid="creative-flow-title" maxLength={100} value={flow.title}
     onChange={e=>{setFlow(old=>({...old,title:e.target.value}));setStatus("");}}/>
   </label>
   <label className="field-label">流程步骤（每行一项）
    <textarea className="field text-editor" data-testid="creative-flow-steps" rows={7} maxLength={2400} value={flow.steps}
     onChange={e=>{setFlow(old=>({...old,steps:e.target.value}));setStatus("");}}/>
   </label>
   <label className="field-label">配色主题
    <select className="field" value={flow.theme} onChange={e=>setFlow(old=>({...old,theme:e.target.value as CreativeTheme}))}>
     <option value="ocean">海洋蓝</option><option value="sunset">暖霞紫</option><option value="forest">森林绿</option>
    </select>
   </label>
   {flowPreview.error?<p role="alert" className="subtle">{flowPreview.error}</p>:<img
    data-testid="creative-flow-preview" alt="Generated flowchart preview" src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(flowPreview.svg)}
    style={{display:"block",width:"100%",maxWidth:560,maxHeight:460,objectFit:"contain",border:"1px solid #dbe3ee",borderRadius:8}}/>}
   <button type="button" className="primary-button" data-testid="creative-flow-export" disabled={busy||!!flowPreview.error}
    onClick={()=>void save("flowchart")}>{busy?"正在生成…":"导出 SVG 流程图"}</button>
  </>}
  {status&&<p role="status" className="subtle">{status}</p>}
  <p className="subtle">隐私与限制：仅在用户点击后另存新文件。没有外部图片、第三方品牌模板、隐藏网络服务或自动覆盖。复杂排版在不同 Office/字体环境下可能有差异，请用目标软件检查结果。</p>
 </section>;
}