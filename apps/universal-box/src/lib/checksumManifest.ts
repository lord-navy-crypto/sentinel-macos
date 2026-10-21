/** Portable content fingerprints. Only filenames, byte lengths and SHA-256 go in reports.
 * Importing a manifest never opens paths or reads files from the manifest itself.
 */
import type {FileInspection} from "./fileIntake";

const SCHEMA="universal-box-file-manifest";
const MAX_MANIFEST_BYTES=256_000;
const MAX_ENTRIES=80;
const MAX_NAME_LENGTH=512;
export type ChecksumEntry={name:string;size:number;sha256:string};
export type ComparisonStatus="match"|"changed"|"missing"|"ambiguous"|"extra";
export type ComparisonEntry={name:string;status:ComparisonStatus;expected?:ChecksumEntry;actual?:FileInspection};
export type ComparisonResult={entries:ComparisonEntry[];counts:Record<ComparisonStatus,number>};
const isObject=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
function validateEntries(entries:unknown):ChecksumEntry[]{
 if(!Array.isArray(entries)||entries.length>MAX_ENTRIES)throw Error("Manifest must contain at most 80 file entries.");
 const used=new Set<string>(),out:ChecksumEntry[]=[];
 for(const item of entries){
  if(!isObject(item)||typeof item.name!=="string"||!item.name||item.name.length>MAX_NAME_LENGTH
   ||/[\u0000-\u001f\u007f]/u.test(item.name)||typeof item.size!=="number"
   ||!Number.isSafeInteger(item.size)||item.size<0||item.size>64_000_000
   ||typeof item.sha256!=="string"||!/^[0-9a-f]{64}$/u.test(item.sha256))
   throw Error("Manifest contains an invalid filename, file size or SHA-256.");
  if(used.has(item.name))throw Error("Duplicate filenames cannot be matched unambiguously: "+item.name.slice(0,80));
  used.add(item.name);
  out.push({name:item.name,size:item.size,sha256:item.sha256});
 }
 return out;
}
export function createChecksumManifest(files:FileInspection[]):string{
 const entries=validateEntries(files.map(({name,size,sha256})=>({name,size,sha256})));
 return JSON.stringify({schema:SCHEMA,version:1,algorithm:"SHA-256",entries},null,2)+"\n";
}
export function parseChecksumManifest(text:string):ChecksumEntry[]{
 if(new TextEncoder().encode(text).length>MAX_MANIFEST_BYTES)throw Error("Checksum manifest exceeds 256 KB.");
 let raw:unknown;
 try{raw=JSON.parse(text) as unknown;}catch{throw Error("Invalid JSON checksum manifest.");}
 if(!isObject(raw)||raw.schema!==SCHEMA||raw.version!==1||raw.algorithm!=="SHA-256")
  throw Error("Not a supported Sentinel Box checksum manifest v1.");
 return validateEntries(raw.entries);
}
export function compareChecksumManifest(expected:ChecksumEntry[],actual:FileInspection[]):ComparisonResult{
 const manifest=validateEntries(expected);
 const current=new Map<string,FileInspection[]>();
 for(const row of actual)current.set(row.name,[...(current.get(row.name)??[]),row]);
 const used=new Set<string>(),entries:ComparisonEntry[]=[];
 for(const value of manifest){
  const matching=current.get(value.name)??[];
  used.add(value.name);
  if(!matching.length)entries.push({name:value.name,status:"missing",expected:value});
  else if(matching.length!==1)entries.push({name:value.name,status:"ambiguous",expected:value});
  else entries.push({name:value.name,status:matching[0].sha256===value.sha256&&matching[0].size===value.size?"match":"changed",expected:value,actual:matching[0]});
 }
 for(const [name,files] of current){
  if(used.has(name))continue;
  for(const file of files)entries.push({name,status:"extra",actual:file});
 }
 const counts:Record<ComparisonStatus,number>={match:0,changed:0,missing:0,ambiguous:0,extra:0};
 for(const row of entries)counts[row.status]++;
 return {entries,counts};
}
