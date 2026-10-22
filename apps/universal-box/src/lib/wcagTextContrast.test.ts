import {describe,it,expect} from "vitest";
import {normalizeHexColor,relativeLuminance,wcagContrast,suggestBlackOrWhite,contrastTextReport} from "./wcagTextContrast";

describe("WCAG 2.2 opaque sRGB color contrast",()=>{
 it("normalizes shorthand and full hexadecimal colors, but rejects alpha and invalid text",()=>{
  expect(normalizeHexColor(" #abc ")).toBe("#AABBCC");
  expect(normalizeHexColor("abcdef")).toBe("#ABCDEF");
  expect(normalizeHexColor("#fff")).toBe("#FFFFFF");
  for(const invalid of ["","red","#12","#abcd","#12345678","hsl(0,0%,0%)","#gggggg"])
   expect(()=>normalizeHexColor(invalid)).toThrow(/颜色/);
 });
 it("computes W3C luminance and 21:1 maximum / 1:1 minimum",()=>{
  expect(relativeLuminance("#000")).toBe(0);
  expect(relativeLuminance("#fff")).toBeCloseTo(1,12);
  const max=wcagContrast("#000000","#FFFFFF");
  expect(max.ratio).toBeCloseTo(21,12);
  expect(max.aaNormal).toBe(true);expect(max.aaaNormal).toBe(true);
  const same=wcagContrast("#777777","#777777");
  expect(same.ratio).toBeCloseTo(1,12);
  expect(same.aaLarge).toBe(false);expect(same.aaaLarge).toBe(false);
 });
 it("uses actual unrounded ratio: #777 fails AA normal but #767676 passes",()=>{
  const fail=wcagContrast("#777777","#FFFFFF");
  expect(fail.ratio).toBeGreaterThan(4.4);
  expect(fail.ratio).toBeLessThan(4.5);
  expect(fail.aaNormal).toBe(false);
  expect(fail.aaLarge).toBe(true);
  expect(fail.aaaNormal).toBe(false);
  const passing=wcagContrast("#767676","#FFFFFF");
  expect(passing.ratio).toBeGreaterThanOrEqual(4.5);
  expect(passing.aaNormal).toBe(true);
  expect(wcagContrast("#FFFFFF","#767676").ratio).toBeCloseTo(passing.ratio,12);
 });
 it("recommends a mathematically better black or white text color, without mutating source",()=>{
  expect(suggestBlackOrWhite("#000000")).toEqual({foreground:"#FFFFFF",ratio:21});
  expect(suggestBlackOrWhite("#FFFFFF")).toEqual({foreground:"#000000",ratio:21});
  const base=wcagContrast("#777","#fff");
  const report=contrastTextReport(base);
  expect(report).toContain("Contrast: ");
  expect(report).toContain("AA normal text (4.5:1): NOT MET");
  expect(report).toContain("AA large text (3:1): PASS");
  expect(report).toContain("not full document accessibility");
  expect(base.foreground).toBe("#777777");
 });
});
