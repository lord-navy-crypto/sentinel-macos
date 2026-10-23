import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {parseLiteralReplacementRules,validateBatchTextSelection,processBatchTextFiles,zipBatchTextResults} from "./batchTextFiles";
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

  it("parses pasted spreadsheet columns and allows explicit empty replacements",()=>{
    expect(parseLiteralReplacementRules("旧名\t新名\r\n删除我\t\r\n2025\t2026")).toEqual([
      {find:"旧名",replacement:"新名"},{find:"删除我",replacement:""},{find:"2025",replacement:"2026"},
    ]);
    expect(()=>parseLiteralReplacementRules("")).toThrow(/Enter 1/);
    expect(()=>parseLiteralReplacementRules("no tab")).toThrow(/TAB/);
    expect(()=>parseLiteralReplacementRules("a\tb\tc")).toThrow(/exactly one TAB/);
    expect(()=>parseLiteralReplacementRules("a\tb\na\tc")).toThrow(/Duplicate/);
    expect(()=>parseLiteralReplacementRules(" \tx")).toThrow(/invalid/);
    expect(()=>parseLiteralReplacementRules("a\tb\n".repeat(21))).toThrow(/20 replacement rules/);
    expect(()=>parseLiteralReplacementRules("x\ty".repeat(10001))).toThrow(/20,000/);
  });
  it("sequential multi-rule replacements preserve original files and count each rule",()=>{
    const source=input("合同.md","甲方 A; 2025; 删除我; A");
    const before=Uint8Array.from(source.bytes);
    const rules="A\tB\nB\tC\n2025\t2026\n删除我\t";
    const row=processBatchTextFiles([source],"multi-replace","","",rules)[0];
    expect(d.decode(row.bytes)).toBe("甲方 C; 2026; ; C");
    expect(row.ruleCounts).toEqual([2,2,1,1]);
    expect(row.matches).toBe(6);
    expect(source.bytes).toEqual(before);
  });
  it("can apply multiple replacement rules to CSV without touching BOM or CRLF",async()=>{
    const source=input("供应商.csv","\ufeff名称,年份\r\nA,2025\r\n");
    const rules="A\t新企业\n2025\t2026";
    const rows=processBatchTextFiles([source],"multi-replace","","",rules);
    expect(Array.from(rows[0].bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(rows[0].bytes.subarray(3))).toBe("名称,年份\r\n新企业,2026\r\n");
    const zip=await JSZip.loadAsync(await zipBatchTextResults(rows,"multi-replace"),{checkCRC32:true});
    const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(manifest.files[0].ruleCounts).toEqual([1,1]);
    const manifestSource=await zip.file("sentinel-box-batch-text-manifest.json")!.async("string");
    expect(manifestSource).not.toContain("新企业");
    expect(manifestSource).not.toContain("2025");
  });
  it("rejects rule-driven output expansion beyond the existing non-destructive file limit",()=>{
    const ruleText="a\t"+"b".repeat(500);
    expect(()=>processBatchTextFiles([input("x.txt","a".repeat(1000))],"multi-replace","","",ruleText)).toThrow(/exceeds/);
  });
  it("adds a batch prefix or suffix to non-empty lines preserving original line endings and BOM",()=>{
    const source=input("会议.md","\ufeff会议纪要\r\n\r\n  第二项\n \t\r第三项");
    const bytes=Uint8Array.from(source.bytes);
    const prefixed=processBatchTextFiles([source],"prefix-lines","","","","- ")[0];
    expect(Array.from(prefixed.bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(prefixed.bytes.subarray(3))).toBe("- 会议纪要\r\n\r\n-   第二项\n \t\r- 第三项");
    expect(prefixed.matches).toBe(3);
    const suffixed=processBatchTextFiles([source],"suffix-lines","","","","。")[0];
    expect(d.decode(suffixed.bytes.subarray(3))).toBe("会议纪要。\r\n\r\n  第二项。\n \t\r第三项。");
    expect(suffixed.matches).toBe(3);
    expect(source.bytes).toEqual(bytes);
  });
  it("rejects unsafe affixes and CSV/TSV line-affixing, leaving originals untouched",()=>{
    expect(()=>processBatchTextFiles([input("a.md","ABC")],"prefix-lines")).toThrow(/printable/);
    expect(()=>processBatchTextFiles([input("a.md","ABC")],"suffix-lines","","","","\n")).toThrow(/printable/);
    expect(()=>processBatchTextFiles([input("a.md","ABC")],"prefix-lines","","","","X".repeat(101))).toThrow(/printable/);
    for(const mode of ["prefix-lines","suffix-lines"] as const){
      expect(()=>processBatchTextFiles([input("sheet.csv","a,b")],mode)).toThrow(/TXT\/Markdown only/);
      expect(()=>processBatchTextFiles([input("sheet.csv","a,b")],mode,"","","","X")).toThrow(/TXT\/Markdown only/);
      expect(()=>processBatchTextFiles([input("sheet.tsv","a\tb")],mode,"","","","X")).toThrow(/TXT\/Markdown only/);
    }
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
