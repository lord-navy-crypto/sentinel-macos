/** Stable presentation-only families; never changes tool routes or processing. */
export const VISUAL_TOOL_FAMILIES = [
  "全部", "PDF 与文档", "文本与写作", "图片与媒体", "表格与数据",
  "网页与捕获", "文件与批处理", "局域网与共享", "办公小工具", "学习与其他", "系统监控与安全",
] as const;
export type VisualToolFamily = typeof VISUAL_TOOL_FAMILIES[number];

export function visualToolFamily(tool: { name: string; area: string; view: string }): VisualToolFamily {
  const name = tool.name.normalize("NFKC").toLocaleLowerCase();
  const area = tool.area.normalize("NFKC").toLocaleLowerCase();
  if (area === "sentinel" || tool.view.startsWith("sentinel") || tool.view === "better-terminal") return "系统监控与安全";
  if (tool.view === "commons" || /\b(lan|webrtc|sharing|file transfer)\b|局域网|文件传输|团队共享/i.test(name)) return "局域网与共享";
  if (area === "text" || area === "writing") return "文本与写作";
  if (/pdf|word|docx|powerpoint|pptx|document|文档|合同|发票|报价单/.test(name)) return "PDF 与文档";
  if (/image|photo|heic|png|jpeg|jpg|webp|svg|video|audio|subtitle|图片|照片|视频|字幕|音频/.test(name) || /image|media/.test(area)) return "图片与媒体";
  if (/web capture|webpage|website|screenshot|ocr|screen frame|网页|屏幕捕获|截图识字/.test(name)) return "网页与捕获";
  if (/file-intake|duplicate|client-delivery|filename|batch rename|sha-256|文件识别|文件预检|文件清单|重复文件|批量改名|重命名|客户交付/.test(name)) return "文件与批处理";
  if (/csv|tsv|excel|spreadsheet|chart|统计|表格|xlsx|数据/.test(name) || area === "data") return "表格与数据";
  if (area === "text" || area === "writing" || /text|markdown|latex|unicode|文本|字数|字符|字体|符号/.test(name)) return "文本与写作";
  if (area === "files") return "文件与批处理";
  if (area === "study" || area === "classroom" || area === "math") return "学习与其他";
  return "办公小工具";
}
