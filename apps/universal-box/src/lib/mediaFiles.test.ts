import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectPcmWav,editPcmWav} from "./wavTools";
import {inspectZip} from "./zipInspector";
import {ICON_SIZES,iconPlan,extractPalette} from "./iconPalette";

function makeWav(values:number[],sampleRate=8000,channels=1):Uint8Array{
 const out=new Uint8Array(44+values.length*2);
 const d=new DataView(out.buffer),tag=(start:number,s:string)=>{
   for(let i=0;i<s.length;i++)out[start+i]=s.charCodeAt(i);
 };
 tag(0,"RIFF");d.setUint32(4,out.length-8,true);tag(8,"WAVE");tag(12,"fmt ");
 d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,channels,true);
 d.setUint32(24,sampleRate,true);d.setUint32(28,sampleRate*channels*2,true);
 d.setUint16(32,channels*2,true);d.setUint16(34,16,true);
 tag(36,"data");d.setUint32(40,values.length*2,true);
 values.forEach((x,i)=>d.setInt16(44+i*2,x,true));
 return out;
}
describe("v0.22 WAV Studio",()=>{
 it("validates PCM stereo framing and edits the correct sample range",()=>{
   const input=makeWav([1000,-1000,2000,-2000,3000,-3000,4000,-4000],8000,2);
   const info=inspectPcmWav(input);
   expect(info.frames).toBe(4);
   expect(info.channels).toBe(2);
   const result=editPcmWav(input,{startMs:0.125,endMs:0.375,normalize:false,fadeMs:0});
   const out=new DataView(result.bytes.buffer);
   expect(result.bytes.length).toBe(44+2*2*2);
   expect(Array.from({length:4},(_,i)=>out.getInt16(44+i*2,true))).toEqual([2000,-2000,3000,-3000]);
   expect(inspectPcmWav(result.bytes).frames).toBe(2);
   expect(Array.from(new Int16Array(input.buffer.slice(44)))).toEqual([1000,-1000,2000,-2000,3000,-3000,4000,-4000]);
 });
 it("normalizes without clipping, and intentionally avoids amplifying silence",()=>{
   const x=makeWav([0,4000,-4000,0]);
   const processed=editPcmWav(x,{startMs:0,endMs:.5,normalize:true,fadeMs:0});
   expect(processed.gain).toBe(4);
   const d=new DataView(processed.bytes.buffer);
   expect(d.getInt16(46,true)).toBe(16000);
   expect(d.getInt16(48,true)).toBe(-16000);
   expect(editPcmWav(makeWav([0,0,100,0]),{startMs:0,endMs:.5,normalize:true,fadeMs:0}).gain).toBe(1);
   expect(editPcmWav(x,{startMs:0,endMs:.5,normalize:true,fadeMs:.2}).bytes.length).toBe(52);
 });
 it("rejects compressed audio, bad RIFF sizes, invalid ranges and oversized waveforms",()=>{
   const x=makeWav([1,2,3,4]);
   const bad=x.slice();bad[20]=3;
   expect(()=>inspectPcmWav(bad)).toThrow(/16-bit PCM/);
   const broken=x.slice();broken[4]=1;
   expect(()=>inspectPcmWav(broken)).toThrow(/declared length/);
   expect(()=>editPcmWav(x,{startMs:20,endMs:30,normalize:false,fadeMs:0})).toThrow(/within the track/);
   expect(()=>editPcmWav(x,{startMs:0,endMs:.5,normalize:false,fadeMs:1600})).toThrow(/Fade/);
   expect(()=>inspectPcmWav(new Uint8Array(20_000_001))).toThrow(/20 MB/);
 });
});
describe("v0.22 read-only ZIP inspector",()=>{
 it("parses generated ZIP central headers without decompressing or extracting",async()=>{
   const zip=new JSZip();
   zip.file("notes/readme.txt","Hello from a safe file");
   zip.file("images/icon.png",new Uint8Array([1,2,3,4]));
   const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
   const result=inspectZip(bytes);
   expect(result.entries.map(x=>x.name)).toContain("notes/readme.txt");
   expect(result.entries.map(x=>x.name)).toContain("images/icon.png");
   expect(result.totalExpanded).toBeGreaterThan(4);
   expect(result.warnings).toEqual([]);
 });
 it("flags suspicious paths without opening the archive contents",async()=>{
   const zip=new JSZip();zip.file("../outside.txt","bad");zip.file("/absolute.txt","bad");
   const bytes=await zip.generateAsync({type:"uint8array",compression:"STORE"});
   const result=inspectZip(bytes);
   expect(result.entries.some(entry=>entry.unsafePath)).toBe(true);
   expect(result.warnings.join(" ")).toMatch(/Unsafe archive paths/);
 });
 it("reports high declared expansion ratios and rejects corrupt central directories",async()=>{
   const zip=new JSZip();zip.file("zeroes.txt","0".repeat(300000));
   const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
   const result=inspectZip(bytes);
   expect(result.entries.some(entry=>entry.warnings.some(w=>w.includes("expansion ratio")))).toBe(true);
   const broken=bytes.slice(),view=new DataView(broken.buffer);
   view.setUint32(0,0,true);
   expect(()=>inspectZip(broken)).toThrow(/local file header/);
   const mismatched=bytes.slice();
   // Local filename begins at byte 30 for a normal ZIP with its first entry at offset 0.
   mismatched[30]^=1;
   expect(()=>inspectZip(mismatched)).toThrow(/filenames differ/);
   expect(()=>inspectZip(new Uint8Array(10))).toThrow(/22 bytes/);
 });
});
describe("v0.22 icon & colour utilities",()=>{
 it("provides seven safe image sizes and strips filename path characters",()=>{
   expect([...ICON_SIZES]).toEqual([16,32,48,64,128,256,512]);
   const plan=iconPlan("../../../logo image.png");
   expect(plan).toHaveLength(7);
   expect(new Set(plan.map(x=>x.filename)).size).toBe(7);
   expect(plan.every(x=>!x.filename.includes("/")&&!x.filename.includes("\\"))).toBe(true);
 });
 it("extracts approximate dominant pixels, omitting transparent pixels",()=>{
   const pixels=new Uint8ClampedArray([
     255,0,0,255, 255,0,0,255, 0,0,250,255, 0,255,0,0,
   ]);
   const palette=extractPalette(pixels,2,2,3);
   expect(palette[0].hex).toBe("#ff0000");
   expect(palette[0].fraction).toBeCloseTo(2/3);
   expect(palette[1].hex).toBe("#0000fa");
   expect(()=>extractPalette(pixels,1,1)).toThrow(/Invalid/);
   expect(()=>extractPalette(new Uint8ClampedArray(4),1,1)).toThrow(/opaque/);
   expect(()=>extractPalette(pixels,2,2,13)).toThrow(/1–12/);
 });
});
