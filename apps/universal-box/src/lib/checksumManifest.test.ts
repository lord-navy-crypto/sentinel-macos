import {describe,it,expect} from "vitest";
import {compareChecksumManifest,createChecksumManifest,parseChecksumManifest} from "./checksumManifest";
import type {FileInspection} from "./fileIntake";
const row=(name:string,hash:string,size=10):FileInspection=>({name,size,sha256:hash,kind:"PDF",extension:"pdf",mismatch:false});
describe("portable local checksum manifests",()=>{
 const a=row("Document.pdf","a".repeat(64));
 const b=row("资料与空格 name.png","b".repeat(64),200);
 it("can export, import and match multilingual filenames",()=>{
  const result=parseChecksumManifest(createChecksumManifest([a,b]));
  expect(result).toHaveLength(2);
  expect(compareChecksumManifest(result,[a,b]).counts).toEqual({match:2,changed:0,missing:0,ambiguous:0,extra:0});
 });
 it("detects changed, missing and unexpected data",()=>{
  const expected=parseChecksumManifest(createChecksumManifest([a,b]));
  const actual=[row("Document.pdf","c".repeat(64)),row("unexpected.png","e".repeat(64))];
  expect(compareChecksumManifest(expected,actual).counts).toEqual({match:0,changed:1,missing:1,ambiguous:0,extra:1});
 });
 it("refuses name collisions, including when imported and scanned",()=>{
  expect(()=>createChecksumManifest([a,a])).toThrow(/Duplicate/);
  const expected=parseChecksumManifest(createChecksumManifest([a]));
  expect(compareChecksumManifest(expected,[a,a]).counts.ambiguous).toBe(1);
 });
 it("rejects malicious, excessive or contradictory manifests",()=>{
  const valid=JSON.parse(createChecksumManifest([a])) as {schema:string;version:number;algorithm:string;entries:{name:string;size:number;sha256:string}[]};
  const check=(value:unknown)=>parseChecksumManifest(JSON.stringify(value));
  expect(()=>check({...valid,schema:"another"})).toThrow();
  expect(()=>check({...valid,entries:[{...valid.entries[0],sha256:"no"}]})).toThrow();
  expect(()=>check({...valid,entries:[{...valid.entries[0],name:"bad\nline"}]})).toThrow();
  expect(()=>check({...valid,entries:[{...valid.entries[0],size:-1}]})).toThrow();
  expect(()=>check({...valid,entries:[valid.entries[0],valid.entries[0]]})).toThrow();
  expect(()=>check({...valid,entries:Array.from({length:81},(_,n)=>({...valid.entries[0],name:String(n)}))})).toThrow();
  expect(()=>parseChecksumManifest("x".repeat(260_000))).toThrow(/256 KB/);
  expect(()=>parseChecksumManifest("{")).toThrow(/Invalid JSON/);
 });
 it("never includes source file bytes or local paths",()=>{
  const manifest=createChecksumManifest([a]);
  expect(manifest).toContain("SHA-256");
  expect(manifest).not.toContain("file:///Users/");
 });
});
