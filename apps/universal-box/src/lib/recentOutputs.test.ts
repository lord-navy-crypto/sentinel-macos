import {beforeEach,describe,expect,it} from "vitest";
import {
 addRecentOutput,clearRecentOutputs,consumeHandoff,handoffTarget,
 MAX_HANDOFF_BYTES,recentOutputSnapshot,removeRecentOutput,requestHandoff,
 subscribeRecentOutputs,
} from "./recentOutputs";
beforeEach(()=>clearRecentOutputs());
const data=(content:string)=>new TextEncoder().encode(content);
describe("Universal Box in-memory result handoffs",()=>{
 it("retains only exported bytes and explicitly selected handoffs",async()=>{
  expect(addRecentOutput("a.pdf",data("PDF DATA"))).toBe(true);
  const id=recentOutputSnapshot()[0].id;
  expect(handoffTarget()).toBeNull();
  expect(requestHandoff(id,"nearby")).toBe(true);
  expect(consumeHandoff("file-intake")).toBeNull(); // wrong consumer cannot steal
  const target=consumeHandoff("nearby");
  expect(target?.name).toBe("a.pdf");
  expect(await target?.text()).toBe("PDF DATA");
  expect(handoffTarget()).toBeNull();
 });
 it("uses a copy, not the caller's mutable bytes",async()=>{
  const value=data("original");
  addRecentOutput("notes.txt",value);
  value[0]=0;
  const id=recentOutputSnapshot()[0].id;
  requestHandoff(id,"binary-left");
  expect(await consumeHandoff("binary-left")?.text()).toBe("original");
 });
 it("uses bounds on file size, count and cumulative memory",()=>{
  expect(addRecentOutput("giant.zip",new Uint8Array(MAX_HANDOFF_BYTES+1))).toBe(false);
  for(let i=0;i<9;i++)expect(addRecentOutput("f"+i+".txt",data(String(i)))).toBe(true);
  expect(recentOutputSnapshot()).toHaveLength(6);
  expect(recentOutputSnapshot()[0].name).toBe("f8.txt");
 });
 it("removes bytes, queues and notifies subscribers",()=>{
  let count=0;const stop=subscribeRecentOutputs(()=>count++);
  addRecentOutput("private.txt",data("secret"));
  const id=recentOutputSnapshot()[0].id;
  requestHandoff(id,"file-intake");
  removeRecentOutput(id);
  expect(consumeHandoff("file-intake")).toBeNull();
  expect(recentOutputSnapshot()).toEqual([]);
  stop();
  expect(count).toBeGreaterThanOrEqual(3);
 });
 it("rejects empty and unsafe filenames without copying them",()=>{
  expect(addRecentOutput("../abc\\n.txt",data("a"))).toBe(false);
  expect(addRecentOutput("",data("a"))).toBe(false);
  expect(addRecentOutput("safe.txt",new Uint8Array())).toBe(false);
  expect(recentOutputSnapshot()).toHaveLength(0);
 });
});
