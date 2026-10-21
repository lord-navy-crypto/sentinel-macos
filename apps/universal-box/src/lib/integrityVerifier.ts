/** Opt-in local SHA-256 manifests and baseline verification, not malware scanning. */
export type IntegrityRecord={name:string;size:number;sha256:string};
export type IntegrityManifest={format:"sentinel-box-sha256-v1";files:IntegrityRecord[]};
export type IntegrityStatus={name:string;state:"match"|"modified"|"missing"|"extra";expected?:string;actual?:string};
function validFiles(files:readonly File[]):void{
 if(!files.length||files.length>20||files.reduce((n,f)=>n+f.size,0)>20_000_000||files.some(f=>f.size>10_000_000))
  throw Error("Choose 1–20 files, at most 10 MB each and 20 MB total.");
 const names=files.map(f=>f.name);
 if(new Set(names).size!==names.length)throw Error("Duplicate filenames are ambiguous. Rename copies before comparing.");
}
async function sha256(file:File):Promise<string>{
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
 return Array.from(hash,x=>x.toString(16).padStart(2,"0")).join("");
}
export async function hashSelectedFiles(files:readonly File[]):Promise<IntegrityManifest>{
 validFiles(files);const results:IntegrityRecord[]=[];
 for(const file of files)results.push({name:file.name,size:file.size,sha256:await sha256(file)});
 return {format:"sentinel-box-sha256-v1",files:results.sort((a,b)=>a.name.localeCompare(b.name))};
}
export function readIntegrityManifest(raw:string):IntegrityManifest{
 if(raw.length>150_000)throw Error("Manifest too large.");
 let value:unknown;
 try{value=JSON.parse(raw);}catch{throw Error("Manifest is not valid JSON.");}
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid manifest object.");
 const data=value as {format?:unknown;files?:unknown};
 if(data.format!=="sentinel-box-sha256-v1"||!Array.isArray(data.files)||data.files.length<1||data.files.length>20)
  throw Error("Unsupported manifest format or file count.");
 const seen=new Set<string>(),files:IntegrityRecord[]=[];
 for(const item of data.files){
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("Invalid manifest record.");
  const obj=item as Partial<IntegrityRecord>;
  if(typeof obj.name!=="string"||!obj.name||obj.name.length>255||/[\/\\\u0000-\u001f]/u.test(obj.name)
   ||typeof obj.size!=="number"||!Number.isSafeInteger(obj.size)||obj.size<0||obj.size>10_000_000
   ||typeof obj.sha256!=="string"||!/^[0-9a-f]{64}$/u.test(obj.sha256)||seen.has(obj.name))
   throw Error("Invalid or duplicate SHA-256 manifest entry.");
  seen.add(obj.name);files.push({name:obj.name,size:obj.size,sha256:obj.sha256});
 }
 return {format:"sentinel-box-sha256-v1",files};
}
export async function checkSelectedFiles(files:readonly File[],expected:IntegrityManifest):Promise<IntegrityStatus[]>{
 const actual=await hashSelectedFiles(files);
 const baseline=new Map(expected.files.map(x=>[x.name,x]));
 const inspected=new Set<string>(),result:IntegrityStatus[]=[];
 for(const item of actual.files){
  inspected.add(item.name);const ref=baseline.get(item.name);
  result.push({name:item.name,state:!ref?"extra":ref.size===item.size&&ref.sha256===item.sha256?"match":"modified",
   expected:ref?.sha256,actual:item.sha256});
 }
 for(const ref of expected.files)if(!inspected.has(ref.name))result.push({name:ref.name,state:"missing",expected:ref.sha256});
 return result.sort((a,b)=>a.name.localeCompare(b.name));
}
export function formatSha256List(manifest:IntegrityManifest):string{
 return manifest.files.map(x=>x.sha256+"  "+x.name).join("\n")+"\n";
}
