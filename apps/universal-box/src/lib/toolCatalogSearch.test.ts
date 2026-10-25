import { describe, expect, it } from "vitest";
import { filterToolCatalog, matchesToolQuery, type CatalogSearchableTool } from "./toolCatalogSearch";
import { visualToolFamily } from "./toolVisualCategories";

const tools: CatalogSearchableTool[] = [
  { id: "scan-pdf-compress", name: "Scanned PDF Image Compressor · DPI / JPEG 扫描件压缩", area: "Files", view: "pdf-mini", module: "scan-compress" },
  { id: "pdf-measured-optimize", name: "PDF Size Optimizer · 实测文件大小优化", area: "Files", view: "pdf-mini", module: "optimize" },
  { id: "target-photo-compressor", name: "Target Size Photo Compression · 批量照片指定 KB 压缩", area: "Images", view: "media-files", module: "photo-target" },
  { id: "word-count", name: "Word Counter", area: "Text", view: "utilities", module: "stats" },
  { id: "csv-table", name: "CSV / TSV Table Desk · 表格筛选、排序及导出", area: "Files", view: "tables" },
  { id: "better-terminal-homebrew", name: "Better Terminal · Homebrew 图形安装与包管理", area: "Sentinel", view: "better-terminal", module: "brew" },
  { id: "file-intake", name: "File Intake / 统一文件工作台", area: "Files", view: "file-intake" },
  { id: "sentinel-system-overview", name: "Sentinel · 系统总览 / Easy Scan", area: "Sentinel", view: "sentinel", module: "overview" },
];

describe("Sentinel Box tool catalog discovery", () => {
  it("finds existing tools through Chinese and English task aliases", () => {
    expect(matchesToolQuery(tools[0], "压缩 PDF")).toBe(true);
    expect(matchesToolQuery(tools[1], "reduce pdf")).toBe(true);
    expect(matchesToolQuery(tools[2], "heic 转 jpg")).toBe(true);
    expect(matchesToolQuery(tools[3], "字数统计")).toBe(true);
    expect(matchesToolQuery(tools[4], "清理表格")).toBe(true);
    expect(matchesToolQuery(tools[5], "软件中心")).toBe(true);
    expect(visualToolFamily(tools[5])).toBe("终端与软件管理");
    expect(filterToolCatalog(tools, { category: "终端与软件管理" }).map(tool => tool.id)).toEqual(["better-terminal-homebrew"]);
    expect(matchesToolQuery(tools[7], "系统诊断")).toBe(true);
  });

  it("normalizes Unicode compatibility forms, case, and repeated whitespace", () => {
    expect(matchesToolQuery(tools[4], "  csv   TSV ")).toBe(true);
    expect(matchesToolQuery(tools[3], "WORD COUNTER")).toBe(true);
    expect(matchesToolQuery(tools[3], "完全不存在的工具")).toBe(false);
  });

  it("composes category, query, and favorites filters without changing launch targets", () => {
    const results = filterToolCatalog(tools, {
      query: "压缩 pdf",
      category: "全部",
      favoritesOnly: false,
      favorites: ["pdf-measured-optimize"],
    });
    expect(results.map(tool => [tool.id, tool.view, tool.module])).toEqual([
      ["pdf-measured-optimize", "pdf-mini", "optimize"],
      ["scan-pdf-compress", "pdf-mini", "scan-compress"],
    ]);
    expect(filterToolCatalog(tools, {
      query: "",
      category: "文件与批处理",
      favoritesOnly: false,
      favorites: [],
    }).map(tool => tool.id)).toContain("file-intake");
  });

  it("keeps text utilities in the text family even when their output format mentions DOCX", () => {
    const typography: CatalogSearchableTool = {
      id: "typography-symbols",
      name: "Font & Symbol Converter · 字体字号／特殊符号／TXT→DOCX/HTML",
      area: "Text",
      view: "free-formats",
      module: "typography",
    };
    expect(visualToolFamily(typography)).toBe("文本与写作");
    expect(filterToolCatalog([typography], {
      category: "文本与写作",
    })).toHaveLength(1);
  });

  it("shows all tools for an empty query and filters favorites only when requested", () => {
    expect(filterToolCatalog(tools, {
      query: "   ",
      category: "全部",
      favoritesOnly: false,
      favorites: [],
    })).toHaveLength(tools.length);
    expect(filterToolCatalog(tools, {
      query: "",
      category: "全部",
      favoritesOnly: true,
      favorites: ["better-terminal-homebrew"],
    }).map(tool => tool.id)).toEqual(["better-terminal-homebrew"]);
  });
});
