import { describe, expect, it } from "vitest";
import { markdownToDocx, parseMarkdownBlocks, parseInlineMarkdown } from "./documentExport";
import JSZip from "jszip";

describe("document editing and export", () => {
  it("recognizes headings, lists, quotes and text without deleting content", () => {
    const blocks=parseMarkdownBlocks("# Report\n- First item\n> A note\nRegular paragraph");
    expect(blocks.map(b=>b.kind)).toEqual(["heading","list","quote","paragraph"]);
    expect(blocks[0].level).toBe(1);
  });
  it("retains common bold, italic, strike and code formatting tokens", () => {
    const tick=String.fromCharCode(96);
    const spans=parseInlineMarkdown("Hello **bold** and *italic* "+tick+"code"+tick+" ~~gone~~");
    expect(spans.some(s=>s.text==="bold"&&s.bold)).toBe(true);
    expect(spans.some(s=>s.text==="italic"&&s.italic)).toBe(true);
    expect(spans.some(s=>s.text==="code"&&s.code)).toBe(true);
    expect(spans.some(s=>s.text==="gone"&&s.strike)).toBe(true);
  });
  it("writes Word inline formatting and native list markup", async () => {
    const bytes=await markdownToDocx("# Title\n**strong** and *emphasis*\n- list item");
    const zip=await JSZip.loadAsync(bytes);
    const xml=await zip.file("word/document.xml")?.async("string") ?? "";
    expect(xml).toContain("strong");
    expect(xml).toContain("emphasis");
    expect(xml).toMatch(/<w:b(?:\s|\/|>)/u);
    expect(xml).toMatch(/<w:i(?:\s|\/|>)/u);
    expect(xml).toContain("w:numPr");
  });
  it("generates a Word document ZIP package", async () => {
    const bytes=await markdownToDocx("# Hello\nA test document");
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
