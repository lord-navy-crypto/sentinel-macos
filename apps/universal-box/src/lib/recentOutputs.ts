/**
 * Runtime-only handoff between Universal Box modules.
 * Deliberately no localStorage, network, broad filesystem access or auto-send.
 * We only retain results explicitly saved/exported by the user. Originals aren't changed.
 */
export type HandoffTarget="nearby"|"file-intake"|"binary-left"|"binary-right";
export type RecentOutput={id:number;name:string;size:number;createdAt:number};
type StoredOutput=RecentOutput&{bytes:Uint8Array};
type PendingHandoff={id:number;target:HandoffTarget};
const MAX_RESULTS=6;
export const MAX_HANDOFF_BYTES=8_000_000; // Align with Commons per-file limit.
export const MAX_TOTAL_MEMORY=24_000_000;
let nextId=1;
let records:StoredOutput[]=[];
let snapshot:RecentOutput[]=[];
let pending:PendingHandoff|null=null;
const compareSlots:{left:File|null;right:File|null}={left:null,right:null};
export function getCompareSlot(side:"left"|"right"):File|null{return compareSlots[side];}
export function setCompareSlot(side:"left"|"right",file:File|null):void{compareSlots[side]=file;}

const listeners=new Set<()=>void>();
function publish(){
 snapshot=records.map(({id,name,size,createdAt})=>({id,name,size,createdAt}));
 for(const listener of listeners)listener();
}
export function subscribeRecentOutputs(listener:()=>void):()=>void{
 listeners.add(listener);return()=>listeners.delete(listener);
}
export function recentOutputSnapshot():RecentOutput[]{return snapshot;}
export function hasRecentOutputs():boolean{return snapshot.length>0;}
export function addRecentOutput(name:string,input:Uint8Array):boolean{
 if(input.byteLength===0||input.byteLength>MAX_HANDOFF_BYTES||!name||name.length>255)return false;
 if(/[\/\\\u0000-\u001f\u007f]/u.test(name))return false;
 const copy=Uint8Array.from(input);
 const value:StoredOutput={id:nextId++,name,size:copy.length,createdAt:Date.now(),bytes:copy};
 records=[value,...records];
 let sum=0;
 records=records.filter((item,index)=>{
  if(index>=MAX_RESULTS||sum+item.size>MAX_TOTAL_MEMORY)return false;
  sum+=item.size;return true;
 });
 if(pending&&!records.some(x=>x.id===pending?.id))pending=null;
 publish();
 return true;
}
export function removeRecentOutput(id:number):void{
 records=records.filter(x=>x.id!==id);
 if(pending?.id===id)pending=null;
 publish();
}
export function clearRecentOutputs():void{
 records=[];pending=null;compareSlots.left=null;compareSlots.right=null;publish();
}
export function requestHandoff(id:number,target:HandoffTarget):boolean{
 if(!records.some(x=>x.id===id))return false;
 pending={id,target};
 publish();
 return true;
}
export function consumeHandoff(target:HandoffTarget):File|null{
 if(!pending||pending.target!==target)return null;
 const result=records.find(x=>x.id===pending?.id);
 pending=null;
 publish();
 if(!result)return null;
 // Fresh immutable copy: downstream file tools cannot mutate cached output.
 return new File([Uint8Array.from(result.bytes)],result.name,{
  type:({pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",
   webp:"image/webp",csv:"text/csv",json:"application/json",txt:"text/plain",
   md:"text/markdown",zip:"application/zip"} as Record<string,string>)[result.name.split(".").pop()?.toLowerCase()??""]??"application/octet-stream",
 });
}
export function handoffTarget():HandoffTarget|null{return pending?.target??null;}
