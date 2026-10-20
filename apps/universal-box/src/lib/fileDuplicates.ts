/** Local duplicate checks via strong cryptographic content fingerprints. */
export type LocalFileCandidate={name:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>};
export type DuplicateFile={name:string;size:number;sha256:string};
export type DuplicateGroup={sha256:string;size:number;files:DuplicateFile[]};
export type DuplicateReport={scanned:number;bytes:number;groups:DuplicateGroup[];unique:number};
export async function findDuplicateFiles(files:LocalFileCandidate[]):Promise<DuplicateReport>{
 if(files.length<2||files.length>30)throw Error("Select 2–30 local files.");
 if(!globalThis.crypto?.subtle)throw Error("WebCrypto SHA-256 is not available.");
 let total=0;
 for(const file of files){
   if(!Number.isSafeInteger(file.size)||file.size<0||file.size>20_000_000)
     throw Error("Each file must be 0–20 MB.");
   total+=file.size;
   if(total>80_000_000)throw Error("Selected files exceed 80 MB combined.");
 }
 const groups=new Map<string,DuplicateFile[]>();
 for(const file of files){
   const buffer=await file.arrayBuffer();
   if(buffer.byteLength!==file.size)throw Error("File changed during reading: "+file.name);
   const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",buffer));
   const sha256=Array.from(hash,byte=>byte.toString(16).padStart(2,"0")).join("");
   const key=file.size+":"+sha256;
   groups.set(key,[...(groups.get(key)??[]),{name:file.name,size:file.size,sha256}]);
 }
 const duplicates=[...groups.values()].filter(members=>members.length>=2).map(members=>({
   sha256:members[0].sha256,size:members[0].size,files:members,
 }));
 return {scanned:files.length,bytes:total,unique:groups.size,groups:duplicates};
}
