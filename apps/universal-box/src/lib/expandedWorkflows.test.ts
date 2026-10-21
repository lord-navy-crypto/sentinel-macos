import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {speechCues,exportTimedCaptions} from "./speechCaptions";
import {addBasketItem,moveBasketItem,combineBasket,exportSelectedXlsxSheets} from "./sheetClipWorkflows";
import {csvToXlsxTable,listXlsxWorksheets,xlsxToTable,tableToXlsx} from "./spreadsheetInterop";
import {parseWorkspaceCsv} from "./csvCleanroom";
export async function twoSheetFixture():Promise<Uint8Array>{
 const original=await tableToXlsx(csvToXlsxTable("ID,Result\n001,=2+3\n002,中文"));
 const zip=await JSZip.loadAsync(original);
 let book=await zip.file("xl/workbook.xml")!.async("string");
 book=book.replace("</sheets>",'<sheet name="Second" sheetId="2" r:id="rId2"/></sheets>');
 zip.file("xl/workbook.xml",book);
 let rels=await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
 rels=rels.replace("</Relationships>",'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
 zip.file("xl/_rels/workbook.xml.rels",rels);
 let types=await zip.file("[Content_Types].xml")!.async("string");
 types=types.replace("</Types>",'<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
 zip.file("[Content_Types].xml",types);
 const xml='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
 '<row r="1"><c r="A1" t="inlineStr"><is><t>Topic</t></is></c><c r="B1" t="inlineStr"><is><t>Notes</t></is></c></row>'+
 '<row r="2"><c r="A2" t="inlineStr"><is><t>物理</t></is></c><c r="B2" t="inlineStr"><is><t>Lab</t></is></c></row>'+
 '</sheetData></worksheet>';
 zip.file("xl/worksheets/sheet2.xml",xml);
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
describe("Actual Apple Speech segment captions",()=>{
 const speech=[
  {text:"你好",start:0.15,duration:.6,confidence:.8},
  {text:"世界",start:.85,duration:.55,confidence:.91},
  {text:"The",start:2.8,duration:.33,confidence:.9},
  {text:"Lab",start:3.2,duration:.7,confidence:.77}
 ];
 it("generates valid original timestamp SRT/VTT with Chinese and punctuation",()=>{
  const cues=speechCues(speech);
  expect(cues).toHaveLength(2);
  expect(cues[0].text).toBe("你好世界");
  expect(cues[0].start).toBe(.15);
  expect(cues[1].text).toBe("The Lab");
  const srt=exportTimedCaptions(cues,"srt");
  const vtt=exportTimedCaptions(cues,"vtt");
  expect(srt).toContain("00:00:00,150 --> 00:00:01,400");
  expect(vtt).toMatch(/^WEBVTT\n\n/u);
  expect(vtt).toContain("00:00:02.800 --> 00:00:03.900");
 });
 it("rejects missing/fabricated timestamps and escapes WebVTT markup",()=>{
  expect(()=>speechCues([])).toThrow(/No timed/);
  expect(()=>speechCues([{text:"fake",start:0,duration:0,confidence:.5}])).toThrow(/invalid/);
  expect(()=>speechCues([{text:"B",start:3,duration:1,confidence:.9},{text:"A",start:1,duration:1,confidence:.9}])).toThrow(/order/);
  expect(exportTimedCaptions([{text:"<img> -->",start:2,end:3,confidence:.7}],"vtt")).toContain("&lt;img&gt; →");
 });
});
describe("Multi-sheet XLSX export of real OOXML",()=>{
 it("lists, selects and exports only chosen workbook sheet without unsafe formulas",async()=>{
  const fixture=await twoSheetFixture();
  const list=await listXlsxWorksheets(fixture);
  expect(list).toEqual([{index:0,name:"Data"},{index:1,name:"Second"}]);
  const parsed=await xlsxToTable(fixture,1);
  expect(parsed.sheetName).toBe("Second");
  expect(parsed.table.rows[0][0]).toBe("物理");
  const output=await exportSelectedXlsxSheets(fixture,[0,1]);
  const zip=await JSZip.loadAsync(output.zip,{checkCRC32:true});
  const one=parseWorkspaceCsv(await zip.file("worksheets/001.csv")!.async("string"));
  const two=parseWorkspaceCsv(await zip.file("worksheets/002.csv")!.async("string"));
  expect(one[1][0]).toBe("001");
  expect(one[1][1]).toBe("'=2+3");
  expect(two[1]).toEqual(["物理","Lab"]);
  expect(zip.file("xl/workbook.xml")).toBeNull();
  const manifest=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(manifest.originalWorkbookIncluded).toBe(false);
  const selected=await exportSelectedXlsxSheets(fixture,[1]);
  expect((await JSZip.loadAsync(selected.zip)).file("worksheets/001.csv")).toBeNull();
  expect(selected.results[0].name).toBe("Second");
 });
 it("rejects missing/repeated/out of range worksheet selections",async()=>{
  const input=await twoSheetFixture();
  await expect(exportSelectedXlsxSheets(input,[])).rejects.toThrow(/unique/);
  await expect(exportSelectedXlsxSheets(input,[1,1])).rejects.toThrow(/unique/);
  await expect(exportSelectedXlsxSheets(input,[3])).rejects.toThrow(/valid/);
 });
});
describe("No-monitor opt-in multi-clip basket",()=>{
 it("supports add, move and combine without changing input",()=>{
  const a=addBasketItem([],"First paragraph");
  const b=addBasketItem(a,"第二段");
  const ordered=moveBasketItem(b,1,-1);
  expect(combineBasket(ordered,"\n\n")).toBe("第二段\n\nFirst paragraph");
  expect(a).toHaveLength(1);
  expect(b).toHaveLength(2);
  expect(ordered[0].id).toBe(2);
 });
 it("bounds content and rejects empty join",()=>{
  expect(()=>combineBasket([],"\n")).toThrow(/empty/);
  expect(()=>addBasketItem([],"")).toThrow(/supports/);
  expect(()=>addBasketItem([],"x".repeat(6000))).toThrow(/supports/);
  expect(()=>addBasketItem(Array.from({length:20},(_,id)=>({id,text:"text"})),"new")).toThrow(/supports/);
 });
});