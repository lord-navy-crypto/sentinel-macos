import {describe,it,expect} from "vitest";
import {markdownToPlain,plainToMarkdown,countWords} from "./textConvert";
describe("website text conversions",()=>{
 it("strips common Markdown and retains optional link URLs",()=>{
  const input="# Hello\n\n**bold** and [a link](https://example.com)\n\n- point";
  expect(markdownToPlain(input)).toContain("bold and a link");
  expect(markdownToPlain(input,true)).toContain("a link (https://example.com)");
  expect(markdownToPlain(input)).toContain("• point");
 });
 it("converts plain paragraphs and bullets back to Markdown",()=>{
  expect(plainToMarkdown("First line\nsecond line\n\n• apple\n• pear")).toBe("First line second line\n\n- apple\n- pear");
 });
 it("keeps fenced code but removes fences",()=>{
  const marker=String.fromCharCode(96).repeat(3);
  expect(markdownToPlain(marker+"js\nconst a=1;\n"+marker)).toBe("const a=1;");
 });
 it("handles empty text and counts words",()=>{
  expect(plainToMarkdown("  ")).toBe("");
  expect(countWords("")).toBe(0);
  expect(countWords("One two")).toBe(2);
 });
});