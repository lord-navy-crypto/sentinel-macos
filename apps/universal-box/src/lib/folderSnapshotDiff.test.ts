import {describe,it,expect} from "vitest";
import {makeFolderSnapshot} from "./folderInventory";
import {compareFolderSnapshots,normalizeSnapshot,exportFolderDiffCsv} from "./folderSnapshotDiff";

const file=(root:string,relative:string,size:number,modified:number)=>({
 name:relative.split("/").at(-1)!,webkitRelativePath:root+"/"+relative,size,lastModified:modified,
});
const old=makeFolderSnapshot([
 file("Before","same.txt",12,1000),file("Before","docs/changed.md",100,2000),
 file("Before","deleted.csv",50,3000),file("Before","updated-time.txt",3,4000),
]);
const next=makeFolderSnapshot([
 file("After","same.txt",12,1000),file("After","docs/changed.md",140,2000),
 file("After","added.csv",70,5000),file("After","updated-time.txt",3,9000),
]);
describe("Metadata-only directory before/after snapshots",()=>{
 it("compares relative paths correctly even when selected folder root names differ",()=>{
  const before=normalizeSnapshot(old);
  const fresh=normalizeSnapshot(next);
  expect([...before.keys()].sort()).toEqual(["deleted.csv","docs/changed.md","same.txt","updated-time.txt"]);
  expect([...fresh.keys()].sort()).toEqual(["added.csv","docs/changed.md","same.txt","updated-time.txt"]);
  const diff=compareFolderSnapshots(old,next);
  expect([diff.added,diff.removed,diff.changed,diff.unchanged]).toEqual([1,1,2,1]);
  expect(diff.beforeCount).toBe(4);expect(diff.afterCount).toBe(4);
  expect(diff.changes.find(item=>item.path==="same.txt")?.reason)
   .toContain("未验证内容");
  expect(diff.changes.find(item=>item.path==="docs/changed.md")?.reason).toBe("大小变化");
  expect(diff.changes.find(item=>item.path==="updated-time.txt")?.reason).toBe("修改时间变化");
  expect(diff.changes.find(item=>item.path==="deleted.csv")?.status).toBe("removed");
  expect(diff.changes.find(item=>item.path==="added.csv")?.status).toBe("added");
 });
 it("does not strip directories if selection is a flat list of individually chosen files",()=>{
  const before=makeFolderSnapshot([{name:"draft.md",size:20,lastModified:1000}]);
  const after=makeFolderSnapshot([{name:"draft.md",size:20,lastModified:1000}]);
  const diff=compareFolderSnapshots(before,after);
  expect(diff.unchanged).toBe(1);
  expect(diff.changes[0].path).toBe("draft.md");
 });
 it("maintains case-sensitive path identity and Unicode filenames",()=>{
  const before=makeFolderSnapshot([file("Old","设计/方案.md",1,100),file("Old","Case.txt",1,100)]);
  const after=makeFolderSnapshot([file("New","设计/方案.md",1,100),file("New","case.txt",1,100)]);
  const diff=compareFolderSnapshots(before,after);
  expect(diff.unchanged).toBe(1);
  expect(diff.added).toBe(1);expect(diff.removed).toBe(1);
 });
 it("generates safe full CSV and changed-only CSV, with BOM and formula defense",()=>{
  const result=compareFolderSnapshots(old,next);
  const csv=exportFolderDiffCsv(result);
  expect(csv.startsWith("\uFEFFstatus,relative_path,reason")).toBe(true);
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(6);
  expect(csv).toContain('"unchanged","same.txt"');
  const changed=exportFolderDiffCsv(result,false);
  expect(changed.split("\r\n").filter(Boolean)).toHaveLength(5);
  expect(changed).not.toContain('"same.txt"');
  const malicious=makeFolderSnapshot([file("before","=LINK.csv",8,0)]);
  const emptyOther=makeFolderSnapshot([file("after","other.csv",10,0)]);
  const cells=exportFolderDiffCsv(compareFolderSnapshots(malicious,emptyOther));
  expect(cells).toContain('"\'=LINK.csv"');
 });
 it("rejects ambiguous repeated relative names and invalid metadata rather than guessing",()=>{
  const invalid={...old,files:[old.files[0],old.files[0]]};
  expect(()=>normalizeSnapshot(invalid)).toThrow(/repeated/);
  const missing={...old,files:[]};
  expect(()=>normalizeSnapshot(missing)).toThrow(/1–1,000/);
  const invalidSize={...old,files:[{...old.files[0],size:-1}]};
  expect(()=>normalizeSnapshot(invalidSize)).toThrow(/invalid/);
 });
});
