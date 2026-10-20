import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {csvToXlsxTable,tableToXlsx,xlsxToTable} from "./spreadsheetInterop";
import {diffImages,blendImages} from "./imageDiff";
import {encodeHtmlEntities,decodeHtmlEntities,normalizeText} from "./textCodec";

describe("v0.25 local Excel <-> CSV values",()=>{
 it("roundtrips Chinese, quoted CSV commas, leading zeros, formulas-as-text and XML metacharacters",async()=>{
   const text='Name,PostalCode,Notes\n"李华",00123,"<div> & ""quoted"""\n"Grace",00007,"=HYPERLINK(""https://example.org"")"';
   const table=csvToXlsxTable(text);
   const bytes=await tableToXlsx(table);
   const zip=await JSZip.loadAsync(bytes);
   const xml=await zip.file("xl/worksheets/sheet1.xml")!.async("string");
   expect(xml).toContain("00123");
   expect(xml).toContain("&lt;div&gt; &amp;");
   expect(xml).toContain('t="inlineStr"');
   expect(xml).not.toContain("<f>");
   const result=await xlsxToTable(bytes);
   expect(result.sheetName).toBe("Data");
   expect(result.sheetCount).toBe(1);
   expect(result.table).toEqual(table);
   expect(result.table.rows[0][1]).toBe("00123");
   expect(result.table.rows[1][2]).toContain("=HYPERLINK");
 });
 it("imports standards-based shared string, numeric, boolean, and cached formula cells",async()=>{
   const bytes=await tableToXlsx(csvToXlsxTable("Name,Value,Flag\nA,B,C"));
   const zip=await JSZip.loadAsync(bytes);
   zip.file("xl/sharedStrings.xml",'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>中文</t></si><si><r><t>Multi</t></r><r><t>part</t></r></si></sst>');
   zip.file("xl/worksheets/sheet1.xml",'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
     +'<row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="inlineStr"><is><t>Number</t></is></c><c r="C1" t="inlineStr"><is><t>Flag</t></is></c></row>'
     +'<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2"><f>2+2</f><v>4</v></c><c r="C2" t="b"><v>1</v></c></row>'
     +'</sheetData></worksheet>');
   const updated=await zip.generateAsync({type:"uint8array"});
   const result=await xlsxToTable(updated);
   expect(result.table.headers).toEqual(["Multipart","Number","Flag"]);
   expect(result.table.rows).toEqual([["中文","4","TRUE"]]);
 });
 it("fails closed on formula without cached result, unsafe relationships, macros and oversized grids",async()=>{
   const b=await tableToXlsx(csvToXlsxTable("A,B\n1,2"));
   const zip=await JSZip.loadAsync(b);
   zip.file("xl/worksheets/sheet1.xml",'<worksheet><sheetData><row r="1"><c r="A1"><f>SUM(A2:A3)</f></c></row></sheetData></worksheet>');
   await expect(xlsxToTable(await zip.generateAsync({type:"uint8array"}))).rejects.toThrow(/cached result/);
   const weird=await JSZip.loadAsync(b);
   weird.file("xl/_rels/workbook.xml.rels",'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../../evil.xml"/></Relationships>');
   await expect(xlsxToTable(await weird.generateAsync({type:"uint8array"}))).rejects.toThrow(/unsafe worksheet/);
   const macro=await JSZip.loadAsync(b);macro.file("xl/vbaProject.bin","macro");
   await expect(xlsxToTable(await macro.generateAsync({type:"uint8array"}))).rejects.toThrow(/Macros/);
   expect(()=>csvToXlsxTable("a\n"+"b\n".repeat(1001))).toThrow(/1,000/);
   expect(()=>csvToXlsxTable("A,B\n"+("x".repeat(4001))+",2")).toThrow(/4,000/);
 });
});
describe("v0.25 image comparison",()=>{
 const a=new Uint8ClampedArray([50,60,70,255, 100,100,100,255]);
 const b=new Uint8ClampedArray([50,60,70,255, 220,100,100,255]);
 it("counts changed pixels, outputs opaque pink changes, and supports overlay",()=>{
   const res=diffImages(a,b,2,1,10);
   expect(res.changed).toBe(1);
   expect(res.total).toBe(2);
   expect(res.fraction).toBe(.5);
   expect(res.meanDifference).toBe(60);
   expect(Array.from(res.mask.slice(4,8))).toEqual([236,55,91,255]);
   const overlay=blendImages(a,b,2,1,.5);
   expect(Array.from(overlay.slice(4,8))).toEqual([160,100,100,255]);
 });
 it("honours noise tolerances and rejects mismatched or oversized images",()=>{
   expect(diffImages(a,b,2,1,100).changed).toBe(1);
   expect(()=>diffImages(a,b,2,1,101)).toThrow(/0 to 100/);
   expect(()=>diffImages(a,b,5,1,0)).toThrow(/same dimensions/);
   expect(()=>blendImages(a,b,2,1,1.5)).toThrow(/0–1/);
   expect(()=>diffImages(new Uint8ClampedArray(4),new Uint8ClampedArray(4),2001,2001,0)).toThrow(/4 million/);
 });
});
describe("v0.25 HTML and Unicode text codec",()=>{
 it("encodes dangerous HTML syntax into plain text and decodes common entities",()=>{
   const input='<a title="X & Y">It\'s 你好</a>';
   const encoded=encodeHtmlEntities(input);
   expect(encoded).toBe("&lt;a title=&quot;X &amp; Y&quot;&gt;It&apos;s 你好&lt;/a&gt;");
   expect(decodeHtmlEntities(encoded)).toBe(input);
   expect(decodeHtmlEntities("&#x1F600; &copy; &nbsp; &unknown;")).toBe("😀 © \u00a0 &unknown;");
 });
 it("normalizes Unicode explicitly and rejects malformed numeric HTML references",()=>{
   expect(normalizeText("ＡＢＣ①","NFKC")).toBe("ABC1");
   expect(normalizeText("e\u0301","NFC")).toBe("é");
   expect(()=>decodeHtmlEntities("&#x110000;")).toThrow(/Invalid/);
   expect(()=>encodeHtmlEntities("x".repeat(100001))).toThrow(/100,000/);
 });
});
