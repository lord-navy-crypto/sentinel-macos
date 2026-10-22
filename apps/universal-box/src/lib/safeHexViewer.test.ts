import {describe,it,expect} from "vitest";
import {buildHexPage,parseHexPattern,findHexBytes,hexHeader,hexSummary,validateHexBytes,HEX_PAGE_BYTES} from "./safeHexViewer";

describe("Legacy HEX viewer: safe real byte display",()=>{
 it("shows exact hex offsets, control bytes as dots, and the correct 16-byte header",()=>{
  const input=Uint8Array.from([0,0xFF,0x41,0x0A,0x7F,0x20,0x5A,0x42,0x00]);
  expect(hexHeader(input)).toBe("00 FF 41 0A 7F 20 5A 42 00");
  const page=buildHexPage(input,0);
  expect(page.start).toBe(0);expect(page.end).toBe(9);
  expect(page.rows[0].offsetHex).toBe("00000000");
  expect(page.rows[0].hex).toBe("00 FF 41 0A 7F 20 5A 42 00");
  expect(page.rows[0].ascii).toBe("..A.. ZB.");
  expect(hexSummary("unknown.bin",input)).toContain("Bytes: 9");
 });
 it("paginates a real byte buffer without dropping partial tail pages",()=>{
  const data=Uint8Array.from({length:1050},(_,index)=>index%256);
  const first=buildHexPage(data,0),second=buildHexPage(data,HEX_PAGE_BYTES);
  const last=buildHexPage(data,1049);
  expect(first.rows).toHaveLength(32);expect(first.end).toBe(512);
  expect(second.rows[0].offset).toBe(512);expect(second.end).toBe(1024);
  expect(last.start).toBe(1024);expect(last.end).toBe(1050);
  expect(last.rows).toHaveLength(2);
  expect(last.rows[1].offset).toBe(1040);
  expect(last.rows[1].hex).toBe("10 11 12 13 14 15 16 17 18 19");
 });
 it("finds exact byte patterns, including 00 and FF, with bounded displayed results",()=>{
  const input=Uint8Array.from([0,255,65,0,255,65,0,255,65,3]);
  expect(Array.from(parseHexPattern("00 ff 41"))).toEqual([0,255,65]);
  const found=findHexBytes(input,parseHexPattern("00 FF 41"),2);
  expect(found).toEqual({matches:3,offsets:[0,3],truncated:true});
  expect(findHexBytes(input,parseHexPattern("7F")).matches).toBe(0);
  expect(()=>parseHexPattern("0")).toThrow(/complete/);
  expect(()=>parseHexPattern("GG")).toThrow(/hex/);
  expect(()=>parseHexPattern("FF".repeat(33))).toThrow(/32/);
 });
 it("rejects oversized inputs and impossible offsets rather than silently truncating",()=>{
  expect(()=>validateHexBytes(new Uint8Array(0))).toThrow(/8 MB/);
  expect(()=>validateHexBytes(new Uint8Array(8_000_001))).toThrow(/8 MB/);
  const data=new Uint8Array(32);
  expect(()=>buildHexPage(data,-1)).toThrow(/Offset/);
  expect(()=>buildHexPage(data,33)).toThrow(/Offset/);
  expect(()=>buildHexPage(data,0,15)).toThrow(/multiple of 16/);
  expect(()=>findHexBytes(data,new Uint8Array(0))).toThrow(/1–32/);
 });
});
