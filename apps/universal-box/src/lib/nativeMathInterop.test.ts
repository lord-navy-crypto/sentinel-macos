import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {markdownToDocx,mathAwareDocxParagraphs} from "./documentExport";
import {parseLatexEquation} from "./nativeMathInterop";
async function xmlOf(text:string):Promise<string>{
 const bytes=await markdownToDocx(text);
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
 return await zip.file("word/document.xml")!.async("string");
}
describe("Native Word math and Markdown integrity",()=>{
 it("keeps exact numbers and writes real editable fraction, sqrt, upper/lower scripts and Greek",async()=>{
  const source="# 物理研究报告\nThe measured value is 0.0000123000 (not rounded)."+
   "\nInline: $E=mc^2$ and $a_i^2$."+
   "\n$$\n\\frac{\\alpha+1}{\\sqrt{x_2}} = \\pi^2\n$$";
  const xml=await xmlOf(source);
  expect(xml).toContain("物理研究报告");
  expect(xml).toContain("0.0000123000");
  expect(xml).toContain("<m:oMath");
  expect(xml).toContain("<m:f>");
  expect(xml).toContain("<m:rad>");
  expect(xml).toContain("<m:sSup>");
  expect(xml).toContain("<m:sSubSup>");
  expect(xml).toContain("α");
  expect(xml).toContain("π");
 });
 it("handles one-line $$...$$ block equations and copies original scientific notation unchanged",async()=>{
  const xml=await xmlOf("Result\n$$\\frac{1.2300}{0.02500}=49.2$$");
  expect(xml).toContain("1.2300");
  expect(xml).toContain("0.02500");
  expect(xml).toContain("<m:f>");
 });
 it("keeps fenced literal LaTeX as editable code text, not an OMML equation",async()=>{
  const tick=String.fromCharCode(96).repeat(3);
  const xml=await xmlOf(tick+"\n$\\frac{a}{b}$\n"+tick+"\nNormal");
  expect(xml).not.toContain("<m:oMath");
  expect(xml).toContain("frac");
 });
 it("keeps existing titles, lists and bold runs when math is introduced",async()=>{
  const xml=await xmlOf("# Main\n- **strong** item\nQuantity 001230; $x^2$.");
  expect(xml).toContain("001230");
  expect(xml).toContain("w:numPr");
  expect(xml).toContain("<m:sSup>");
  expect(xml).toContain("<w:b");
 });
 it("rejects unsupported environments and malformed math instead of replacing equations by text",async()=>{
  expect(()=>parseLatexEquation("\\begin{matrix}1&2\\end{matrix}")).toThrow(/begin/);
  expect(()=>parseLatexEquation("\\frac{x}")).toThrow(/expected a braced argument/);
  expect(()=>parseLatexEquation("x_")).toThrow(/empty exponent or subscript/);
  expect(()=>parseLatexEquation("x^2^3")).toThrow(/duplicate superscript/);
  expect(()=>parseLatexEquation("\\sqrt[3]{x}")).toThrow(/indexed roots/);
  expect(()=>mathAwareDocxParagraphs("$$\n\\frac{1}{2}\n")).toThrow(/Unclosed/);
  await expect(markdownToDocx("A = $\\unknown{a}$")).rejects.toThrow(/unknown/);
 });
 it("supports representative Greek, comparisons and math operator symbols without numeric evaluation",async()=>{
  const xml=await xmlOf("$$\\Delta x \\approx \\alpha\\times10^3 \\leq \\infty$$");
  for(const char of ["Δ","≈","α","×","≤","∞"])expect(xml).toContain(char);
 });
});
