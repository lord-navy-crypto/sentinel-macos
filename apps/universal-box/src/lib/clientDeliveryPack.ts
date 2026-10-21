/** Verified offline client delivery ZIP composed only from explicitly selected files.
 * Reuses existing safe renaming, SHA-256 digest and spreadsheet-safe CSV export.
 */
import JSZip from "jszip";
import {planQuickZip} from "./quickZipPack";
import {hexDigest} from "./fileIntake";
import {mergedCsvExport} from "./csvMerge";

export type DeliveryInput={project:string;recipient:string;reference:string;deliveryDate:string;note:string};
export type DeliveryFile={name:string;size:number;arrayBuffer():Promise<ArrayBuffer>};
export type DeliveryRecord={source:string;path:string;bytes:number;sha256:string};
export type DeliveryPlan={
 input:DeliveryInput;files:ReturnType<typeof planQuickZip>;totalBytes:number;
};
export type DeliveryResult={zip:Uint8Array;records:DeliveryRecord[];manifest:{
 generator:"Sentinel Box";version:1;project:string;recipient:string;reference:string;deliveryDate:string;
 fileCount:number;totalBytes:number;files:DeliveryRecord[];verification:"SHA-256 and ZIP CRC32 re-read verified";
}};
const required=(value:string,max:number,label:string,nonempty:boolean):string=>{
 const v=value.trim();
 if((nonempty&&!v)||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v))
  throw Error(label+" is empty, too long or contains invalid control characters.");
 return v;
};
const date=(value:string):string=>{
 const raw=value.trim();
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(raw))throw Error("Delivery date must use YYYY-MM-DD.");
 const d=new Date(raw+"T00:00:00Z");
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==raw)
  throw Error("Delivery date must be a real calendar date.");
 return raw;
};
export function planClientDelivery(input:DeliveryInput,files:readonly {name:string;size:number}[]):DeliveryPlan{
 const validated:DeliveryInput={
  project:required(input.project,150,"Project",true),
  recipient:required(input.recipient,150,"Recipient",true),
  reference:required(input.reference,90,"Reference",false),
  deliveryDate:date(input.deliveryDate),
  note:required(input.note,6000,"Handover note",false),
 };
 const planned=planQuickZip(files);
 return {input:validated,files:planned,totalBytes:planned.reduce((n,x)=>n+x.size,0)};
}
export function deliveryReadme(plan:DeliveryPlan,records:readonly DeliveryRecord[]):string{
 const lines=[
  "SENTINEL BOX — CLIENT DELIVERY / 客户文件交付",
  "Project: "+plan.input.project,
  "Recipient: "+plan.input.recipient,
  ...(plan.input.reference?["Reference: "+plan.input.reference]:[]),
  "Delivery date: "+plan.input.deliveryDate,
  "Files: "+records.length,
  "Bytes (original file content): "+records.reduce((n,r)=>n+r.bytes,0),
  "",
  "HANDOVER NOTE (manually entered)",
  plan.input.note||"(none provided)",
  "",
  "CONTENTS",
  ...records.map(r=>r.path+" | "+r.bytes+" bytes | SHA-256 "+r.sha256),
  "",
  "VERIFY BEFORE SHARING",
  "1. Review the recipient name, selected files, permissions and any sensitive content.",
  "2. Check reports/checksums.sha256 with a standard SHA-256 utility after extracting the files.",
  "3. SHA-256 detects accidental changes; it does NOT guarantee the files are safe or authentic.",
  "4. This ZIP is NOT encrypted and does NOT send an email or upload files.",
 ];
 return lines.join("\n")+"\n";
}
export async function buildClientDelivery(
 input:DeliveryInput,files:readonly DeliveryFile[],
 onProgress?:(done:number,total:number)=>void,
):Promise<DeliveryResult>{
 const plan=planClientDelivery(input,files);
 if(!globalThis.crypto?.subtle)throw Error("Secure SHA-256 hashing is unavailable on this device.");
 const zip=new JSZip(),records:DeliveryRecord[]=[];
 for(const item of plan.files){
  const source=files[item.index];
  const bytes=new Uint8Array(await source.arrayBuffer());
  if(bytes.byteLength!==item.size)throw Error("Selected file changed while packaging: "+item.source);
  const sha256=hexDigest(await crypto.subtle.digest("SHA-256",bytes));
  const path="files/"+item.output;
  records.push({source:item.source,path,bytes:bytes.byteLength,sha256});
  zip.file(path,bytes);
  onProgress?.(records.length,plan.files.length);
 }
 const manifest={
  generator:"Sentinel Box" as const,version:1 as const,project:plan.input.project,
  recipient:plan.input.recipient,reference:plan.input.reference,deliveryDate:plan.input.deliveryDate,
  fileCount:records.length,totalBytes:records.reduce((s,r)=>s+r.bytes,0),
  files:records,verification:"SHA-256 and ZIP CRC32 re-read verified" as const,
 };
 zip.file("README-delivery.txt",deliveryReadme(plan,records));
 zip.file("reports/manifest.json",JSON.stringify(manifest,null,2));
 zip.file("reports/files.csv","\uFEFF"+mergedCsvExport({
  headers:["original_filename","packed_path","bytes","sha256"],
  rows:records.map(r=>[r.source,r.path,String(r.bytes),r.sha256]),
 }));
 zip.file("reports/checksums.sha256",records.map(r=>r.sha256+" *"+r.path).join("\n")+"\n");
 const archive=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
 if(archive.byteLength>20_000_000)throw Error("Delivery ZIP exceeds the 20 MB export limit.");
 // Read back the real artifact; compare every decompressed file to the declared digest.
 const inspected=await JSZip.loadAsync(new Uint8Array(archive),{checkCRC32:true});
 for(const record of records){
  const file=inspected.file(record.path);
  if(!file)throw Error("Delivery verification failed: missing "+record.path);
  const restored=await file.async("uint8array");
  if(restored.byteLength!==record.bytes||
   hexDigest(await crypto.subtle.digest("SHA-256",restored))!==record.sha256)
   throw Error("Delivery verification failed: checksum mismatch for "+record.path);
 }
 return {zip:archive,records,manifest};
}
