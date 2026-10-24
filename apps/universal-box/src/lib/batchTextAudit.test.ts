import {describe,it,expect} from "vitest";
import {auditTextFiles,makeTextAuditCsv,TEXT_AUDIT_COLUMNS} from "./batchTextAudit";

const encoder=new TextEncoder(),decoder=new TextDecoder("utf-8");
const entry=(name:string,text:string)=>({name,bytes:encoder.encode(text)});
describe("read-only batch text audit and safe CSV",()=>{
  it("counts Unicode code points and CRLF, LF, CR without changing source bytes",()=>{
    const src=entry("会议纪要.md","\ufeff甲😀 \r\n\r\n  乙\n第三\t\r最后");
    const original=Uint8Array.from(src.bytes);
    const row=auditTextFiles([src])[0];
    expect(row).toMatchObject({
      name:"会议纪要.md",extension:".md",bytes:original.length,
      lines:5,nonBlankLines:4,blankLines:1,crlf:2,lf:1,cr:1,
      trailingSpaceLines:2,utf8Bom:true,
    });
    expect(row.characters).toBe(Array.from("甲😀 \r\n\r\n  乙\n第三\t\r最后").length);
    expect(src.bytes).toEqual(original);
  });
  it("handles BOM-only documents and newline-terminated files without phantom lines",()=>{
    const rows=auditTextFiles([
      entry("bom.txt","\ufeff"),entry("a.txt","one\n"),entry("b.txt","one\r\n"),
      entry("c.txt","\r\n"),entry("d.txt","a\rb"),
    ]);
    expect(rows[0]).toMatchObject({characters:0,lines:0,utf8Bom:true});
    expect(rows[1]).toMatchObject({lines:1,lf:1,crlf:0});
    expect(rows[2]).toMatchObject({lines:1,crlf:1,lf:0});
    expect(rows[3]).toMatchObject({lines:1,nonBlankLines:0,blankLines:1,crlf:1});
    expect(rows[4]).toMatchObject({lines:2,cr:1});
  });
  it("can audit CSV/TSV as raw physical text without treating a quoted CSV newline as a new row",()=>{
    const rows=auditTextFiles([
      entry("table.csv",'h1,h2\r\n"a\nb",1\r\n'),
      entry("columns.tsv","x\ty\n"),
    ]);
    expect(rows[0]).toMatchObject({extension:".csv",lines:3,crlf:2,lf:1});
    expect(rows[1]).toMatchObject({extension:".tsv",lines:1,lf:1});
  });
  it("rejects malformed UTF-8, NUL, duplicate case-insensitive names and unsupported file types",()=>{
    expect(()=>auditTextFiles([{name:"bad.txt",bytes:Uint8Array.from([0xff,0xfe])}])).toThrow(/invalid UTF-8/);
    expect(()=>auditTextFiles([entry("binary.txt","a\u0000b")])).toThrow(/NUL/);
    expect(()=>auditTextFiles([entry("same.txt","a"),entry("SAME.txt","b")])).toThrow(/Duplicate/);
    expect(()=>auditTextFiles([entry("office.docx","content")])).toThrow(/Only safe/);
  });
  it("exports real UTF-8 BOM-prefixed Chinese metadata and formula-protected CSV names",()=>{
    const rows=auditTextFiles([
      entry('=HYPERLINK("x").txt',"甲\r\n乙\n"),entry("合同,报价.md","A\n"),
      entry("中文.txt","第三行"),
    ]);
    const csv=makeTextAuditCsv(rows);
    expect(Array.from(csv.slice(0,3))).toEqual([239,187,191]);
    const str=decoder.decode(csv);
    expect(str).toContain('"\'=HYPERLINK(""x"").txt"');
    expect(str).toContain('"合同,报价.md"');
    expect(str).toContain('"中文.txt"');
    expect(str).toContain('"Physical lines"');
    expect(str).not.toContain("第三行");
    expect(str.split("\r\n")).toHaveLength(5); // header, three data rows and terminal empty.
    expect(TEXT_AUDIT_COLUMNS).toHaveLength(12);
    expect(()=>makeTextAuditCsv([])).toThrow(/at least one/);
  });
});
