/** Office-first navigation points only to EXISTING working workspaces; no shadow tool implementations. */
export type OfficeShortcut={
  id:string; title:string; hint:string; icon:string; view:string; module?:string;
};
export const OFFICE_MAIN_SHORTCUTS:readonly OfficeShortcut[]=[
  {id:"home-office-pdf",title:"PDF 合并、拆分与页面整理",hint:"选择 PDF → 检查页数与顺序 → 另存新文件",icon:"▣",view:"files",module:"pdf"},
  {id:"home-office-image",title:"图片尺寸与格式转换",hint:"JPEG / PNG / WebP · 查看尺寸与输出格式",icon:"▧",view:"files",module:"images"},
  {id:"home-office-text",title:"纯文本粘贴与复制整理",hint:"主动读取剪贴板 · 预览清理结果 · 复制",icon:"¶",view:"quick-tools",module:"text"},
  {id:"home-office-rename",title:"文件批量重命名",hint:"检查旧名称与新名称 · 导出副本",icon:"⇄",view:"utilities",module:"rename"},
  {id:"home-office-ocr",title:"截图／图片识别文字",hint:"授权截图或选图片 · 核对 OCR · 复制文字",icon:"◎",view:"vision-workflows",module:"ocr"},
  {id:"home-office-word",title:"Word 与 PowerPoint 制作",hint:"可编辑 DOCX / PPTX · 现有模板工作台",icon:"▤",view:"creative-studio",module:"word"},
];
export const OFFICE_FAST_ACTIONS:readonly OfficeShortcut[]=[
  {id:"home-fast-pdf-size",title:"压缩 PDF · 文件大小比较",hint:"本机结构优化；不保证每次变小",icon:"▣",view:"pdf-mini",module:"optimize"},
  {id:"home-fast-photo-kb",title:"照片压到指定 KB",hint:"逐张查看生成效果与真实文件大小",icon:"▧",view:"media-files",module:"photo-target"},
  {id:"home-fast-slides",title:"大纲生成 PowerPoint",hint:"输出可编辑的 PPTX，不是截图",icon:"▤",view:"creative-studio",module:"slides"},
  {id:"home-fast-zip",title:"多个文件打包 ZIP",hint:"手动选择文件、检查清单后导出",icon:"▥",view:"workflows",module:"zip-pack"},
];
