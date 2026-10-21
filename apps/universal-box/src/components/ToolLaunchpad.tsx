import {useEffect,useMemo,useState} from "react";

export type LocalTool = {id:string;name:string;area:string;view:string;module?:string};
export const LOCAL_TOOLS:LocalTool[] = [
 {id:"meeting-minutes",name:"Meeting Minutes & Assigned Tasks · 会议纪要 Word＋行动 CSV",area:"Office",view:"workflows",module:"meeting-minutes"},
 {id:"business-billing",name:"Business Invoices & Quotes · 批量发票报价单 Word/PDF",area:"Office",view:"workflows",module:"business-billing"},
 {id:"scan-pdf-compress",name:"Scanned PDF Image Compressor · DPI / JPEG 扫描件压缩",area:"Files",view:"pdf-mini",module:"scan-compress"},
 {id:"pdf-measured-optimize",name:"PDF Size Optimizer · 实测文件大小优化",area:"Files",view:"pdf-mini",module:"optimize"},
 {id:"speech-timed-srt-vtt",name:"Speech Timed Subtitles · Apple Speech 音频时间戳转 SRT/VTT",area:"Media",view:"media-files",module:"speech"},
 {id:"selected-xlsx-sheets",name:"XLSX Multi-Sheet Export · Excel 工作表选择导出 CSV",area:"Data",view:"workflows",module:"sheet-select"},
 {id:"manual-multi-clip-basket",name:"Multi-Clip Text Basket · 手动多段收集、排序与合并",area:"Files",view:"workflows",module:"clip-basket"},
 {id:"mac-offline-voice-to-text",name:"Local Speech to Text · Apple Speech 本机音频转文字",area:"Media",view:"media-files",module:"speech"},
 {id:"voice-recorder-transcription",name:"Record & Transcribe · 麦克风录音转文字（本机）",area:"Media",view:"media-files",module:"speech"},
 {id:"offline-audio-file-to-word",name:"Audio to Word Notes · 音频转写并生成可编辑 DOCX",area:"Office",view:"media-files",module:"speech"},
 {id:"target-photo-compressor",name:"Target Size Photo Compression · 批量照片指定 KB 压缩",area:"Images",view:"media-files",module:"photo-target"},
 {id:"windows-macos-text-converter",name:"Windows ↔ macOS Text Encoding · UTF-8/UTF-16/GB18030 与 LF/CRLF",area:"Files",view:"media-files",module:"portable-text"},
 {id:"word-paragraph-diff",name:"Word Paragraph Diff · 对比两份 DOCX 的文本变化",area:"Office",view:"workflows",module:"word-diff"},
 {id:"wav-silence-auto-trim",name:"WAV Silence Auto Trim · 自动去除音频首尾静音",area:"Media",view:"workflows",module:"wav-silence"},
 {id:"pdf-batch-page-inventory",name:"PDF Batch Page Audit · 多文档尺寸方向与页数清单",area:"Files",view:"workflows",module:"pdf-audit"},
 {id:"csv-docx-mail-merge",name:"CSV Mail Merge → Word · 批量制作个性化 DOCX",area:"Office",view:"workflows",module:"mail-merge"},
 {id:"keyed-two-csv-join",name:"CSV Key Join · 按 ID 关联合并两张表",area:"Data",view:"workflows",module:"csv-key-join"},
 {id:"multi-file-literal-replace",name:"Multi-file Text Replace · 多文件安全批量查找替换",area:"Files",view:"workflows",module:"text-file-batch"},
 {id:"unified-mixed-files",name:"Unified Workflow · Word, PPT, CSV, JSON, text & images → one ZIP",area:"Workflows",view:"workflows",module:"unified"},
 {id:"unified-audit-manifest",name:"Unified Source Audit · SHA-256, per-file conversion logs and ZIP report",area:"Privacy",view:"workflows",module:"unified"},
 {id:"unified-document-extraction",name:"Mixed Office Text Batch · extract DOCX & PPTX alongside data files",area:"Office",view:"workflows",module:"unified"},
 {id:"mac-native-vision-ocr",name:"Apple Vision OCR · Mac 本机图片文字识别与 Word 导出",area:"Office",view:"vision-workflows",module:"ocr"},
 {id:"single-frame-screen-capture",name:"Screen Frame Capture · 用户授权选屏截图 PNG",area:"Images",view:"vision-workflows",module:"capture"},
 {id:"one-click-project-pack",name:"One-Click Project Kit · Word+PPTX+SVG 项目成果 ZIP",area:"Creative",view:"vision-workflows",module:"project"},
 {id:"ocr-to-editable-word",name:"Image to Editable Word · 识别图片生成 DOCX",area:"Office",view:"vision-workflows",module:"ocr"},
 {id:"subtitles-two-point-sync",name:"Subtitle Drift Repair · 双时间锚点校准 SRT 与 VTT",area:"Media",view:"life-media",module:"subtitle"},
 {id:"file-auto-organize",name:"Smart File Organizer · 按类型分类文件到 ZIP",area:"Files",view:"life-media",module:"organize"},
 {id:"batch-calendar-events",name:"Bulk Calendar ICS Generator · 多事件日历制作",area:"Planning",view:"life-media",module:"calendar"},
 {id:"calendar-conflict-check",name:"Calendar Conflict Check · 日程时间冲突检查",area:"Planning",view:"life-media",module:"calendar"},
 {id:"screen-image-markup",name:"Screenshot & Image Markup · 箭头、文字、方框标注",area:"Images",view:"daily-studio",module:"annotate"},
 {id:"opaque-image-redaction",name:"Opaque Image Blackout · 本地实心遮挡敏感区域",area:"Privacy",view:"daily-studio",module:"annotate"},
 {id:"printable-study-cards",name:"Printable Study Cards A4 · 学习卡片与活动票券",area:"Creative",view:"daily-studio",module:"print"},
 {id:"print-label-sheet",name:"Printable Labels Sheet · A4 分类标签",area:"Creative",view:"daily-studio",module:"print"},
 {id:"json-typescript-inference",name:"JSON to TypeScript Types · 本地类型推断与导出",area:"Code",view:"daily-studio",module:"json-types"},
 {id:"json-path-inventory",name:"JSON Path Audit TSV · 结构路径导出",area:"Code",view:"daily-studio",module:"json-types"},
 {id:"docx-content-extract",name:"Word DOCX Inspector · 段落提取与图片 ZIP 导出",area:"Office",view:"extra-studio",module:"office"},
 {id:"pptx-content-extract",name:"PowerPoint PPTX Reader · 读取讲稿文字和媒体资源",area:"Office",view:"extra-studio",module:"office"},
 {id:"video-frame-export",name:"Video Frame Extractor · 视频单帧 PNG 截图",area:"Media",view:"extra-studio",module:"video"},
 {id:"video-storyboard",name:"Video Storyboard Sheet · 自动生成 6 帧分镜图",area:"Media",view:"extra-studio",module:"video"},
 {id:"mindmap-create",name:"Mind Map Generator · 思维导图 SVG 导出",area:"Creative",view:"extra-studio",module:"diagrams"},
 {id:"timeline-create",name:"Milestone Timeline Maker · 项目时间线",area:"Creative",view:"extra-studio",module:"diagrams"},
 {id:"word-templates",name:"Word DOCX Templates · 免费邀请函、会议纪要、信件生成",area:"Office",view:"creative-studio",module:"word"},
 {id:"pptx-deck-maker",name:"PowerPoint PPTX Creator · 大纲 → 可编辑幻灯片",area:"Creative",view:"creative-studio",module:"slides"},
 {id:"poster-maker",name:"Free Poster & Invitation Maker · 海报与活动宣传",area:"Creative",view:"creative-studio",module:"design"},
 {id:"diagram-flowchart",name:"Flowchart Maker · 免费流程图 SVG 导出",area:"Creative",view:"creative-studio",module:"flowchart"},
 {id:"certificate-maker",name:"Certificate & Social Cover Templates · 证书与封面",area:"Creative",view:"creative-studio",module:"design"},
 {id:"web-capture-workbench",name:"Web Capture Companion · 浏览器扩展 + 免费 CSV 数据清理与安全导出",area:"Office",view:"web-capture"},
 {id:"binary-compare",name:"Binary Compare · 精确逐字节文件差异检测 / 热力图",area:"Files",view:"binary-compare"},
 {id:"system-health",name:"System Health · 本地启动与功能自检 / 导出诊断报告",area:"System",view:"system-health"},
 {id:"file-integrity",name:"File Integrity · SHA-256 清单导出、跨电脑比对与异常提醒",area:"Files",view:"file-intake"},
 {id:"file-intake",name:"File Intake · 文件识别、拖放 SHA-256、重复检查、CSV 清单",area:"Files",view:"file-intake"},
 {id:"commons-team",name:"Universal Commons · 免费共享文件、离线团队留言和任务包",area:"Sharing",view:"commons"},
 {id:"easy-local-ai",name:"Easy Local AI · WebGPU + WebLLM Model Chat",area:"AI",view:"local-ai"},
 {id:"local-ai-models",name:"Local AI Model Manager · Download, Check & Remove",area:"AI",view:"local-ai"},
 {id:"charts",name:"Data Chart Studio · CSV 柱状图和折线图",area:"Data",view:"charts"},
 {id:"universal-helper",name:"Universal Helper · 用一句话找到现有本地工具",area:"Access",view:"access"},
 {id:"universal-access",name:"Reading Size, Contrast & Simple Mode / 无障碍设置",area:"Access",view:"access"},
 {id:"pdf-properties",name:"PDF Properties & Metadata Editor · 文件属性",area:"Files",view:"pdf-mini",module:"metadata"},
 {id:"pdf-hyperlinks",name:"PDF Hyperlink Editor · 检查、更换、移除、新增可点击网址",area:"Files",view:"pdf-mini",module:"links"},
 {id:"pdf-crop",name:"PDF Crop Margins · 页面裁边",area:"Files",view:"pdf-mini",module:"crop"},
 {id:"pdf-add-blank",name:"Insert Blank Pages into PDF · 添加空白页",area:"Files",view:"pdf-mini",module:"blank"},
 {id:"pdf-fill-form",name:"Basic PDF Text Form Filler · 填写PDF表单",area:"Office",view:"pdf-mini",module:"form"},
 {id:"xlsx-csv-converter",name:"Free Excel XLSX ↔ CSV / JSON · Offline Spreadsheet Data",area:"Office",view:"free-formats",module:"spreadsheet"},
 {id:"image-difference",name:"Image Difference & Overlay · Compare Two Pictures",area:"Images",view:"free-formats",module:"image-diff"},
 {id:"html-entity-text",name:"HTML Entities & Unicode NFC/NFKC Text Tools",area:"Text",view:"free-formats",module:"text-codec"},
 {id:"zip-batch-pack",name:"Batch ZIP Pack · 本地批量压缩文件",area:"Files",view:"workflows",module:"zip-pack"},
 {id:"zip-selective-export",name:"Safe ZIP Selective Extract & Repack · CRC Checked",area:"Files",view:"workflows",module:"zip-selective"},
 {id:"image-pipeline",name:"Batch Image Pipeline · Resize → Convert → Rename → ZIP",area:"Images",view:"workflows",module:"image-batch"},
 {id:"contacts-csv-vcf",name:"CSV → vCard Contacts (.vcf) · Batch Address Book",area:"Office",view:"office-privacy",module:"contacts"},
 {id:"text-mail-merge",name:"Free Mail Merge · CSV Template → TXT ZIP",area:"Office",view:"office-privacy",module:"mail-merge"},
 {id:"duplicate-files",name:"SHA-256 Duplicate File Finder · Local Only",area:"Files",view:"office-privacy",module:"duplicates"},
 {id:"unicode-hidden",name:"Unicode Hidden Character & Bidi Inspector",area:"Privacy",view:"office-privacy",module:"unicode"},
 {id:"wav-studio",name:"WAV Audio Editor · Trim, Normalize, Fade",area:"Media",view:"media-files",module:"audio"},
 {id:"zip-inspector",name:"ZIP Archive Metadata & Safety Inspector",area:"Files",view:"media-files",module:"zip-inspect"},
 {id:"icon-maker",name:"Icon Generator · 7 PNG Sizes into ZIP",area:"Images",view:"media-files",module:"icons"},
 {id:"photo-palette",name:"Photo Color Palette / 图片主色提取",area:"Images",view:"media-files",module:"palette"},
 {id:"line-batch",name:"Batch Text Lines · Sort, Deduplicate, Prefix/Suffix",area:"Text",view:"universal-lab",module:"lines"},
 {id:"subtitle-converter",name:"SRT ↔ WebVTT Subtitle Converter & Time Shifter",area:"Media",view:"universal-lab",module:"subtitles"},
 {id:"photo-contact-sheet",name:"Photo Contact Sheet · 图片网格拼版",area:"Images",view:"universal-lab",module:"photo-sheet"},
 {id:"url-parameter-inspector",name:"URL Query Parameter Inspector · 网址结构分析",area:"Code",view:"universal-lab",module:"url-inspector"},
 {id:"qr-studio-batch",name:"Free QR Studio · Wi-Fi, vCard, SVG Batch ZIP",area:"Classroom",view:"universal-box",module:"qr"},
 {id:"ics-calendar",name:"Calendar Invite File Generator (.ics) · No Account",area:"Office",view:"universal-box",module:"calendar"},
 {id:"uuid-batch",name:"Cryptographic UUID v4 Batch Generator",area:"Code",view:"universal-box",module:"uuid"},
 {id:"json-to-csv",name:"JSON Records → CSV · Safe Export",area:"Data",view:"universal",module:"json-csv"},
 {id:"world-meeting-clock",name:"World Meeting Clock · 国际时区对照",area:"Study",view:"universal",module:"timezones"},
 {id:"sha256-check",name:"SHA-256 File Checksum Verifier",area:"Files",view:"universal",module:"checksum"},
 {id:"secure-password",name:"Local Password Generator",area:"Privacy",view:"universal",module:"password"},
 {id:"photo-metadata-clean",name:"Image Metadata Cleaner · 照片隐私清理",area:"Privacy",view:"universal",module:"image-privacy"},
 {id:"quick-multi-copy",name:"Multi-copy Text Basket · 一次复制多段文字",area:"Text",view:"quick-tools",module:"multi-copy"},
 {id:"quick-literal-replace",name:"Literal Find and Replace · 批量查找替换",area:"Text",view:"quick-tools",module:"replace"},
 {id:"quick-clean-text",name:"Text Cleaner · 一键文本整理",area:"Text",view:"quick-tools",module:"text"},
 {id:"quick-clean-links",name:"Tracking Link Cleaner · 清理追踪链接",area:"Text",view:"quick-tools",module:"links"},
 {id:"quick-date",name:"Date Difference & Date Shift",area:"Study",view:"quick-tools",module:"dates"},
 {id:"quick-grade",name:"Weighted Grade & Exam Target",area:"Study",view:"quick-tools",module:"grades"},
 {id:"calculator",name:"Calculator / 计算器",area:"Math",view:"math",module:"calculator"},
 {id:"graph",name:"Advanced Graph / 高级绘图",area:"Math",view:"math",module:"graph"},
 {id:"calculus",name:"Derivatives, Integrals & Roots",area:"Math",view:"math",module:"calculus"},
 {id:"math-extras",name:"BASE-N, Equations, Statistics, Matrix",area:"Math",view:"math",module:"extras"},
 {id:"classwiz",name:"Advanced Calculator · Complex / Matrix / Regression / Probability",area:"Math",view:"math",module:"classwiz"},
 {id:"formula-board",name:"Formula Board",area:"Math",view:"math",module:"formula"},
 {id:"latex",name:"LaTeX Preview",area:"Math",view:"math",module:"latex"},
 {id:"units",name:"Full Units · Temperature · Physical Constants",area:"Math",view:"math",module:"units"},
 {id:"sci-notation",name:"Scientific Notation & Sig Figs",area:"Math",view:"math",module:"notation"},
 {id:"vector",name:"Vector Arithmetic",area:"Math",view:"math",module:"vector"},
 {id:"focus",name:"Pomodoro / Focus Sound",area:"Study",view:"focus"},
 {id:"flashcards",name:"Saved Flashcards & Vocabulary",area:"Study",view:"cards"},
 {id:"paste-flashcards",name:"Instant Paste Flashcards",area:"Study",view:"learning",module:"paste"},
 {id:"mistakes",name:"Mistake Notebook",area:"Study",view:"learning",module:"mistakes"},
 {id:"countdown",name:"Exam Countdown",area:"Study",view:"learning",module:"countdown"},
 {id:"dictation",name:"Dictation Practice",area:"Study",view:"learning",module:"dictation"},
 {id:"rewrite",name:"Paraphrase Comparator",area:"Study",view:"learning",module:"rewrite"},
 {id:"reading",name:"Reading Highlight & Notes",area:"Study",view:"reading"},
 {id:"typewriter",name:"Typewriter Memory Mode",area:"Study",view:"learning",module:"typewriter"},
 {id:"code-editor",name:"Code Editor / 代码编辑器",area:"Code",view:"code"},
 {id:"code-board",name:"Saved Code Snippets",area:"Code",view:"learning",module:"code"},
 {id:"json",name:"JSON Formatter",area:"Text",view:"utilities",module:"json"},
 {id:"base64",name:"Base64 / URL Encode",area:"Text",view:"utilities",module:"encode"},
 {id:"word-count",name:"Word Counter",area:"Text",view:"utilities",module:"stats"},
 {id:"text-diff",name:"Text Comparator",area:"Text",view:"utilities",module:"diff"},
 {id:"csv",name:"CSV → Markdown",area:"Text",view:"utilities",module:"csv"},
 {id:"csv-batch-merge",name:"Merge Multiple CSV Tables · 多张表格合并",area:"Data",view:"tables"},
 {id:"csv-table",name:"CSV / TSV Table Desk · 表格筛选、排序及导出",area:"Files",view:"tables"},
 {id:"markdown-plain",name:"Markdown → Plain Text",area:"Text",view:"utilities",module:"markdown"},
 {id:"write",name:"Markdown / Word Editor",area:"Writing",view:"writing"},
 {id:"notes",name:"Quick Notes",area:"Writing",view:"notes"},
 {id:"drawing",name:"Black Draft Board",area:"Writing",view:"drawing"},
 {id:"pdf",name:"PDF Preview & Tools",area:"Files",view:"files",module:"pdf"},
 {id:"pdf-freedom",name:"PDF Freedom Studio · Add Text, Page Numbers, Watermarks, Signatures",area:"Files",view:"files",module:"decorate"},
 {id:"pdf-converters",name:"Image ↔ PDF · PNG/JPEG to PDF, PDF Pages to ZIP",area:"Files",view:"files",module:"convert"},
 {id:"pdf-organize",name:"PDF Reorder / Delete Pages",area:"Files",view:"files",module:"organize"},
 {id:"image",name:"Image Resize, Crop & Convert",area:"Files",view:"files",module:"images"},
 {id:"image-interactive-crop",name:"Interactive Crop · 比例裁剪与旋转",area:"Files",view:"files",module:"images"},
 {id:"image-batch",name:"Batch Image Conversion → ZIP",area:"Files",view:"files",module:"images"},
 {id:"docx",name:"Word → Markdown / PDF Preview",area:"Files",view:"files",module:"word"},
 {id:"filename-manifest",name:"Export File Names TXT / CSV · 文件名清单",area:"Files",view:"utilities",module:"rename"},
 {id:"rename",name:"Batch Rename Copies",area:"Files",view:"utilities",module:"rename"},
 {id:"color",name:"Color Contrast",area:"Classroom",view:"utilities",module:"color"},
 {id:"qr",name:"Basic QR Code / 简单二维码",area:"Classroom",view:"utilities",module:"qr"},
 {id:"groups",name:"Random Picker & Groups",area:"Classroom",view:"utilities",module:"groups"},
 {id:"presets",name:"Short Codes / Link Presets",area:"Classroom",view:"presets"},
 {id:"planner",name:"Tasks & Planner",area:"Study",view:"tasks"},
 {id:"backup",name:"Backup & Privacy",area:"Files",view:"data"}
];
const NOT_LOCAL = ["Website AI / cloud models (needs configured AI connection)", "Speech-to-text transcription (microphone and speech engine integration)", "Public short-link hosting and shared workspaces"];

export default function ToolLaunchpad({onLaunch}:{onLaunch:(view:string,module?:string)=>void}) {
 const [search,setSearch]=useState("");
 const [category,setCategory]=useState("All");
 const [showFavorites,setShowFavorites]=useState(false);
 const [favorites,setFavorites]=useState<string[]>(()=>{
   try{
     const parsed=JSON.parse(localStorage.getItem("universal-box-favorite-tools")||"[]") as unknown;
     return Array.isArray(parsed)?parsed.filter((id):id is string=>typeof id==="string"&&LOCAL_TOOLS.some(tool=>tool.id===id)).slice(0,40):[];
   }catch{return [];}
 });
 useEffect(()=>{
   try{localStorage.setItem("universal-box-favorite-tools",JSON.stringify(favorites));}
   catch{/* saved preferences are optional */}
 },[favorites]);
 const groups=["All",...Array.from(new Set(LOCAL_TOOLS.map(item=>item.area)))];
 const filtered=useMemo(()=>{
   const term=search.trim().toLocaleLowerCase();
   const matches=LOCAL_TOOLS.filter(item=>
     (category==="All"||item.area===category)
     &&(!showFavorites||favorites.includes(item.id))
     &&(!term||(item.name+" "+item.id+" "+item.area).toLocaleLowerCase().includes(term)));
   return matches.sort((a,b)=>Number(favorites.includes(b.id))-Number(favorites.includes(a.id)));
 },[category,search,favorites,showFavorites]);
 function toggleFavorite(id:string){
   setFavorites(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id].slice(0,40));
 }
 return <section className="panel tool-catalog">
   <div className="catalog-heading">
     <div><p className="eyebrow">DISCOVER · CREATE · CONVERT · LEARN</p>
       <h2>Explore your toolbox</h2>
       <p className="subtle">Search for exactly what you need. Every local tool opens inside Sentinel Box; favorites are saved only on this device.</p>
     </div>
     <div className="catalog-count"><strong>{LOCAL_TOOLS.length}</strong><span>tool entries</span></div>
   </div>
   <div className="catalog-filter-bar">
     <label className="field-label" htmlFor="all-tools-search">Search the tool library
       <input autoComplete="off" className="field" id="all-tools-search" value={search}
         onChange={e=>setSearch(e.target.value)} placeholder="Try PDF, CSV, QR, image, audio, graph…" />
     </label>
     <button type="button" className={showFavorites?"secondary-button favorites-only enabled":"secondary-button favorites-only"}
       onClick={()=>setShowFavorites(old=>!old)} aria-pressed={showFavorites}>★ Favorites ({favorites.length})</button>
     {search&&<button type="button" className="secondary-button catalog-clear" onClick={()=>setSearch("")}>Clear</button>}
   </div>
   <div className="category-scroll" role="group" aria-label="Filter tool category">
     {groups.map(group=><button type="button" key={group}
       className={category===group?"pill active-pill":"pill"} aria-pressed={category===group}
       onClick={()=>setCategory(group)}>{group}</button>)}
   </div>
   <div className="catalog-results-header"><span>{filtered.length} matching tools</span><span>{favorites.length?"★ Favorites appear first":"Star your most-used tools for faster access"}</span></div>
   {filtered.length?<div className="tool-grid catalog-grid">
     {filtered.map(item=><div key={item.id} className="catalog-card">
       <button className="catalog-favorite" type="button" aria-label={favorites.includes(item.id)?"Remove "+item.name+" from favorites":"Add "+item.name+" to favorites"}
         aria-pressed={favorites.includes(item.id)} onClick={()=>toggleFavorite(item.id)}>{favorites.includes(item.id)?"★":"☆"}</button>
       <button className="catalog-open" type="button" onClick={()=>onLaunch(item.view,item.module)}>
         <span className="catalog-icon" aria-hidden="true">{item.area==="Images"?"▧":item.area==="Math"?"∑":item.area==="Files"?"▤":item.area==="Office"?"▦":item.area==="Code"?"⌘":"◇"}</span>
         <strong>{item.name}</strong><span className="catalog-area">{item.area}</span>
         <span className="tool-state">OPEN TOOL →</span>
       </button>
     </div>)}
   </div>:<div className="catalog-empty"><strong>No matching tools</strong><p className="subtle">Try a different keyword or clear the category and favorites filters.</p>
     <button className="secondary-button" type="button" onClick={()=>{setCategory("All");setSearch("");setShowFavorites(false);}}>Reset filters</button>
   </div>}
   <div className="catalog-external">
     <div><h3>Need something more advanced?</h3>
       <p className="subtle">Optional third-party sites open in your default browser. They are clearly separate from your private local toolbox.</p></div>
     <button className="secondary-button" type="button" onClick={()=>onLaunch("external")}>Browse external services ↗</button>
   </div>
   <p className="subtle">Not available as offline equivalents: {NOT_LOCAL.join(" · ")}.</p>
 </section>;
}
