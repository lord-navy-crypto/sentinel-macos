import { visualToolFamily } from "./toolVisualCategories";

export type CatalogSearchableTool = {
  id: string;
  name: string;
  area: string;
  view: string;
  module?: string;
};

export type ToolCatalogFilterOptions = {
  query?: string;
  category?: string;
  favoritesOnly?: boolean;
  favorites?: readonly string[];
};

const TOOL_ALIASES: Record<string, readonly string[]> = {
  "better-terminal-console": ["terminal", "shell", "本地终端", "命令行", "终端"],
  "better-terminal-homebrew": ["homebrew", "brew install", "software center", "软件中心", "软件商店", "安装软件", "更新软件", "卸载软件"],
  "better-terminal-syscheck": ["developer tools", "system check", "开发环境检查", "系统状态"],
  "sentinel-system-overview": ["easy scan", "system overview", "系统诊断", "系统总览", "安全扫描"],
  "sentinel-review-queue": ["review queue", "待审查", "证据待办"],
  "sentinel-evidence-search": ["evidence search", "查找证据", "本机证据"],
  "sentinel-evidence-graph": ["evidence graph", "关系图", "证据关系"],
  "sentinel-event-timeline": ["timeline", "事件时间线", "系统事件"],
  "sentinel-processes": ["processes", "startup items", "进程", "启动项"],
  "sentinel-network": ["network connections", "网络连接", "网络历史"],
  "typography-symbols": ["font size", "font converter", "字体转换", "字体字号", "特殊符号"],
  "case-width": ["uppercase", "lowercase", "fullwidth halfwidth", "大小写转换", "全角半角"],
  "client-delivery": ["client handoff", "delivery package", "客户交付", "文件交付"],
  "meeting-minutes": ["meeting minutes", "会议纪要", "会议待办"],
  "business-billing": ["invoice", "quotation", "发票", "报价单"],
  "scan-pdf-compress": ["compress pdf", "reduce pdf", "扫描件压缩", "压缩pdf", "压缩 pdf"],
  "pdf-measured-optimize": ["pdf size", "smaller pdf", "pdf optimize", "优化pdf", "压缩pdf", "压缩 pdf"],
  "screen-frame-capture": ["screen capture", "screenshot ocr", "截图识字", "屏幕识字"],
  "target-photo-compressor": ["photo compress", "heic to jpg", "heic转jpg", "图片压缩", "图片转换"],
  "word-count": ["character count", "count words", "字数统计", "字符统计"],
  "mac-offline-voice-to-text": ["transcribe", "speech to text", "录音转文字", "语音识别"],
  "csv-docx-mail-merge": ["mail merge", "csv to word", "邮件合并", "批量word"],
  "multi-file-literal-replace": ["find replace", "batch replace", "查找替换", "批量替换"],
  "pdf-converters": ["images to pdf", "pdf to images", "图片转pdf", "pdf转图片"],
  "file-intake": ["file inspect", "duplicate check", "文件预检", "文件识别", "重复文件", "文件清单"],
  "image-pipeline": ["batch image", "image zip", "批量图片", "图片打包"],
  "duplicate-files": ["duplicate file finder", "find duplicate files", "重复文件", "查重文件"],
  "line-batch": ["batch text lines", "sort lines", "文本行排序", "文本去重"],
  "csv-batch-merge": ["merge csv", "combine csv", "合并csv", "合并表格"],
  "csv-table": ["csv table", "tsv table", "清理表格", "筛选表格", "排序表格"],
  "rename": ["batch rename", "rename files", "批量重命名", "批量改名"],
};

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/gu, " ");

export function matchesToolQuery(tool: CatalogSearchableTool, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  const text = normalize([
    tool.id, tool.name, tool.area, tool.view, tool.module ?? "",
    visualToolFamily(tool), ...(TOOL_ALIASES[tool.id] ?? []),
  ].join(" "));
  return term.split(" ").every(token => text.includes(token));
}
