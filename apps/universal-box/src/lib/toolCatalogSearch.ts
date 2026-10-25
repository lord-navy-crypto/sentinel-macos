import { visualToolFamily, VISUAL_TOOL_FAMILIES } from "./toolVisualCategories";

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
  "pdf-measured-optimize": ["pdf size", "smaller pdf", "pdf optimize", "reduce pdf", "优化pdf", "压缩pdf", "压缩 pdf"],
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

function hasExactToolMatch(tool: CatalogSearchableTool, query: string): boolean {
  const term = normalize(query);
  if (!term) return false;
  return [
    tool.name, tool.id, tool.area, tool.view, tool.module ?? "",
    ...(TOOL_ALIASES[tool.id] ?? []),
  ].some(field => normalize(field).includes(term));
}

export function matchesToolQuery(tool: CatalogSearchableTool, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  if (hasExactToolMatch(tool, term)) return true;
  const text = normalize([
    tool.id, tool.name, tool.area, tool.view, tool.module ?? "",
    visualToolFamily(tool), ...(TOOL_ALIASES[tool.id] ?? []),
  ].join(" "));
  return term.split(" ").every(token => text.includes(token));
}


const TOOL_DESCRIPTIONS: Record<string, string> = {
  "better-terminal-console": "打开本机交互式终端并查看命令输出。",
  "better-terminal-homebrew": "通过图形界面查找和管理 Homebrew 软件包。",
  "better-terminal-syscheck": "检查本机系统状态与开发工具。",
  "sentinel-system-overview": "查看系统概览并进入现有检查。",
  "sentinel-review-queue": "集中查看待审查的记录。",
  "sentinel-evidence-search": "搜索本机记录。",
  "sentinel-evidence-graph": "查看记录之间的关联关系。",
  "sentinel-event-timeline": "按时间查看系统事件。",
  "sentinel-processes": "检查进程、启动项和后台活动。",
  "sentinel-network": "查看网络连接与历史记录。",
  "typography-symbols": "转换字体格式、字号和特殊符号。",
  "case-width": "转换大小写与全角、半角文本。",
  "client-delivery": "创建带校验信息的交付包。",
  "meeting-minutes": "整理会议纪要并导出行动清单。",
  "business-billing": "批量生成发票和报价文档。",
  "scan-pdf-compress": "调整扫描 PDF 的压缩参数。",
  "pdf-measured-optimize": "根据实际文件大小优化 PDF。",
  "screen-frame-capture": "在本机截屏并识别图中文字。",
  "target-photo-compressor": "将照片批量压缩到目标文件大小。",
  "word-count": "统计字数、字符数和阅读时间。",
  "mac-offline-voice-to-text": "在本机将音频转换为文字。",
  "csv-docx-mail-merge": "使用 CSV 数据批量生成个性化 Word 文档。",
  "multi-file-literal-replace": "预览并批量替换多个文本文件中的内容。",
  "pdf-converters": "在图片与 PDF 格式之间转换。",
  "file-intake": "预检文件、检查重复项并生成清单。",
  "image-pipeline": "批量调整图片尺寸、转换格式并打包。",
  "duplicate-files": "通过 SHA-256 检查重复文件。",
  "line-batch": "批量排序、去重和整理文本行。",
  "csv-batch-merge": "合并多张 CSV 表格。",
  "csv-table": "筛选、排序并导出 CSV/TSV 表格。",
  "rename": "批量重命名文件副本。",
};

export function catalogToolDescription(tool: CatalogSearchableTool): string {
  const known = TOOL_DESCRIPTIONS[tool.id];
  if (known) return known;

  // Many catalog entries already carry a concise human-authored description after "·".
  // Reuse that existing text instead of repeating the same generic card description.
  const separator = tool.name.lastIndexOf("·");
  if (separator >= 0) {
    const detail = tool.name.slice(separator + 1).split("/").pop()?.trim();
    if (detail) return `功能摘要：${detail}。打开工作台查看具体选项。`;
  }

  switch (visualToolFamily(tool)) {
    case "PDF 与文档": return "打开文档工作台，查看页面整理、预览和导出选项。";
    case "文本与写作": return "打开文本工作台，查看格式转换、清理和比较选项。";
    case "图片与媒体": return "打开媒体工作台，查看图片、音频或视频处理选项。";
    case "表格与数据": return "打开数据工作台，查看表格整理、分析和导出选项。";
    case "网页与捕获": return "打开网页或屏幕捕获工作台，查看可用的采集选项。";
    case "文件与批处理": return "打开文件工作台，查看检查、批处理和导出选项。";
    case "局域网与共享": return "打开共享工作区，查看连接、传输或团队协作选项。";
    case "终端与软件管理": return "打开 Better Terminal，查看终端、软件管理或系统检查选项。";
    case "系统监控与安全": return "打开 Sentinel 工作区，查看对应的本机系统信息与诊断功能。";
    case "学习与其他": return "打开学习工具，查看当前功能和可用选项。";
    default: return "打开现有工作台，查看该工具当前支持的操作。";
  }
}

export function catalogToolSymbol(tool: CatalogSearchableTool): string {
  switch (visualToolFamily(tool)) {
    case "PDF 与文档": return "▤";
    case "文本与写作": return "¶";
    case "图片与媒体": return "▧";
    case "表格与数据": return "▦";
    case "网页与捕获": return "↗";
    case "文件与批处理": return "⇪";
    case "局域网与共享": return "⇄";
    case "终端与软件管理": return ">_";
    case "系统监控与安全": return "◉";
    case "学习与其他": return "✦";
    default: return "◇";
  }
}

export function filterToolCatalog<T extends CatalogSearchableTool>(
  items: readonly T[],
  options: ToolCatalogFilterOptions = {},
): T[] {
  const favorites = new Set(options.favorites ?? []);
  const category = options.category ?? "全部";
  const scoped = items.filter(item =>
    (category === "全部" || visualToolFamily(item) === category)
    && (!options.favoritesOnly || favorites.has(item.id)),
  );
  const query = options.query ?? "";
  const exactMatches = normalize(query) ? scoped.filter(item => hasExactToolMatch(item, query)) : [];
  const matched = exactMatches.length ? exactMatches : scoped.filter(item => matchesToolQuery(item, query));
  const categoryOrder = new Map(VISUAL_TOOL_FAMILIES.map((family, index) => [family, index]));
  return matched
    .slice()
    .sort((a, b) => {
      const favoriteDelta = Number(favorites.has(b.id)) - Number(favorites.has(a.id));
      if (favoriteDelta) return favoriteDelta;
      // The unfiltered catalog should lead with everyday productivity tools rather than
      // letting a large subsystem collection dominate the first screen.
      if (!normalize(query) && category === "全部") {
        return (categoryOrder.get(visualToolFamily(a)) ?? Number.MAX_SAFE_INTEGER)
          - (categoryOrder.get(visualToolFamily(b)) ?? Number.MAX_SAFE_INTEGER);
      }
      return 0;
    });
}
