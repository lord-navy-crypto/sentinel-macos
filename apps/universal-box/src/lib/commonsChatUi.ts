/** A UI-only preflight; native Rust repeats validation before opening a socket. */
export function parseCommonsChatInvite(text:string):{address:string;port:number;key:string}{
 const value=text.trim();
 if(value.length>180||/[\u0000-\u001f\u007f]/u.test(value))throw Error("Invalid LAN group invitation.");
 const match=/^uboxchat:\/\/([0-9.]+):([0-9]{1,5})\/([A-Za-z0-9_-]{43})$/u.exec(value);
 if(!match)throw Error("Use a complete uboxchat:// invitation.");
 const parts=match[1].split(".");
 if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/u.test(p)||(p.length>1&&p[0]==="0")))
  throw Error("Invalid LAN IPv4 endpoint.");
 const [a,b,c,d]=parts.map(Number),port=Number(match[2]);
 if([a,b,c,d].some(x=>x>255)||port<1||port>65535||
  !(a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168))
  throw Error("This invitation is not for an allowed local network.");
 return {address:match[1],port,key:match[3]};
}
export function canJoinCommonsChat(text:string):boolean{
 try{parseCommonsChatInvite(text);return true;}catch{return false;}
}
export type LanChatLine={seq:number;nickname:string;text:string;timestampMs:number};
export type LanChatSnapshot={
 room:string;messages:LanChatLine[];participants:string[];hasMore:boolean;
 sessionToken?:string;oldestSeq:number;latestSeq:number;
};
/** The first retained host sequence exposes irretrievable history, never silently pretend
 * a successful connection fetched messages already discarded from the 200-line RAM window.
 */
export function chatHistoryGap(cursor:number,snapshot:LanChatSnapshot):number{
 if(!Number.isSafeInteger(cursor)||cursor<0)throw Error("Invalid LAN message cursor");
 if(snapshot.oldestSeq===0)return 0;
 return Math.max(0,snapshot.oldestSeq-cursor-1);
}
export function nextChatPage(cursor:number,snapshot:LanChatSnapshot):number{
 if(!Number.isSafeInteger(cursor)||cursor<0)throw Error("Invalid LAN message cursor");
 let last=cursor;
 for(const line of snapshot.messages){
  if(!Number.isSafeInteger(line.seq)||line.seq<=last)throw Error("Out-of-order chat page");
  last=line.seq;
 }
 if(snapshot.hasMore&&last===cursor)throw Error("Host returned an empty page with more messages");
 return last;
}
export function mergeLanChatLines(old:readonly LanChatLine[],incoming:readonly LanChatLine[]):LanChatLine[]{
 const bySeq=new Map(old.map(item=>[item.seq,item]));
 for(const line of incoming)if(Number.isSafeInteger(line.seq)&&line.seq>0)bySeq.set(line.seq,line);
 return [...bySeq.values()].sort((a,b)=>a.seq-b.seq).slice(-200);
}
