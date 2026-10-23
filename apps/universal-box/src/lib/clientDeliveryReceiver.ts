/** Verify *received* Sentinel Box handoff ZIPs, not arbitrary/external archive content.
 * Content equality only: an editable manifest is NOT a signature of sender identity.
 */
import JSZip from "jszip";
import {hexDigest} from "./fileIntake";
import {inspectZip} from "./zipInspector";
import {mergedCsvExport} from "./csvMerge";

const MAX_ZIP=20_000_000,MAX_EXPANDED=18_000_000,MAX_DOCS=50;
const REQUIRED=["README-delivery.txt","reports/manifest.json",
 "reports/files.csv","reports/checksums.sha256"] as const;
export type DeliveryCheckStatus="match"|"changed"|"size_mismatch"|"missing"|"extra";
export type DeliveryCheck={path:string;expectedBytes?:number;actualBytes?:number;
 expectedSha256?:string;actualSha256?:string;status:DeliveryCheckStatus};
export type DeliveryReceipt={
 project:string;recipient:string;reference:string;deliveryDate:string;
 checks:DeliveryCheck[];counts:Record<DeliveryCheckStatus,number>;passed:boolean;
 notes:string[];
};
type RawRecord={source:string;path:string;bytes:number;sha256:string};
type RawManifest={generator:string;version:number;project:string;recipient:string;
 reference:string;deliveryDate:string;fileCount:number;totalBytes:number;files:RawRecord[]};
const isRecord=(v:unknown):v is Record<string,unknown>=>
 typeof v==="object"&&v!==null&&!Array.isArray(v);
const cleanText=(v:unknown,max:number,label:string,required=false):string=>{
 if(typeof v!=="string"||v.length>max||/[\u0000-\u001f\u007f]/u.test(v)||(required&&!v.trim()))
  throw Error("Invalid delivery manifest "+label+".");
 return v;
};
const safePackedPath=(path:string):boolean=>
 /^files\/[0-9]{3}-[^\\/\u0000-\u001f\u007f]{1,120}$/u.test(path)&&
 !path.includes(":");
function readManifest(value:unknown):RawManifest{
 if(!isRecord(value)||value.generator!=="Sentinel Box"||value.version!==1)
  throw Error("Not a recognized Sentinel Box client delivery manifest v1.");
 const project=cleanText(value.project,150,"project",true);
 const recipient=cleanText(value.recipient,150,"recipient",true);
 const reference=cleanText(value.reference,90,"reference");
 const deliveryDate=cleanText(value.deliveryDate,10,"date",true);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(deliveryDate)||
  Number.isNaN(Date.parse(deliveryDate+"T00:00:00Z"))||
  new Date(deliveryDate+"T00:00:00Z").toISOString().slice(0,10)!==deliveryDate)
  throw Error("Invalid delivery date in manifest.");
 const items=value.files;
 if(!Array.isArray(items)||items.length<1||items.length>MAX_DOCS||
  !Number.isSafeInteger(value.fileCount)||value.fileCount!==items.length)
  throw Error("Manifest file count is missing, invalid or inconsistent.");
 const records:RawRecord[]=[],seen=new Set<string>();
 let total=0;
 for(const [i,entry] of items.entries()){
  if(!isRecord(entry))throw Error("Malformed client delivery file entry "+(i+1)+".");
  const source=cleanText(entry.source,512,"source filename",true);
  const path=cleanText(entry.path,160,"packed filename",true);
  if(!safePackedPath(path)||!path.startsWith("files/"+String(i+1).padStart(3,"0")+"-"))
   throw Error("Manifest contains unsafe or out-of-order file paths.");
  const nameKey=path.normalize("NFKC").toLocaleLowerCase();
  if(seen.has(nameKey))throw Error("Manifest contains duplicate or colliding file paths.");
  seen.add(nameKey);
  const bytes=entry.bytes,sha256=entry.sha256;
  if(typeof bytes!=="number"||!Number.isSafeInteger(bytes)||bytes<0||bytes>16_000_000||
   typeof sha256!=="string"||!/^[a-f0-9]{64}$/u.test(sha256))
   throw Error("Invalid file size or SHA-256 in the delivery manifest.");
  total+=bytes;
  if(total>16_000_000)throw Error("Declared delivery files exceed 16 MB.");
  records.push({source,path,bytes,sha256});
 }
 if(value.totalBytes!==total)throw Error("Declared delivery total does not match item sizes.");
 return {generator:"Sentinel Box",version:1,project,recipient,reference,deliveryDate,
  fileCount:records.length,totalBytes:total,files:records};
}
function preflightArchive(archive:Uint8Array):void{
 if(archive.length<22||archive.length>MAX_ZIP)throw Error("Delivery ZIP must be 22 bytes–20 MB.");
 const metadata=inspectZip(archive);
 if(metadata.entries.length>MAX_DOCS+8)throw Error("Delivery ZIP has too many entries.");
 if(metadata.totalExpanded>MAX_EXPANDED)throw Error("Delivery ZIP declares excessive expanded data.");
 if(metadata.warnings.some(x=>/overlap|non-UTF8/u.test(x)))
  throw Error("Delivery ZIP has ambiguous or unsupported archive layout.");
 const seen=new Set<string>();
 for(const entry of metadata.entries){
  if(entry.unsafePath||entry.encrypted||entry.symlink||![0,8].includes(entry.method))
   throw Error("Delivery ZIP contains unsafe, encrypted, linked or unsupported entries.");
  const key=entry.name.normalize("NFKC").toLocaleLowerCase();
  if(seen.has(key))throw Error("Delivery ZIP contains duplicate or normalization-colliding paths.");
  seen.add(key);
  if(entry.uncompressedBytes>16_000_000||
   (entry.uncompressedBytes>0&&entry.uncompressedBytes/Math.max(1,entry.compressedBytes)>300))
   throw Error("Delivery ZIP contains oversized or suspiciously expansive content.");
 }
}
function exactExpectedCsv(manifest:RawManifest):string{
 return "\uFEFF"+mergedCsvExport({
  headers:["original_filename","packed_path","bytes","sha256"],
  rows:manifest.files.map(r=>[r.source,r.path,String(r.bytes),r.sha256]),
 });
}
function validateSidecars(manifest:RawManifest,csv:string,checksums:string):void{
 if(csv!==exactExpectedCsv(manifest))
  throw Error("Delivery CSV inventory disagrees with the JSON manifest.");
 const expected=manifest.files.map(r=>r.sha256+" *"+r.path).join("\n")+"\n";
 if(checksums!==expected)throw Error("Delivery checksum list disagrees with the JSON manifest.");
}
export async function verifyReceivedDelivery(
 archive:Uint8Array,onProgress?:(done:number,total:number)=>void,
):Promise<DeliveryReceipt>{
 preflightArchive(archive);
 if(!globalThis.crypto?.subtle)throw Error("Local SHA-256 verification is unavailable.");
 let zip:JSZip;
 try{zip=await JSZip.loadAsync(new Uint8Array(archive),{checkCRC32:true});}
 catch{throw Error("Received ZIP is damaged, has a CRC error or cannot be safely decoded.");}
 for(const name of REQUIRED)if(!zip.file(name))
  throw Error("Received package lacks required verification file: "+name);
 const metadataFile=zip.file("reports/manifest.json")!;
 const manifestText=await metadataFile.async("string");
 if(manifestText.length>120_000)throw Error("Manifest is too large.");
 let data:unknown;
 try{data=JSON.parse(manifestText) as unknown;}catch{throw Error("Invalid JSON delivery manifest.");}
 const manifest=readManifest(data);
 const csv=await zip.file("reports/files.csv")!.async("string");
 const checksums=await zip.file("reports/checksums.sha256")!.async("string");
 if(csv.length>180_000||checksums.length>12_000)
  throw Error("Oversized delivery verification sidecar.");
 validateSidecars(manifest,csv,checksums);
 const listed=new Set(manifest.files.map(f=>f.path));
 const checks:DeliveryCheck[]=[];
 for(const [i,record] of manifest.files.entries()){
  const file=zip.file(record.path);
  if(!file){
   checks.push({path:record.path,expectedBytes:record.bytes,expectedSha256:record.sha256,status:"missing"});
  }else{
   const actual=await file.async("uint8array");
   const digest=hexDigest(await crypto.subtle.digest("SHA-256",actual));
   checks.push({path:record.path,expectedBytes:record.bytes,actualBytes:actual.length,
    expectedSha256:record.sha256,actualSha256:digest,
    status:actual.length!==record.bytes?"size_mismatch":digest===record.sha256?"match":"changed"});
  }
  onProgress?.(i+1,manifest.files.length);
 }
 const allowed=new Set<string>([...REQUIRED,"files/","reports/"]);
 for(const name of Object.keys(zip.files)){
  if(allowed.has(name)||listed.has(name))continue;
  checks.push({path:name,status:"extra"});
 }
 const counts:Record<DeliveryCheckStatus,number>={match:0,changed:0,size_mismatch:0,missing:0,extra:0};
 checks.forEach(x=>counts[x.status]++);
 return {project:manifest.project,recipient:manifest.recipient,reference:manifest.reference,
  deliveryDate:manifest.deliveryDate,checks,counts,
  passed:counts.match===manifest.files.length&&counts.changed===0&&
   counts.size_mismatch===0&&counts.missing===0&&counts.extra===0,
  notes:["Content equality only: the sender can edit the ZIP and unsigned manifest.",
   "Successful hash checking does not prove authorship, malware safety, confidentiality or delivery acceptance.",
   "Files were checked in memory and were never executed or extracted to the filesystem."]};
}
export function receiptReport(receipt:DeliveryReceipt):string{
 return [
  "SENTINEL BOX — RECEIVED CLIENT DELIVERY VALIDATION",
  "Project: "+receipt.project,
  "Recipient: "+receipt.recipient,
  "Date: "+receipt.deliveryDate,
  "RESULT: "+(receipt.passed?"CONTENT MATCH":"PROBLEMS FOUND"),
  "Matching: "+receipt.counts.match,
  "Changed: "+receipt.counts.changed,
  "Wrong size: "+receipt.counts.size_mismatch,
  "Missing: "+receipt.counts.missing,
  "Extra: "+receipt.counts.extra,
  "",
  ...receipt.checks.map(x=>x.status.toUpperCase()+" | "+x.path+
   (x.actualSha256?" | actual SHA-256 "+x.actualSha256:"")+
   (x.expectedSha256?" | declared SHA-256 "+x.expectedSha256:"")),
  "",
  ...receipt.notes,
 ].join("\n")+"\n";
}
