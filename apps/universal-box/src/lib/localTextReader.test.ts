import {describe,it,expect} from "vitest";
import {availableLocalReaderVoices,validateReaderText,validateReaderRate} from "./localTextReader";

describe("Device-only text reader controls",()=>{
 const voices=[
  {name:"Remote Service",lang:"en-US",voiceURI:"remote",localService:false},
  {name:"中文本地",lang:"zh-CN",voiceURI:"zh-local",localService:true},
  {name:"System English",lang:"en-US",voiceURI:"en-local",localService:true},
  {name:"Broken",lang:"",voiceURI:"broken",localService:true},
 ];
 it("rejects all remote and invalid voices; orders genuine device voices",()=>{
  const local=availableLocalReaderVoices(voices);
  expect(local.map(x=>x.voiceURI)).toEqual(["en-local","zh-local"]);
  expect(availableLocalReaderVoices([voices[0]])).toHaveLength(0);
  expect(voices).toHaveLength(4);
 });
 it("reads nonempty Unicode text without changing contents other than outer trim",()=>{
  expect(validateReaderText("  Hello 世界！\n")).toBe("Hello 世界！");
  expect(validateReaderText("中文。\nSecond paragraph.")).toBe("中文。\nSecond paragraph.");
  expect(validateReaderText("a".repeat(5000))).toHaveLength(5000);
  expect(()=>validateReaderText("")).toThrow(/Paste/);
  expect(()=>validateReaderText("  ")).toThrow(/Paste/);
  expect(()=>validateReaderText("a".repeat(5001))).toThrow(/5,000/);
  expect(()=>validateReaderText("ABC\u0000DEF")).toThrow(/control/);
 });
 it("bounds speech speed and rejects NaN",()=>{
  for(const value of [0.7,1,1.5])expect(validateReaderRate(value)).toBe(value);
  for(const value of [0.6,1.6,NaN,Infinity])
   expect(()=>validateReaderRate(value)).toThrow(/0.7x/);
 });
});
