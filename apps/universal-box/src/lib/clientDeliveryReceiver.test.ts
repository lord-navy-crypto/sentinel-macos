import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {buildClientDelivery,type DeliveryInput,type DeliveryFile} from "./clientDeliveryPack";
import {verifyReceivedDelivery,receiptReport} from "./clientDeliveryReceiver";

const details:DeliveryInput={
 project:"Website redesign",recipient:"Example Client",reference:"REF-104",deliveryDate:"2026-10-22",
 note:"Manually reviewed project documents",
};
function source(name:string,text:string):DeliveryFile{
 const data=new TextEncoder().encode(text);
 return {name,size:data.length,async arrayBuffer(){return new Uint8Array(data).buffer;}};
}
const fixture=async()=>buildClientDelivery(details,[
 source("report.txt","hello"),source("data.csv","id,value\n001,alpha\n"),
]);
const rebuilt=async(bytes:Uint8Array,change:(zip:JSZip)=>void)=>{
 const zip=await JSZip.loadAsync(bytes);
 change(zip);
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
};
describe("Received client delivery ZIP integrity scanner",()=>{
 it("validates a genuine package and provides a transparent downloadable report",async()=>{
  const built=await fixture();
  const progress:number[]=[];
  const received=await verifyReceivedDelivery(built.zip,(done,total)=>{
   expect(done).toBeGreaterThan(0);expect(total).toBe(2);progress.push(done);
  });
  expect(progress).toEqual([1,2]);
  expect(received.passed).toBe(true);
  expect(received.project).toBe("Website redesign");
  expect(received.recipient).toBe("Example Client");
  expect(received.counts).toEqual({match:2,changed:0,size_mismatch:0,missing:0,extra:0});
  expect(received.checks.every(x=>x.expectedSha256===x.actualSha256)).toBe(true);
  const txt=receiptReport(received);
  expect(txt).toContain("RESULT: CONTENT MATCH");
  expect(txt).toContain("NOT guarantee").toBe(false);
  expect(txt).toContain("does not prove authorship");
 });
 it("flags a same-size content change despite a fresh ZIP CRC",async()=>{
  const original=(await fixture()).zip;
  const tampered=await rebuilt(original,zip=>zip.file("files/001-report.txt","HELLO"));
  const checked=await verifyReceivedDelivery(tampered);
  expect(checked.passed).toBe(false);
  expect(checked.counts).toEqual({match:1,changed:1,size_mismatch:0,missing:0,extra:0});
  expect(checked.checks[0].expectedSha256).not.toEqual(checked.checks[0].actualSha256);
 });
 it("reports missing and unexpected files separately, never claiming success",async()=>{
  const original=(await fixture()).zip;
  const changed=await rebuilt(original,zip=>{
   zip.remove("files/001-report.txt");
   zip.file("files/999-extra.txt","unexpected");
  });
  const result=await verifyReceivedDelivery(changed);
  expect(result.passed).toBe(false);
  expect(result.counts).toEqual({match:1,changed:0,size_mismatch:0,missing:1,extra:1});
  expect(result.checks.map(x=>x.status)).toEqual(["missing","match","extra"]);
 });
 it("refuses a fake sidecar, even when the archived content bytes still match",async()=>{
  const original=(await fixture()).zip;
  const changed=await rebuilt(original,zip=>zip.file("reports/checksums.sha256","deadbeef *files/001-report.txt\n"));
  await expect(verifyReceivedDelivery(changed)).rejects.toThrow(/checksum list disagrees/);
 });
 it("flags file length mismatch distinctly from a same-length content change",async()=>{
  const original=(await fixture()).zip;
  const changed=await rebuilt(original,zip=>zip.file("files/001-report.txt","hello with additional bytes"));
  const r=await verifyReceivedDelivery(changed);
  expect(r.counts.size_mismatch).toBe(1);
  expect(r.passed).toBe(false);
 });
 it("rejects an unsafe relative path and a corrupt / unrelated archive",async()=>{
  const original=(await fixture()).zip;
  const dangerous=await rebuilt(original,zip=>zip.file("../escape.txt","not allowed",{createFolders:false}));
  await expect(verifyReceivedDelivery(dangerous)).rejects.toThrow(/unsafe/);
  await expect(verifyReceivedDelivery(new Uint8Array(50).fill(1))).rejects.toThrow(/ZIP/);
 });
 it("does not accidentally accept missing or mismatched required JSON metadata",async()=>{
  const original=(await fixture()).zip;
  const missing=await rebuilt(original,zip=>zip.remove("reports/manifest.json"));
  await expect(verifyReceivedDelivery(missing)).rejects.toThrow(/lacks required/);
  const bad=await rebuilt(original,zip=>zip.file("reports/manifest.json",JSON.stringify({
   generator:"Random",version:1,fileCount:1,files:[],
  })));
  await expect(verifyReceivedDelivery(bad)).rejects.toThrow(/recognized Sentinel Box/);
 });
});
