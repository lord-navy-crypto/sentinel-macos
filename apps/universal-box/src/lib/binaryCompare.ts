/** Exact offline binary comparison, using bounded Blob slices.
 * Only the selected files are read. No directory permissions or network access.
 */
export const COMPARE_MAX_BYTES=256_000_000;
export const COMPARE_CHUNK_BYTES=256*1024;
export const COMPARE_SEGMENTS=64;

export type CompareStatus="identical"|"different";
export type BinaryCompareResult={
 status:CompareStatus;
 aSize:number;bSize:number;comparedBytes:number;
 changedBytes:number;firstDifference:number|null;
 dirtyChunks:number;totalChunks:number;
 segments:{start:number;end:number;different:boolean}[];
};
export type CompareProgress={done:number;total:number};
type Options={
 onProgress?:(value:CompareProgress)=>void;
 signal?:AbortSignal;
 chunkSize?:number;
};
const abort=()=>new DOMException("Comparison cancelled.","AbortError");
function checkFiles(a:Blob,b:Blob,chunkSize:number):void{
 if(!Number.isSafeInteger(a.size)||!Number.isSafeInteger(b.size)||a.size<0||b.size<0
  ||a.size>COMPARE_MAX_BYTES||b.size>COMPARE_MAX_BYTES)
   throw Error("Each file must be 256 MB or smaller.");
 if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>COMPARE_CHUNK_BYTES)
   throw Error("Invalid comparison chunk size.");
}
/** Exact byte-by-byte compare (not a sampled or hash-only result).
 * A chunk is considered dirty if even one byte differs or is missing.
 */
export async function compareBlobs(a:Blob,b:Blob,{onProgress,signal,chunkSize=COMPARE_CHUNK_BYTES}:Options={}):Promise<BinaryCompareResult>{
 checkFiles(a,b,chunkSize);
 const max=Math.max(a.size,b.size);
 const totalChunks=Math.ceil(max/chunkSize);
 const dirty=new Array<boolean>(COMPARE_SEGMENTS).fill(false);
 const segmentSize=Math.max(1,Math.ceil(max/COMPARE_SEGMENTS));
 let changedBytes=0,firstDifference:number|null=null,dirtyChunks=0;
 onProgress?.({done:0,total:max});
 for(let begin=0,chunk=0;begin<max;begin+=chunkSize,chunk++){
  if(signal?.aborted)throw abort();
  const end=Math.min(max,begin+chunkSize);
  const [left,right]=await Promise.all([
   a.slice(begin,end).arrayBuffer(),b.slice(begin,end).arrayBuffer(),
  ]);
  const la=new Uint8Array(left),ra=new Uint8Array(right);
  let chunkDirty=false;
  for(let i=0;i<end-begin;i++){
   if(i>=la.length||i>=ra.length||la[i]!==ra[i]){
    const offset=begin+i;
    if(firstDifference===null)firstDifference=offset;
    changedBytes++;chunkDirty=true;
    dirty[Math.min(COMPARE_SEGMENTS-1,Math.floor(offset/segmentSize))]=true;
   }
  }
  if(chunkDirty)dirtyChunks++;
  if((chunk&7)===7||end===max)onProgress?.({done:end,total:max});
  // Keep the UI responsive when comparing large files; do not retain chunks.
  if((chunk&15)===15)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 if(signal?.aborted)throw abort();
 const segments=Array.from({length:COMPARE_SEGMENTS},(_,i)=>({
  start:Math.min(max,i*segmentSize),
  end:Math.min(max,(i+1)*segmentSize),
  different:dirty[i],
 })).filter(x=>x.end>x.start);
 return {
  status:changedBytes===0?"identical":"different",aSize:a.size,bSize:b.size,
  comparedBytes:max,changedBytes,firstDifference,dirtyChunks,totalChunks,segments,
 };
}
export function comparisonReport(result:BinaryCompareResult,firstName:string,secondName:string):string{
 const safeName=(name:string)=>name.slice(0,512);
 // Pure metadata. No source file bytes, local paths, or system configuration.
 return JSON.stringify({
  application:"Sentinel Box",format:"offline-exact-binary-compare-v1",
  first:{name:safeName(firstName),bytes:result.aSize},
  second:{name:safeName(secondName),bytes:result.bSize},
  status:result.status,comparedBytes:result.comparedBytes,
  changedBytes:result.changedBytes,firstDifferenceOffset:result.firstDifference,
  changedChunks:result.dirtyChunks,comparedChunks:result.totalChunks,
  sections:result.segments,
 },null,2)+"\n";
}
