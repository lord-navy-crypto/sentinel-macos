import {describe,it,expect} from "vitest";
import {parseOfficeCsv,recordsToVcf} from "./officePrivacy";
import {parseLocalVcf,vcfToCsv} from "./localVcfImport";

const source=[
 "BEGIN:VCARD","VERSION:3.0","FN:张三\\, Researcher",
 "TEL;TYPE=CELL:+1 415 555 0100","TEL;TYPE=WORK:+1 415 555 0199",
 "EMAIL;TYPE=HOME:test@example.org",
 "ORG:Acme\\; Research;Physics",
 "TITLE:Engineer",
 "URL:https://example.org/profile",
 "PHOTO;ENCODING=b:YWJj",
 "END:VCARD",
 "BEGIN:VCARD","VERSION:4.0","FN:Grace Hopper",
 "TEL;VALUE=uri:tel:+14155550101",
 "EMAIL;TYPE=work:grace@example.org",
 "END:VCARD",
].join("\r\n")+"\r\n";
const bytes=(x:string)=>new TextEncoder().encode(x).length;

describe("Private local VCF to CSV complement",()=>{
 it("unfolds UTF-8 names and supports vCard 3/4, repeated phones, grouped fields",()=>{
  const x=source.replace("FN:Grace Hopper","FN:Grace\r\n  Hopper");
  const parsed=parseLocalVcf(x,bytes(x));
  expect(parsed.contacts).toHaveLength(2);
  expect(parsed.versions).toEqual(["3.0","4.0"]);
  expect(parsed.contacts[0].name).toBe("张三, Researcher");
  expect(parsed.contacts[0].phones).toEqual(["+1 415 555 0100","+1 415 555 0199"]);
  expect(parsed.contacts[0].organization).toBe("Acme; Research / Physics");
  expect(parsed.contacts[1].name).toBe("Grace Hopper");
  expect(parsed.contacts[1].phones).toEqual(["+14155550101"]);
  expect(parsed.ignoredProperties).toBe(1);
 });
 it("preserves common fields when round-tripping through existing CSV → VCF generator",()=>{
  const input="Name,Phone,Email,Organization,Website\nAda Example,+1 212 555 0100,ada@example.org,Computing,https://example.org";
  const generated=recordsToVcf(parseOfficeCsv(input)).text;
  const parsed=parseLocalVcf(generated,bytes(generated));
  expect(parsed.contacts[0]).toMatchObject({
   name:"Ada Example",phones:["+1 212 555 0100"],
   emails:["ada@example.org"],organization:"Computing",website:"https://example.org/",
  });
  const csv=vcfToCsv(parsed);
  expect(csv).toContain('"Ada Example"');
  expect(csv).toContain('"Computing"');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
 });
 it("does not execute or fetch photos, URLs or unknown content; exports only approved fields",()=>{
  const parsed=parseLocalVcf(source,bytes(source));
  const csv=vcfToCsv(parsed);
  expect(csv.startsWith("\uFEFFName,Phone,Email,Organization,Website,Title\r\n")).toBe(true);
  expect(csv).toContain('"张三, Researcher"');
  expect(csv).not.toContain("YWJj");
  expect(csv).not.toContain("ENCODING");
  expect(csv).toContain('"Acme; Research / Physics"');
 });
 it("accepts case-insensitive boundaries and blank separators between exported contacts",()=>{
  const lines=[
   "begin:vcard","VERSION:3.0","FN:Alice One","end:vcard",
   "","BEGIN:VCARD","VERSION:4.0","FN:李四","END:VCARD","",
  ].join("\\r\\n");
  const parsed=parseLocalVcf(lines,bytes(lines));
  expect(parsed.contacts.map(c=>c.name)).toEqual(["Alice One","李四"]);
 });
 it("rejects malformed boundaries, unsupported legacy encodings and an invalid version",()=>{
  const cases=[
   "FN:Bad\nBEGIN:VCARD\nVERSION:4.0\nEND:VCARD",
   "BEGIN:VCARD\nVERSION:2.1\nFN:Old\nEND:VCARD",
   "BEGIN:VCARD\nVERSION:4.0\nFN:Missing end",
   "BEGIN:VCARD\nVERSION:4.0\nFN:Bad\nBEGIN:VCARD\nEND:VCARD",
   "BEGIN:VCARD\nFN:Not first\nVERSION:4.0\nEND:VCARD",
   "BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=ISO-8859-1:Foreign\nEND:VCARD",
  ];
  for(const bad of cases)expect(()=>parseLocalVcf(bad,bytes(bad))).toThrow();
  expect(()=>parseLocalVcf("",0)).toThrow(/500 KB/);
  expect(()=>parseLocalVcf("x".repeat(500_001),500_001)).toThrow(/500 KB/);
 });
 it("does not allow spreadsheet formula injection and enforces input record count",()=>{
  const item="BEGIN:VCARD\nVERSION:4.0\nFN:=HYPERLINK(1)\nEMAIL:-1+2\nEND:VCARD\n";
  const report=parseLocalVcf(item,bytes(item));
  expect(vcfToCsv(report)).toContain('"\'=HYPERLINK(1)"');
  expect(vcfToCsv(report)).toContain('"\'-1+2"');
  const many=Array.from({length:301},(_,i)=>
   "BEGIN:VCARD\nVERSION:4.0\nFN:Sample "+i+"\nEND:VCARD").join("\n");
  expect(()=>parseLocalVcf(many,bytes(many))).toThrow(/300-contact/);
 });
});
