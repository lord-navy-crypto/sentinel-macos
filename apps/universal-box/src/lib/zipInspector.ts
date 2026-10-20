/** Read-only ZIP central-directory inspector: never inflates untrusted entries. */
export type ZipEntry={
 name:string;compressedBytes:number;uncompressedBytes:number;
 method:number;crc32:number;encrypted:boolean;unsafePath:boolean;symlink:boolean;warnings:string[];
};
export type ZipInspection={entries:ZipEntry[];totalCompressed:number;totalExpanded:number;warnings:string[]};
const MAX_ARCHIVE=20_000_000,MAX_ENTRIES=1500;
const sig=(d:DataView,at:number,value:number)=>at+4<=d.byteLength&&d.getUint32(at,true)===value;
function unsafeZipPath(name:string):boolean{
 const path=name.replace(/\\/gu,"/");
 return !path||path.startsWith("/")||/^[a-zA-Z]:/u.test(path)
   ||path.split("/").some(part=>part===".."||part===".")
   ||name.includes("\0")||/[\u0000-\u001f\u007f]/u.test(name);
}
export function inspectZip(input:Uint8Array):ZipInspection{
 if(input.length<22||input.length>MAX_ARCHIVE)throw Error("ZIP must be 22 bytes–20 MB.");
 const d=new DataView(input.buffer,input.byteOffset,input.byteLength);
 // EOCD can have a trailing comment (max 65,535 bytes); verify its declared size.
 let eocd=-1;
 for(let p=input.length-22;p>=Math.max(0,input.length-65557);p--){
   if(sig(d,p,0x06054b50)&&p+22+d.getUint16(p+20,true)===input.length){eocd=p;break;}
 }
 if(eocd<0)throw Error("ZIP end-of-central-directory not found. ZIP64 and split archives are unsupported.");
 if(d.getUint16(eocd+4,true)!==0||d.getUint16(eocd+6,true)!==0
   ||d.getUint16(eocd+8,true)!==d.getUint16(eocd+10,true))
   throw Error("Multi-disk ZIPs are not supported.");
 const count=d.getUint16(eocd+10,true),size=d.getUint32(eocd+12,true),offset=d.getUint32(eocd+16,true);
 if(count===0xffff||size===0xffffffff||offset===0xffffffff)throw Error("ZIP64 is unsupported.");
 if(count>MAX_ENTRIES)throw Error("Maximum 1,500 ZIP entries.");
 if(offset+size>eocd)throw Error("ZIP central directory exceeds archive boundaries.");
 const decoder=new TextDecoder("utf-8",{fatal:true});
 const entries:ZipEntry[]=[],warnings:string[]=[];
 let cursor=offset,totalExpanded=0,totalCompressed=0;
 const ranges:{start:number;end:number}[]=[];
 for(let i=0;i<count;i++){
   if(cursor+46>offset+size||!sig(d,cursor,0x02014b50))
     throw Error("Invalid ZIP central directory entry "+(i+1)+".");
   const flag=d.getUint16(cursor+8,true),method=d.getUint16(cursor+10,true);
   const compressedBytes=d.getUint32(cursor+20,true),uncompressedBytes=d.getUint32(cursor+24,true),crc32=d.getUint32(cursor+16,true);
   const nameLength=d.getUint16(cursor+28,true),extraLength=d.getUint16(cursor+30,true);
   const commentLength=d.getUint16(cursor+32,true);
   const attributes=d.getUint32(cursor+38,true),localOffset=d.getUint32(cursor+42,true);
   const end=cursor+46+nameLength+extraLength+commentLength;
   if(end>offset+size||!nameLength)throw Error("ZIP central entry has invalid length.");
   let name:string;
   const raw=input.subarray(cursor+46,cursor+46+nameLength);
   try{name=decoder.decode(raw);}
   catch{
     if(flag&0x800)throw Error("ZIP entry marked UTF-8 has an invalid filename.");
     name=Array.from(raw,byte=>String.fromCharCode(byte)).join("");
     warnings.push("At least one non-UTF8 filename was displayed using a Latin-1 fallback.");
   }
   if(compressedBytes===0xffffffff||uncompressedBytes===0xffffffff||localOffset===0xffffffff)
     throw Error("ZIP64 entry is not supported.");
   if(localOffset+30>offset||!sig(d,localOffset,0x04034b50))
     throw Error("ZIP local file header is invalid or outside entry area.");
   const localNameLength=d.getUint16(localOffset+26,true),localExtraLength=d.getUint16(localOffset+28,true);
   const start=localOffset+30+localNameLength+localExtraLength;
   const dataEnd=start+compressedBytes;
   if(dataEnd>offset)throw Error("ZIP compressed entry overlaps the central directory.");
   if(d.getUint16(localOffset+8,true)!==method)throw Error("ZIP method differs between headers.");
   if(d.getUint16(localOffset+6,true)!==flag)throw Error("ZIP flags differ between headers.");
   if(localNameLength!==nameLength)throw Error("ZIP filenames differ between local and central headers.");
   for(let k=0;k<nameLength;k++)
     if(input[localOffset+30+k]!==raw[k])throw Error("ZIP filenames differ between local and central headers.");
   const unsafePath=unsafeZipPath(name);
   const symlink=(attributes>>>28)===0xa; // UNIX S_IFLNK in upper 16 bits
   const encrypted=Boolean(flag&1);
   const alerts:string[]=[];
   if(unsafePath)alerts.push("Unsafe path / possible traversal");
   if(symlink)alerts.push("Symbolic link entry");
   if(encrypted)alerts.push("Encrypted entry (cannot inspect content)");
   if(![0,8].includes(method))alerts.push("Unsupported ZIP compression method");
   if(uncompressedBytes>100_000_000)alerts.push("Large declared uncompressed file (>100 MB)");
   if(uncompressedBytes>0&&uncompressedBytes/Math.max(1,compressedBytes)>200)
     alerts.push("High declared expansion ratio (>200×)");
   totalExpanded+=uncompressedBytes;totalCompressed+=compressedBytes;
   entries.push({name,compressedBytes,uncompressedBytes,method,crc32,unsafePath,symlink,encrypted,warnings:alerts});
   ranges.push({start:localOffset,end:dataEnd});
   cursor=end;
 }
 if(cursor!==offset+size)throw Error("ZIP central directory entry count or length mismatch.");
 ranges.sort((a,b)=>a.start-b.start);
 for(let i=1;i<ranges.length;i++)if(ranges[i].start<ranges[i-1].end)
   warnings.push("Entry data ranges overlap.");
 if(totalExpanded>500_000_000)warnings.push("Declared total extraction size exceeds 500 MB.");
 if(entries.some(e=>e.unsafePath))warnings.push("Unsafe archive paths: do not extract without strict validation.");
 if(entries.some(e=>e.symlink))warnings.push("Archive contains symbolic links.");
 if(entries.some(e=>e.encrypted))warnings.push("Archive contains encrypted entries.");
 if(entries.some(e=>e.warnings.some(x=>x.startsWith("High")||x.startsWith("Large"))))
   warnings.push("Archive may consume excessive disk space or memory when extracted.");
 return {entries,totalCompressed,totalExpanded,warnings:[...new Set(warnings)]};
}
