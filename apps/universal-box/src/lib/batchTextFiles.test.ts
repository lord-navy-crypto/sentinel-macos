import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {validateBatchTextSelection,processBatchTextFiles,zipBatchTextResults} from "./batchTextFiles";
const e=new TextEncoder(),d=new TextDecoder();
const input=(name:string,contents:string)=>({name,bytes:e.encode(contents)});
describe("offline batch office text utility",()=>{
  it("replaces literal text in multiple selected UTF-8 files and preserves original bytes",()=>{
    const a=input("合同.md","报价 a.b\n价格 a.b");
    const b=input("notes.txt","unchanged");
    const original=Uint8Array.from(a.bytes);
    const rows=processBatchTextFiles([a,b],"replace","a.b","OK");
    expect(rows.map(x=>x.matches)).toEqual([2,0]);
    expect(rows.map(x=>x.changed)).toEqual([true,false]);
    expect(d.decode(rows[0].bytes)).toBe("报价 OK\n价格 OK");
    expect(a.bytes).toEqual(original);
  });
  it("preserves UTF-8 BOM on replacement and removes it only when asked",()=>{
    const src=input("table.csv","\ufeffA,B\r\n1,2\r\n");
    const replace=processBatchTextFiles([src],"replace","A","C");
    expect(Array.from(replace[0].bytes.slice(0,3))).toEqual([0xef,0xbb,0xbf]);
    expect(d.decode(replace[0].bytes.subarray(3))).toBe("C,B\r\n1,2\r\n");
    const clean=processBatchTextFiles([src],"remove-bom");
    expect(Array.from(clean[0].bytes.slice(0,3))).not.toEqual([0xef,0xbb,0xbf]);
    expect(d.decode(clean[0].bytes)).toBe("A,B\r\n1,2\r\n");
    expect(clean[0].matches).toBe(1);
  });
  it("does not silently consume a second U+FEFF in UTF-8 text",()=>{
    const src=input("double-bom.txt","\ufeff\ufeffAlpha");
    const result=processBatchTextFiles([src],"replace","Alpha","Beta")[0];
    expect(result.bytes.slice(0,6)).toEqual(src.bytes.slice(0,6));
    expect(d.decode(result.bytes.subarray(6))).toBe("Beta");
    const cleaned=processBatchTextFiles([src],"remove-bom")[0];
    expect(Array.from(cleaned.bytes.slice(0,3))).toEqual([0xef,0xbb,0xbf]);
  });
  it("normalizes mixed CRLF, LF and CR in either direction",()=>{
    const src=input("a.txt","one\r\ntwo\nthree\rfour");
    const lf=processBatchTextFiles([src],"lf")[0];
    expect(d.decode(lf.bytes)).toBe("one\ntwo\nthree\nfour");
    expect(lf.matches).toBe(2);
    const crlf=processBatchTextFiles([src],"crlf")[0];
    expect(d.decode(crlf.bytes)).toBe("one\r\ntwo\r\nthree\r\nfour");
    expect(crlf.matches).toBe(2);
    expect(processBatchTextFiles([input("x.txt","A\r\nB")],"crlf")[0].changed).toBe(false);
  });
  it("rejects unsafe selection, duplicate names, binary and invalid UTF-8 instead of corrupting them",()=>{
    expect(()=>validateBatchTextSelection([{name:"../secret.txt",size:3}])).toThrow();
    expect(()=>validateBatchTextSelection([{name:"A.txt",size:1},{name:"a.TXT",size:1}])).toThrow(/Duplicate/);
    expect(()=>validateBatchTextSelection([{name:"demo.docx",size:3}])).toThrow();
    expect(()=>processBatchTextFiles([{name:"x.txt",bytes:Uint8Array.from([0xff,0xfe])}],"lf")).toThrow(/invalid UTF-8/);
    expect(()=>processBatchTextFiles([input("data.txt","abc\u0000def")],"lf")).toThrow(/binary/);
    expect(()=>processBatchTextFiles([input("a.txt","hi")],"replace","", "x")).toThrow(/Enter a literal/);
  });

  it("trims trailing ASCII spaces and tabs but preserves CRLF, lone CR and leading indentation",()=>{
    const src=input("report.md","  Title  \r\n\tItem\t\n中文  \rEnd\t ");
    const before=Uint8Array.from(src.bytes);
    const row=processBatchTextFiles([src],"trim-trailing")[0];
    expect(d.decode(row.bytes)).toBe("  Title\r\n\tItem\n中文\rEnd");
    expect(row.matches).toBe(4);
    expect(src.bytes).toEqual(before);
    expect(processBatchTextFiles([input("a.txt","  Title\r\n")],"trim-trailing")[0].changed).toBe(false);
  });
  it("removes ASCII-space or tab-only blank lines without touching surviving line endings",()=>{
    const row=processBatchTextFiles([input("memo.txt","第一段\r\n \t\r\n第二段\n\n第三段\r")],"remove-blank")[0];
    expect(d.decode(row.bytes)).toBe("第一段\r\n第二段\n第三段\r");
    expect(row.matches).toBe(2);
    expect(processBatchTextFiles([input("a.md","Word\r\nNext")],"remove-blank")[0].changed).toBe(false);
  });
  it("deduplicates exact physical lines in their original order and keeps surviving EOLs",()=>{
    const row=processBatchTextFiles([input("notes.md","Alpha\r\nBeta\nAlpha\rGamma\nBeta")],"dedupe-lines")[0];
    expect(d.decode(row.bytes)).toBe("Alpha\r\nBeta\nGamma\n");
    expect(row.matches).toBe(2);
    expect(d.decode(processBatchTextFiles([input("x.txt","a\nA\n")],"dedupe-lines")[0].bytes)).toBe("a\nA\n");
  });
  it("rejects line-cleanup on CSV and TSV to avoid corrupting quoted multi-line cells",()=>{
    for(const mode of ["trim-trailing","remove-blank","dedupe-lines"] as const){
      expect(()=>processBatchTextFiles([input("sheet.csv","header\nvalue")],mode)).toThrow(/TXT\/Markdown only/);
      expect(()=>processBatchTextFiles([input("sheet.tsv","a\tb")],mode)).toThrow(/TXT\/Markdown only/);
    }
  });
  it("keeps BOM bytes on line cleanup and exports a CRC-checked ZIP with accurate counters",async()=>{
    const original=input("工作.md","\ufeffFirst  \r\nSecond\r\n");
    const result=processBatchTextFiles([original],"trim-trailing");
    expect(Array.from(result[0].bytes.slice(0,3))).toEqual([239,187,191]);
    const zip=await JSZip.loadAsync(await zipBatchTextResults(result,"trim-trailing"),{checkCRC32:true});
    const bytes=await zip.file("processed/工作.md")!.async("uint8array");
    expect(Array.from(bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(bytes.subarray(3))).toBe("First\r\nSecond\r\n");
    const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(manifest.operation).toBe("trim-trailing");
    expect(manifest.files[0]).toMatchObject({original:"工作.md",matches:1,changed:true});
  });
  it("packages changed copies only; JSON manifest and all exported bytes are verifiable",async()=>{
    const rows=processBatchTextFiles([
      input("报价.csv","旧价,5\r\n"),input("no-change.md","untouched"),
    ],"replace","旧价","新价");
    const bytes=await zipBatchTextResults(rows,"replace");
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
    expect(zip.file("processed/报价.csv")).toBeTruthy();
    expect(zip.file("processed/no-change.md")).toBeNull();
    expect(await zip.file("processed/报价.csv")!.async("string")).toBe("新价,5\r\n");
    const info=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(info.files).toMatchObject([
      {original:"报价.csv",changed:true,matches:1,output:"processed/报价.csv"},
      {original:"no-change.md",changed:false,matches:0,output:null},
    ]);
    await expect(zipBatchTextResults(processBatchTextFiles([input("a.txt","x")],"replace","z","y"),"replace")).rejects.toThrow(/No changes/);
  });
});
