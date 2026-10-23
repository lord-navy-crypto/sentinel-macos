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
