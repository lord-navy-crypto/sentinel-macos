/** Stable presentation-only families; does not change tool routes, permissions or processing. */
export const VISUAL_TOOL_FAMILIES=[
 "全部","PDF 与文档","文本与写作","图片与媒体","表格与数据","网页与捕获","局域网与共享","办公小工具","学习与其他","系统监控与安全"
] as const;
export type VisualToolFamily=typeof VISUAL_TOOL_FAMILIES[number];
export function visualToolFamily(tool:{name:string;area:string;view:string}):VisualToolFamily{
 const name=tool.name.toLowerCase(),area=tool.area.toLowerCase();
 if(area==="sentinel"||tool.view.startsWith("sentinel"))return "系统监控与安全";
 if(tool.view==="commons"||/\b(lan|webrtc|sharing|file transfer)\b/i.test(name))return "局域网与共享";
 if(/pdf|word|docx|powerpoint|pptx|ppt |document|文档|合同/.test(name))return "PDF 与文档";
 if(/image|photo|heic|png|jpeg|jpg|webp|svg|video|audio|subtitle|图片|照片|视频|字幕/.test(name)||/image|media/.test(area))return "图片与媒体";
 if(/web capture|webpage|website|screenshot|ocr|屏幕|网页/.test(name))return "网页与捕获";
 if(/csv|tsv|excel|spreadsheet|chart|统计|表格|xlsx|数据/.test(name)||area==="data")return "表格与数据";
 if(area==="text"||area==="writing"||/text|markdown|latex|unicode|文本/.test(name))return "文本与写作";
 if(area==="files"||area==="office")return "PDF 与文档";
 if(area==="study"||area==="classroom"||area==="math")return "学习与其他";
 return "办公小工具";
}
