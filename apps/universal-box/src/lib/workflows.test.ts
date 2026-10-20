import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectZip} from "./zipInspector";
import {planSafeZipExtraction,safeSelectiveZip} from "./safeZipExtract";
import {planImageWorkflow,imageWorkflowMime,imageWorkflowScale,type ImageWorkflowOptions} from "./imageWorkflow";

describe("v0.24 selective ZIP extraction and protected repack",()=>{
 async function sampleZip(){
   const zip=new JSZip();
   zip.file("docs/notes.txt","A simple hello.");
   zip.file("image.png",new Uint8Array([0,1,2,3,4,255]));
   return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
 }
 it("selects only authorized entries, checks CRC and repackages under safe names",async()=>{
   const source=await sampleZip();
   const plan=planSafeZipExtraction(source,["docs/notes.txt"]);
   expect(plan.items.map(x=>x.safeName)).toEqual(["extracted/file-001.txt"]);
   expect(plan.totalSize).toBe(15);
   const result=await safeSelectiveZip(source,["docs/notes.txt"]);
   expect(result.count).toBe(1);
   const out=await JSZip.loadAsync(result.bytes);
   expect(await out.file("extracted/file-001.txt")?.async("string")).toBe("A simple hello.");
   expect(out.file("image.png")).toBeNull();
   const manifest=JSON.parse(await out.file("manifest.json")!.async("string"));
   expect(manifest.files[0]).toMatchObject({original:"docs/notes.txt",output:"extracted/file-001.txt",size:15});
 });
 it("supports selecting multiple uncompressed files, including Chinese filename",async()=>{
   const zip=new JSZip();zip.file("图像/像素.png",new Uint8Array([12,22,32]));zip.file("notes.md","hello");
   const source=await zip.generateAsync({type:"uint8array",compression:"STORE"});
   const result=await safeSelectiveZip(source,["图像/像素.png","notes.md"]);
   const out=await JSZip.loadAsync(result.bytes);
   expect([...new Uint8Array(await out.file("extracted/file-001.png")!.async("uint8array"))]).toEqual([12,22,32]);
   expect(await out.file("extracted/file-002.md")!.async("string")).toBe("hello");
   expect(out.file("图像/像素.png")).toBeNull();
 });
 it("rejects malformed selections, unsafe paths, duplicate names and unusual inflation",async()=>{
   const source=await sampleZip();
   expect(()=>planSafeZipExtraction(source,[])).toThrow(/1–30/);
   expect(()=>planSafeZipExtraction(source,["not-here"])).toThrow(/not found/);
   expect(()=>planSafeZipExtraction(source,["image.png","image.png"])).toThrow(/Duplicate/);
   const zip=new JSZip();zip.file("../outside.txt","bad");
   const traversal=await zip.generateAsync({type:"uint8array"});
   expect(()=>planSafeZipExtraction(traversal,["../outside.txt"])).toThrow(/unsafe paths/);
   const collision=new JSZip();collision.file("Readme.md","a");collision.file("README.md","b");
   const bad=await collision.generateAsync({type:"uint8array"});
   expect(()=>planSafeZipExtraction(bad,["Readme.md"])).toThrow(/colliding paths/);
   const bomb=new JSZip();bomb.file("large.txt","x".repeat(400000));
   const compressed=await bomb.generateAsync({type:"uint8array",compression:"DEFLATE"});
   expect(()=>planSafeZipExtraction(compressed,["large.txt"])).toThrow(/300×/);
 });
 it("detects CRC mismatch after a central-header-valid source file is modified",async()=>{
   const zip=new JSZip();zip.file("test.txt","integrity-check-hello");
   const bytes=await zip.generateAsync({type:"uint8array",compression:"STORE"});
   const middle=Array.from(bytes).findIndex((value,index)=>
     value===105&&bytes[index+1]===110&&bytes[index+2]===116&&bytes[index+3]===101);
   expect(middle).toBeGreaterThan(20);
   const modified=Uint8Array.from(bytes);modified[middle]^=1;
   // Inspector sees structurally valid headers, so only streaming CRC detects this alteration.
   expect(inspectZip(modified).entries).toHaveLength(1);
   await expect(safeSelectiveZip(modified,["test.txt"])).rejects.toThrow(/CRC-32/);
 });
});
describe("v0.24 image workflow plans",()=>{
 const options:ImageWorkflowOptions={
   format:"webp",maxDimension:1024,quality:.85,prefix:"我的 图像/",includeManifest:true,
 };
 const file=(name:string,size=12,type="image/png")=>({name,size,type});
 it("stages dimension-preserving resize, multi-output conversion and safe unique names",()=>{
   expect(imageWorkflowScale(4000,1000,1024)).toEqual({width:1024,height:256});
   expect(imageWorkflowScale(640,480,1024)).toEqual({width:640,height:480});
   const plan=planImageWorkflow([file("one.png"),file("two.webp",22,"image/webp")],options);
   expect(plan).toHaveLength(2);
   expect(plan[0].outputName).toBe("我的-图像--001.webp");
   expect(plan[1].outputName).toBe("我的-图像--002.webp");
   expect(imageWorkflowMime("png")).toBe("image/png");
 });
 it("refuses excessive pixels, unsupported formats, too many images and invalid quality",()=>{
   expect(()=>imageWorkflowScale(4000,3000,1024)).toThrow(/8 million/);
   expect(()=>planImageWorkflow([file("evil.svg",12,"image/svg+xml")],options)).toThrow(/PNG/);
   expect(()=>planImageWorkflow(Array.from({length:13},()=>file("x.png")),options)).toThrow(/1–12/);
   expect(()=>planImageWorkflow([file("a.png")],{...options,quality:1.1})).toThrow(/0.5/);
   expect(()=>planImageWorkflow([file("a.png")],{...options,prefix:"x".repeat(31)})).toThrow(/30/);
 });
});
