import {it,expect,describe} from "vitest";
import {parsePdfOrder} from "./pdfPageOrder";
describe("PDF page organizer",()=>{
  it("keeps requested order without mutating source",()=>{
    expect(parsePdfOrder("3,1,2,5-6",6)).toEqual([2,0,1,4,5]);
  });
  it("rejects duplicate pages",()=>{
    expect(()=>parsePdfOrder("1,2,2",5)).toThrow(/more than once/);
    expect(()=>parsePdfOrder("1-3,2",5)).toThrow(/more than once/);
  });
  it("rejects missing and invalid pages",()=>{
    expect(()=>parsePdfOrder("",5)).toThrow(/Keep at least/);
    expect(()=>parsePdfOrder("1,6",5)).toThrow(/bounds/);
    expect(()=>parsePdfOrder("3-2",5)).toThrow(/bounds/);
    expect(()=>parsePdfOrder("1;2",5)).toThrow(/sequence/);
  });
});