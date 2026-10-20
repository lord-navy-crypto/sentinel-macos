import {describe,it,expect} from "vitest";
import {parseOfficeCsv,recordsToVcf,mailMergeText} from "./officePrivacy";
import {inspectUnicode} from "./unicodeInspector";
import {findDuplicateFiles} from "./fileDuplicates";

const source="Name,Phone,Email,Organization,Website\r\nAda Lovelace,+1 212 555 0100,ada@example.org,Math,https://example.org/\r\nGrace Hopper,+1 212 555 0101,grace@example.org,Computing,https://example.org/";

describe("Universal Box v0.23 local office tools",()=>{
 it("imports quoted CSV names, Unicode and converts contacts to vCard 3.0",()=>{
   const table=parseOfficeCsv('姓名,电话,邮箱,公司,网址\r\n"张,三","+86 138 0013 8000",zhang@example.cn,大学,https://example.cn');
   const result=recordsToVcf(table);
   expect(result.count).toBe(1);
   expect(result.text).toContain("BEGIN:VCARD\r\nVERSION:3.0");
   expect(result.text).toContain("FN:张\\,三");
   expect(result.text).toContain("TEL:+86 138 0013 8000");
   expect(result.text).toContain("END:VCARD\r\n");
   expect(result.text).not.toContain("\r\nBEGIN:VCARD\r\nBEGIN:VCARD");
 });
 it("creates multiple standalone importable vCards and folds non-ASCII fields by UTF-8 bytes",()=>{
   const table=parseOfficeCsv(source);
   const text=recordsToVcf(table).text;
   expect(text.match(/BEGIN:VCARD/gu)).toHaveLength(2);
   expect(text.match(/END:VCARD/gu)).toHaveLength(2);
   const expanded=recordsToVcf(parseOfficeCsv("Name,Organization\nAda,"+"数学物理".repeat(15))).text;
   const lines=expanded.split("\r\n");
   expect(lines.some(line=>line.startsWith(" "))).toBe(true);
   expect(lines.every(line=>new TextEncoder().encode(line).length<=75)).toBe(true);
 });
 it("rejects ambiguous/missing contact data and invalid private address fields",()=>{
   expect(()=>recordsToVcf(parseOfficeCsv("Phone\n1234567890"))).toThrow(/Name/);
   expect(()=>recordsToVcf(parseOfficeCsv("Name,姓名\nA,B"))).toThrow(/Multiple columns/);
   expect(()=>recordsToVcf(parseOfficeCsv("Name,Email\nAda,notanemail"))).toThrow(/row 2/);
   expect(()=>parseOfficeCsv("Name,Name\nA,B")).toThrow(/Duplicate/);
   expect(()=>parseOfficeCsv("Name,Phone\nAda")).toThrow(/column count/);
   expect(()=>parseOfficeCsv("Name\n"+"Ada\n".repeat(301))).toThrow(/300/);
 });
 it("generates TXT letters with safe predictable ZIP filenames, not data-derived paths",()=>{
   const records=parseOfficeCsv('Name,Course\n"../../unsafe",Physics\n"李华",Math');
   const letters=mailMergeText(records,"Dear {{Name}},\nYour course is {{Course}}.");
   expect(letters).toEqual([
     {filename:"letter-001.txt",content:"Dear ../../unsafe,\nYour course is Physics."},
     {filename:"letter-002.txt",content:"Dear 李华,\nYour course is Math."},
   ]);
   expect(()=>mailMergeText(records,"Hello {{Unknown}}")).toThrow(/Unknown/);
   expect(()=>mailMergeText(records,"No placeholders")).toThrow(/placeholder/);
   expect(()=>mailMergeText(records,"x".repeat(10001)+"{{Name}}")).toThrow(/10,000/);
   const big=parseOfficeCsv("Name\n"+"Ada\n".repeat(101));
   expect(()=>mailMergeText(big,"Hi {{Name}}")).toThrow(/100/);
 });
});
describe("Unicode inspection",()=>{
 it("finds invisible, bidirectional, and control marks with precise positions",()=>{
   const matches=inspectUnicode("abc\u200B\n\u202EHi\u2069\0");
   expect(matches).toEqual([
     {index:3,line:1,column:4,codePoint:"U+200B",name:"Zero width space",kind:"Invisible"},
     {index:5,line:2,column:1,codePoint:"U+202E",name:"Right-to-left override",kind:"Bidirectional"},
     {index:8,line:2,column:4,codePoint:"U+2069",name:"Pop directional isolate",kind:"Bidirectional"},
     {index:9,line:2,column:5,codePoint:"U+0000",name:"C0 control character",kind:"Control"},
   ]);
   expect(inspectUnicode("Plain English.")).toEqual([]);
   expect(inspectUnicode("👩🏽")).toEqual([]);
   expect(()=>inspectUnicode("x".repeat(50001))).toThrow(/50,000/);
 });
});
describe("local duplicate file checks",()=>{
 const fake=(name:string,data:string)=>({
   name,size:new TextEncoder().encode(data).length,
   arrayBuffer:async()=>new TextEncoder().encode(data).buffer as ArrayBuffer,
 });
 it("groups exact duplicate content even under different names, without deleting files",async()=>{
   const report=await findDuplicateFiles([fake("a.txt","same"),fake("b.txt","different"),fake("c.txt","same")]);
   expect(report.scanned).toBe(3);
   expect(report.unique).toBe(2);
   expect(report.groups).toHaveLength(1);
   expect(report.groups[0].files.map(f=>f.name)).toEqual(["a.txt","c.txt"]);
   expect(report.groups[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
 });
 it("checks file count, per-file size, combined bytes and content changes",async()=>{
   await expect(findDuplicateFiles([fake("only.txt","1")])).rejects.toThrow(/2–30/);
   await expect(findDuplicateFiles(Array.from({length:31},(_,i)=>fake(String(i),"x")))).rejects.toThrow(/2–30/);
   await expect(findDuplicateFiles([{name:"large",size:20_000_001,arrayBuffer:async()=>new ArrayBuffer(1)},fake("x","0")])).rejects.toThrow(/20 MB/);
   await expect(findDuplicateFiles([{name:"changes",size:2,arrayBuffer:async()=>new ArrayBuffer(1)},fake("x","a")])).rejects.toThrow(/changed/);
 });
});
