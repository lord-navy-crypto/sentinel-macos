import { describe, expect, it } from "vitest";
import { canHighlight, splitReadingHighlights } from "./highlights";
import type { DeskHighlight } from "./workspace";

const item: DeskHighlight = { id:"h", start:6,end:11,color:"yellow",note:"Key idea" };
describe("reading highlights", () => {
  it("splits plain text with a highlighted range and no HTML injection", () => {
    const fragments=splitReadingHighlights("Start hello end",[item]);
    expect(fragments.map(f=>f.text)).toEqual(["Start ","hello"," end"]);
    expect(fragments[1].highlight?.note).toBe("Key idea");
  });
  it("refuses overlap or out-of-bounds selection", () => {
    expect(canHighlight(7,10,"Start hello end",[item])).toBe(false);
    expect(canHighlight(0,5,"Start hello end",[item])).toBe(true);
    expect(canHighlight(0,150,"Start hello end",[item])).toBe(false);
  });
});
