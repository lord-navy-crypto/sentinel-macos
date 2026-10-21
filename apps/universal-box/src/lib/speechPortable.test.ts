import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectPcmWav} from "./wavTools";
import {encodeMonoWav16,sampleMono16k,SPEECH_MAX_SECONDS} from "./speechAudio";
import {planPortable,decodePortable,encodePortable,exportPortableText} from "./portableText";
import {planPhotoBatch} from "./photoCompression";
describe("Actual normalized speech WAV",()=>{
 it("resamples 8kHz mono speech samples to valid 16kHz RIFF PCM16",()=>{
  const oneSecond=new Float32Array(8000);
  for(let i=0;i<8000;i++)oneSecond[i]=Math.sin(2*Math.PI*440*i/8000)*0.4;
  const sample=sampleMono16k([oneSecond],8000);
  expect(sample.length).toBe(16000);
  const bytes=encodeMonoWav16(sample),wav=inspectPcmWav(bytes);
  expect(bytes.slice(0,4)).toEqual(Uint8Array.from([82,73,70,70]));
  expect(wav.channels).toBe(1);expect(wav.sampleRate).toBe(16000);
  expect(wav.frames).toBe(16000);
  expect(bytes.length).toBe(32044);
  expect(new DataView(bytes.buffer).getInt16(44+4*2,true)).not.toBe(0);
 });
 it("mixes two channels, clamps amplitude and rejects too-long audio",()=>{
  const sample=sampleMono16k([new Float32Array([0.6,0.6]),new Float32Array([-0.2,-0.2])],16000);
  expect(sample[0]).toBeCloseTo(0.2,5);
  const encoded=encodeMonoWav16(new Float32Array([2,-2,Number.NaN]));
  const view=new DataView(encoded.buffer);
  expect(view.getInt16(44,true)).toBe(32767);
  expect(view.getInt16(46,true)).toBe(-32767);
  expect(view.getInt16(48,true)).toBe(0);
  expect(()=>sampleMono16k([new Float32Array((SPEECH_MAX_SECONDS+1)*8000)],8000)).toThrow(/90 seconds/);
 });
});
describe("Windows/Mac portable text conversion",()=>{
 it("converts Windows-1252 euro symbol and CRLF to UTF-8 with BOM and LF",()=>{
  const input=Uint8Array.from([0x50,0x72,0x69,0x63,0x65,0x3a,0x20,0x80,0x0d,0x0a]);
  const decoded=decodePortable(input,"windows-1252");
  expect(decoded.text).toBe("Price: €\r\n");
  const out=encodePortable(decoded.text,{target:"utf-8-bom",lines:"lf"});
  expect(Array.from(out.slice(0,3))).toEqual([0xef,0xbb,0xbf]);
  expect(new TextDecoder().decode(out)).toBe("Price: €\n");
 });
 it("converts UTF-16LE BOM and GB18030 Chinese to portable output",async()=>{
  const source=encodePortable("学校\r\n物理",{target:"utf-16le-bom",lines:"crlf"});
  expect(decodePortable(source,"auto").text).toBe("学校\r\n物理");
  expect(decodePortable(Uint8Array.from([0xc4,0xe3,0xba,0xc3]),"gb18030").text).toBe("你好");
  const result=await exportPortableText([{name:"project.txt",bytes:source}],{
   source:"auto",target:"utf-8",lines:"lf"
  });
  const zip=await JSZip.loadAsync(result.zip,{checkCRC32:true});
  expect(await zip.file("converted/001-project.txt")!.async("string")).toBe("学校\n物理");
  const meta=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(meta.originalsIncluded).toBe(false);
  expect(meta.files[0].encoding).toBe("utf-16le");
 });
 it("refuses silent encoding guessing, binary files and unsafe input sizes",()=>{
  expect(()=>decodePortable(Uint8Array.from([0xff,0xfe]),"utf-8")).toThrow();
  expect(()=>decodePortable(Uint8Array.from([0,1,2]),"windows-1252")).toThrow(/binary/);
  expect(()=>planPortable([],{source:"auto",target:"utf-8",lines:"lf"})).toThrow(/1–20/);
  expect(()=>planPortable([{name:"app.exe",size:200}],{source:"auto",target:"utf-8",lines:"lf"})).toThrow(/text/);
 });
});
describe("Target photo compressor preflight",()=>{
 it("bounds input count, total size, exact KB target, and supported codecs",()=>{
  expect(planPhotoBatch([{name:"photo.png",size:123}],{format:"jpeg",targetKB:150,maxDimension:1024})).toBe(1);
  expect(()=>planPhotoBatch([{name:"photo.png",size:123}],{format:"jpeg",targetKB:10,maxDimension:1024})).toThrow(/40/);
  expect(()=>planPhotoBatch(Array(11).fill({name:"photo.png",size:100}),{format:"webp",targetKB:200,maxDimension:512})).toThrow(/1–10/);
  expect(()=>planPhotoBatch([{name:"file.exe",size:100}],{format:"jpeg",targetKB:150,maxDimension:1024})).toThrow(/PNG/);
 });
});