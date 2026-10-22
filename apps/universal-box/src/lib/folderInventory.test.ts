import {describe,it,expect} from "vitest";
import {makeFolderSnapshot,folderTreeMarkdown,folderInventoryCsv,folderExtensionSummary} from "./folderInventory";

describe("Metadata-only offline folder inventory",()=>{
 const input=[
  {name:"readme.md",webkitRelativePath:"My Project/readme.md",size:104,lastModified:0},
  {name:"main.ts",webkitRelativePath:"My Project/src/main.ts",size:300,lastModified:1000},
  {name:"data, v2.csv",webkitRelativePath:"My Project/data/data, v2.csv",size:22,lastModified:2000},
  {name:"=START.txt",webkitRelativePath:"My Project/data/=START.txt",size:9,lastModified:3000},
 ];
 it("builds sorted nested folder paths and sums sizes without touching file contents",()=>{
  const before=JSON.stringify(input);
  const result=makeFolderSnapshot(input);
  expect(result.files).toHaveLength(4);
  expect(result.folders).toEqual(["My Project","My Project/data","My Project/src"]);
  expect(result.totalBytes).toBe(435);
  expect(result.files.map(x=>x.path)).toEqual([
   "My Project/data/=START.txt",
   "My Project/data/data, v2.csv",
   "My Project/readme.md",
   "My Project/src/main.ts",
  ]);
  expect(result.files[0].modified).toBe("1970-01-01T00:00:03.000Z");
  expect(input[0].name).toBe("readme.md");
  expect(JSON.stringify(input)).toBe(before);
 });
 it("produces a real nested Markdown directory tree and extension breakdown",()=>{
  const snap=makeFolderSnapshot(input);
  const tree=folderTreeMarkdown(snap);
  expect(tree).toMatch(/- My Project\/\n  - data\/\n    - =START\.txt \(9 bytes\)/);
  expect(tree).toContain("  - src/\n    - main.ts (300 bytes)");
  const summaries=folderExtensionSummary(snap);
  expect(summaries[0]).toEqual({extension:"ts",count:1,bytes:300});
  expect(summaries.reduce((n,item)=>n+item.bytes,0)).toBe(435);
 });
 it("exports safe BOM-prefixed CSV with nested paths, quotes and formula prefix",()=>{
  const csv=folderInventoryCsv(makeFolderSnapshot(input));
  expect(csv.startsWith("\uFEFFindex,relative_path,file_name,extension,size_bytes,modified_utc\r\n")).toBe(true);
  expect(csv).toContain('"My Project/data/data, v2.csv"');
  expect(csv).toContain('"\'=START.txt"');
  expect(csv).toContain('"\'My Project/data/=START.txt"');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(5);
 });
 it("flat file selection must not invent a parent directory",()=>{
  const snap=makeFolderSnapshot([{name:"a.txt",size:0,lastModified:0}]);
  expect(snap.folders).toHaveLength(0);
  expect(snap.files[0].path).toBe("a.txt");
 });
 it("refuses unknown traversal, invalid metadata, duplicate paths and unsafe scale",()=>{
  expect(()=>makeFolderSnapshot([])).toThrow(/1–1,000/);
  expect(()=>makeFolderSnapshot(Array.from({length:1001},(_,i)=>({name:"f"+i,size:1,lastModified:0})))).toThrow(/1–1,000/);
  expect(()=>makeFolderSnapshot([{name:"x",webkitRelativePath:"../x",size:1,lastModified:0}])).toThrow(/invalid/);
  expect(()=>makeFolderSnapshot([{name:"a",webkitRelativePath:"/root/a",size:1,lastModified:0}])).toThrow(/absolute/);
  expect(()=>makeFolderSnapshot([{name:"a",webkitRelativePath:"one//a",size:1,lastModified:0}])).toThrow(/absolute/);
  expect(()=>makeFolderSnapshot([{name:"x",webkitRelativePath:"folder/y",size:1,lastModified:0}])).toThrow(/match/);
  expect(()=>makeFolderSnapshot([{name:"x",size:-1,lastModified:0}])).toThrow(/invalid size/);
  expect(()=>makeFolderSnapshot([{name:"a",size:1,lastModified:NaN}])).toThrow(/modification time/);
  expect(()=>makeFolderSnapshot([{name:"a",size:1,lastModified:0},{name:"a",size:1,lastModified:0}])).toThrow(/Duplicate/);
  const deep="folder/".repeat(26)+"a";
  expect(()=>makeFolderSnapshot([{name:"a",webkitRelativePath:deep,size:1,lastModified:0}])).toThrow(/25 levels/);
 });
 it("Markdown names with formatting characters are escaped",()=>{
  const snap=makeFolderSnapshot([{name:"important_[a].md",size:12,lastModified:0}]);
  expect(folderTreeMarkdown(snap)).toContain("important\\_\\[a\\].md");
 });
});
