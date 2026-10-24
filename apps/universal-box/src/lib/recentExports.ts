/** Session-only metadata for user-initiated exports. Never store file contents or absolute paths. */
export type RecentExport={name:string;extension:string;size:number;at:number};
const HISTORY_LIMIT=8;
let entries:RecentExport[]=[];
const listeners=new Set<()=>void>();
export function registerRecentExport(suggestedName:string,size:number,at=Date.now()):void{
 const name=suggestedName.split(/[\\/]/u).at(-1)?.slice(0,120)??"output";
 const extension=name.split(".").at(-1)?.toUpperCase()??"";
 const row={name,extension,size:Math.max(0,Math.min(Number.isFinite(size)?size:0,20_000_000)),at};
 entries=[row,...entries].slice(0,HISTORY_LIMIT);
 for(const notify of listeners)notify();
}
export function getRecentExports():RecentExport[]{return [...entries];}
export function subscribeRecentExports(listener:()=>void):()=>void{
 listeners.add(listener);
 return ()=>{listeners.delete(listener);};
}
export function clearRecentExports():void{entries=[];for(const notify of listeners)notify();}
