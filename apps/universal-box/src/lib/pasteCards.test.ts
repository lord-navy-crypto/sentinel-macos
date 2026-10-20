import {describe,it,expect} from "vitest";
import {parseQuickCards} from "./pasteCards";
describe("temporary pasted flashcards",()=>{
  it("supports tab or double-colon separated pairs",()=>{
    expect(parseQuickCards("force\tma\nunit::newton\n")).toEqual([
      {front:"force",back:"ma"},{front:"unit",back:"newton"}
    ]);
  });
  it("skips empty and malformed lines",()=>{
    expect(parseQuickCards("Bad\n::empty\nvalid::answer")).toEqual([{front:"valid",back:"answer"}]);
  });
});
