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


  it("keeps only literal matching lines without altering source or mixed newline bytes",()=>{
    const src=input("行动计划.md","\ufeffTODO: 甲\r\n已完成\nTODO: 乙\r第三项\n");
    const original=Uint8Array.from(src.bytes);
    const row=processBatchTextFiles([src],"keep-matching","TODO")[0];
    expect(row.matches).toBe(2);
    expect(row.changed).toBe(true);
    expect(Array.from(row.bytes.subarray(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("TODO: 甲\r\nTODO: 乙\r");
    expect(src.bytes).toEqual(original);
    const insensitive=processBatchTextFiles([input("x.txt","todo\nTODO\n")],"keep-matching","TODO")[0];
    expect(d.decode(insensitive.bytes)).toBe("TODO\n");
  });
  it("removes lines with an exact phrase, but retains nonmatching lines and their endings",()=>{
    const source=input("events.txt","保留一\r\nDEBUG debug\r删除?\n保留二");
    const row=processBatchTextFiles([source],"drop-matching","DEBUG")[0];
    expect(d.decode(row.bytes)).toBe("保留一\r\n删除?\n保留二");
    expect(row.matches).toBe(1);
    expect(processBatchTextFiles([source],"drop-matching","NOT-FOUND")[0].changed).toBe(false);
  });
  it("lets keep-matching produce an explicitly empty changed copy when there are no matches",async()=>{
    const src=input("notes.md","one\r\ntwo");
    const row=processBatchTextFiles([src],"keep-matching","missing")[0];
    expect(row.changed).toBe(true);
    expect(row.matches).toBe(0);
    expect(row.afterBytes).toBe(0);
    const zip=await JSZip.loadAsync(await zipBatchTextResults([row],"keep-matching"),{checkCRC32:true});
    expect((await zip.file("processed/notes.md")!.async("uint8array")).length).toBe(0);
    const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(manifest.files[0]).toMatchObject({changed:true,afterBytes:0,matches:0});
    expect(src.bytes.length).toBeGreaterThan(0);
  });
  it("numbers only nonempty physical lines with per-file resets, preserving BOM and line endings",()=>{
    const src=input("会议.txt","\ufeff第一项\r\n\r\n   第二项\n \t\r第三项");
    const second=input("followup.md","One\nTwo\n");
    const originals=[Uint8Array.from(src.bytes),Uint8Array.from(second.bytes)];
    const rows=processBatchTextFiles([src,second],"number-lines");
    expect(d.decode(rows[0].bytes.subarray(3))).toBe("1. 第一项\r\n\r\n2.    第二项\n \t\r3. 第三项");
    expect(Array.from(rows[0].bytes.slice(0,3))).toEqual([239,187,191]);
    expect(rows[0].matches).toBe(3);
    expect(d.decode(rows[1].bytes)).toBe("1. One\n2. Two\n");
    expect(rows[1].matches).toBe(2);
    expect(src.bytes).toEqual(originals[0]);
    expect(second.bytes).toEqual(originals[1]);
  });
  it("rejects invalid line filter input and CSV/TSV line modes before any file mutation",()=>{
    expect(()=>processBatchTextFiles([input("a.txt","abc")],"keep-matching")).toThrow(/literal line filter phrase/);
    expect(()=>processBatchTextFiles([input("a.txt","abc")],"drop-matching","\n")).toThrow(/literal line filter phrase/);
    expect(()=>processBatchTextFiles([input("a.txt","abc")],"keep-matching","a".repeat(1001))).toThrow(/literal line filter phrase/);
    for(const mode of ["keep-matching","drop-matching","number-lines"] as const){
      expect(()=>processBatchTextFiles([input("sheet.csv","col,header\nA,B")],mode)).toThrow(/TXT\/Markdown only/);
      expect(()=>processBatchTextFiles([input("sheet.tsv","A\tB")],mode,"A")).toThrow(/TXT\/Markdown only/);
    }
  });


  it("collapses consecutive empty/space-only lines while preserving each surviving newline",()=>{
    const source=input("minutes.txt","\ufeffA\r\n \t\r\n\r\nB\n\n\nC\r  \r\rD");
    const saved=Uint8Array.from(source.bytes);
    const row=processBatchTextFiles([source],"collapse-blank")[0];
    expect(row.matches).toBe(3);
    expect(Array.from(row.bytes.subarray(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("A\r\n \t\r\nB\n\nC\r  \rD");
    expect(source.bytes).toEqual(saved);
    const again=processBatchTextFiles([input("x.txt",d.decode(row.bytes.subarray(3)))],"collapse-blank")[0];
    expect(again.changed).toBe(false);
  });
  it("does not create phantom blank lines when an input has a final newline",()=>{
    const unchanged=processBatchTextFiles([input("x.txt","A\r\n\r\nB\n")],"collapse-blank")[0];
    expect(unchanged.changed).toBe(false);
    expect(unchanged.matches).toBe(0);
    const row=processBatchTextFiles([input("x.txt","A\r\n\n\n")],"collapse-blank")[0];
    expect(d.decode(row.bytes)).toBe("A\r\n\n");
    expect(row.matches).toBe(1);
  });
  it("replaces tabs with user-chosen fixed spaces only and keeps Chinese, emoji, BOM and EOL",async()=>{
    const source=input("notes.txt","\ufeff甲\t😀\r\n\t第二项\n");
    const saved=Uint8Array.from(source.bytes);
    for(const count of [2,4,8] as const){
      const row=processBatchTextFiles([source],"tabs-to-spaces","","","","",count)[0];
      expect(row.matches).toBe(2);
      expect(Array.from(row.bytes.subarray(0,3))).toEqual([239,187,191]);
      expect(d.decode(row.bytes.subarray(3))).toBe("甲"+" ".repeat(count)+"😀\r\n"+" ".repeat(count)+"第二项\n");
      const zip=await JSZip.loadAsync(await zipBatchTextResults([row],"tabs-to-spaces"),{checkCRC32:true});
      const packed=await zip.file("processed/notes.txt")!.async("uint8array");
      expect(packed).toEqual(row.bytes);
    }
    expect(source.bytes).toEqual(saved);
    expect(processBatchTextFiles([input("none.txt","No tabs\n")],"tabs-to-spaces")[0].changed).toBe(false);
  });
  it("rejects unsupported markup/tabular file types, invalid widths and malformed UTF-8",()=>{
    for(const mode of ["collapse-blank","tabs-to-spaces"] as const){
      for(const extension of ["md","markdown","csv","tsv"]){
        expect(()=>processBatchTextFiles([input("a."+extension,"A\n")],mode)).toThrow(/TXT-only/);
      }
    }
    expect(()=>processBatchTextFiles([input("a.txt","a\tb")],"tabs-to-spaces","","","","",3 as 4)).toThrow(/2, 4 or 8/);
    expect(()=>processBatchTextFiles([{name:"a.txt",bytes:Uint8Array.from([255])}],"collapse-blank")).toThrow(/invalid UTF-8/);
  });


  it("sorts nonblank TXT list contents naturally, preserving blank slots, BOM, CRLF/LF/CR and EOF",()=>{
    const source=input("inventory.txt","\ufeffitem10\r\n \t\nitem2\rItem1\n");
    const original=Uint8Array.from(source.bytes);
    const row=processBatchTextFiles([source],"sort-list-asc")[0];
    expect(row.changed).toBe(true);
    expect(row.matches).toBe(2);
    expect(Array.from(row.bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("Item1\r\n \t\nitem2\ritem10\n");
    expect(source.bytes).toEqual(original);
    const unchanged=processBatchTextFiles([input("a.txt","item10\r\n \t\nitem2\rItem1\n")],"sort-list-desc")[0];
    expect(unchanged.changed).toBe(false);
    const descending=processBatchTextFiles([input("b.txt","apple\nBanana\ncherry")],"sort-list-desc")[0];
    expect(d.decode(descending.bytes)).toBe("cherry\nBanana\napple");
    expect(descending.matches).toBe(2);
    expect(processBatchTextFiles([input("c.txt","ALPHA\nalpha\nAlpha")],"sort-list-asc")[0].changed).toBe(false);
  });
  it("removes near-duplicate TXT items ignoring outer whitespace/case but keeps first spelling and blank lines",async()=>{
    const source=input("contacts.txt","\ufeff Alice \r\nalice\nBOB\rBob\n \t\r\nALIce\t");
    const prior=Uint8Array.from(source.bytes);
    const rows=processBatchTextFiles([source],"dedupe-list");
    expect(rows[0].matches).toBe(3);
    expect(d.decode(rows[0].bytes.subarray(3))).toBe(" Alice \r\nBOB\r \t\r\n");
    expect(source.bytes).toEqual(prior);
    const again=processBatchTextFiles([input("clean.txt",d.decode(rows[0].bytes.subarray(3)))],"dedupe-list")[0];
    expect(again.changed).toBe(false);
    const zip=await JSZip.loadAsync(await zipBatchTextResults(rows,"dedupe-list"),{checkCRC32:true});
    expect(await zip.file("processed/contacts.txt")!.async("uint8array")).toEqual(rows[0].bytes);
    const manifest=JSON.parse(await zip.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(manifest.operation).toBe("dedupe-list");
    expect(manifest.files[0].matches).toBe(3);
  });
  it("scopes natural sort and near-dedup to UTF-8 TXT files only, not Markdown or tabular data",()=>{
    for(const mode of ["sort-list-asc","sort-list-desc","dedupe-list"] as const){
      for(const ext of ["md","markdown","csv","tsv"]){
        expect(()=>processBatchTextFiles([input("sheet."+ext,"Alpha\nalpha")],mode)).toThrow(/TXT-only/);
      }
    }
    expect(()=>processBatchTextFiles([{name:"a.txt",bytes:Uint8Array.from([255])}],"sort-list-asc")).toThrow(/invalid UTF-8/);
    expect(processBatchTextFiles([input("a.txt","Apple\n")],"sort-list-asc")[0].changed).toBe(false);
  });


  it("clears ordinary bulleted and numbered TXT list markers without altering dates or indentation",()=>{
    const src=input("minutes.txt","\ufeff  1. Agenda\r\n\t- Decisions\n2026-10-24\n1.2 section\r-42 balance\n• 中文😀\r\nPlain");
    const prior=Uint8Array.from(src.bytes);
    const row=processBatchTextFiles([src],"strip-list-markers")[0];
    expect(row.matches).toBe(3);
    expect(Array.from(row.bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("  Agenda\r\n\tDecisions\n2026-10-24\n1.2 section\r-42 balance\n中文😀\r\nPlain");
    expect(src.bytes).toEqual(prior);
    const again=processBatchTextFiles([input("clean.txt",d.decode(row.bytes.subarray(3)))],"strip-list-markers")[0];
    expect(again.changed).toBe(false);
  });
  it("supports dot / parenthesis and symbol markers but leaves marker-only and non-list lines alone",()=>{
    const src=input("shopping.txt","+ milk\r\n* eggs\n2) Bread\r• 茶叶\n- \n-9 cost\nNo marker");
    const row=processBatchTextFiles([src],"strip-list-markers")[0];
    expect(d.decode(row.bytes)).toBe("milk\r\neggs\nBread\r茶叶\n- \n-9 cost\nNo marker");
    expect(row.matches).toBe(4);
  });
  it("removes only leading and trailing blank physical lines; interior empty lines and original endings survive",async()=>{
    const src=input("draft.txt","\ufeff\r\n \t\n标题\r\n\n正文\r \t\r\n");
    const saved=Uint8Array.from(src.bytes);
    const row=processBatchTextFiles([src],"trim-boundary-blank")[0];
    expect(row.matches).toBe(3);
    expect(Array.from(row.bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("标题\r\n\n正文\r");
    expect(src.bytes).toEqual(saved);
    const packed=await JSZip.loadAsync(await zipBatchTextResults([row],"trim-boundary-blank"),{checkCRC32:true});
    expect(await packed.file("processed/draft.txt")!.async("uint8array")).toEqual(row.bytes);
    const stable=processBatchTextFiles([input("stable.txt","A\r\n\nB\r")],"trim-boundary-blank")[0];
    expect(stable.changed).toBe(false);
    expect(stable.matches).toBe(0);
  });
  it("keeps BOM only when all document lines are blank and reports the removal count",()=>{
    const row=processBatchTextFiles([input("blank.txt","\ufeff\n \t\r\n")],"trim-boundary-blank")[0];
    expect(Array.from(row.bytes)).toEqual([239,187,191]);
    expect(row.matches).toBe(2);
    expect(row.changed).toBe(true);
    expect(processBatchTextFiles([input("same.txt","One\nTwo\n")],"trim-boundary-blank")[0].changed).toBe(false);
  });
  it("blocks Markdown and table files from structural marker/edge cleanup and still rejects malformed UTF-8",()=>{
    for(const mode of ["strip-list-markers","trim-boundary-blank"] as const){
      for(const ext of ["md","markdown","csv","tsv"]){
        expect(()=>processBatchTextFiles([input("data."+ext,"1. First\n")],mode)).toThrow(/TXT-only/);
      }
    }
    expect(()=>processBatchTextFiles([{name:"invalid.txt",bytes:Uint8Array.from([0xff])}],"strip-list-markers")).toThrow(/invalid UTF-8/);
  });


  it("normalizes only two supported no-break spaces in TXT and preserves figure space, BOM and EOLs",()=>{
    const src=input("copied.txt","\ufeff价格\u00a01\u202f000\u2007元\r\n下段\u00a0结束\r");
    const bytes=Uint8Array.from(src.bytes);
    const row=processBatchTextFiles([src],"normalize-nbsp")[0];
    expect(row.matches).toBe(3);
    expect(Array.from(row.bytes.slice(0,3))).toEqual([239,187,191]);
    expect(d.decode(row.bytes.subarray(3))).toBe("价格 1 000\u2007元\r\n下段 结束\r");
    expect(src.bytes).toEqual(bytes);
    expect(processBatchTextFiles([input("done.txt","普通 空格\n")],"normalize-nbsp")[0].changed).toBe(false);
  });
  it("removes only U+200B zero-width space, preserving emoji ZWJ, U+200C and variation selectors",async()=>{
    const source=input("notes.txt","\ufeffA\u200bB\r\n👩‍💻\u200bC\u200cD️\n");
    const before=Uint8Array.from(source.bytes);
    const rows=processBatchTextFiles([source],"remove-zwsp");
    expect(rows[0].matches).toBe(2);
    expect(d.decode(rows[0].bytes.subarray(3))).toBe("AB\r\n👩‍💻C\u200cD️\n");
    const pack=await JSZip.loadAsync(await zipBatchTextResults(rows,"remove-zwsp"),{checkCRC32:true});
    expect(await pack.file("processed/notes.txt")!.async("uint8array")).toEqual(rows[0].bytes);
    const manifest=JSON.parse(await pack.file("sentinel-box-batch-text-manifest.json")!.async("string"));
    expect(manifest.operation).toBe("remove-zwsp");
    expect(manifest.files[0].matches).toBe(2);
    expect(source.bytes).toEqual(before);
    expect(processBatchTextFiles([input("emoji.txt","👩‍💻")],"remove-zwsp")[0].changed).toBe(false);
  });
  it("removes soft hyphen without touching visible hyphen, en dash, em dash or CRLF",()=>{
    const src=input("copied.txt","\ufeffco\u00adoperate\r\nwell-being – together — yes\n");
    const row=processBatchTextFiles([src],"remove-soft-hyphen")[0];
    expect(row.matches).toBe(1);
    expect(d.decode(row.bytes.subarray(3))).toBe("cooperate\r\nwell-being – together — yes\n");
    expect(processBatchTextFiles([input("same.txt","ordinary-hyphen")],"remove-soft-hyphen")[0].changed).toBe(false);
  });
  it("rejects whitespace-copy cleanup for Markdown and CSV/TSV and malformed UTF-8",()=>{
    for(const mode of ["normalize-nbsp","remove-zwsp","remove-soft-hyphen"] as const){
      for(const ext of ["md","markdown","csv","tsv"]){
        expect(()=>processBatchTextFiles([input("test."+ext,"A\u00a0B")],mode)).toThrow(/TXT-only/);
      }
      expect(()=>processBatchTextFiles([{name:"bad.txt",bytes:Uint8Array.from([0xff])}],mode)).toThrow(/invalid UTF-8/);
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
