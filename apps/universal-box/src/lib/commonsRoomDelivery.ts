import type {PublicRoomFrame} from "./commonsPublicRoom";

/** Application ACK = peer's running app accepted a message; NOT read or durable delivery. */
export type RoomChat=Extract<PublicRoomFrame,{kind:"chat"}>;
export type RoomDelivery={
 frame:RoomChat;
 origin:string|null; // null = host-originated; otherwise a member slot ID
 targets:readonly string[];
 acked:readonly string[];
};
export function newRoomDelivery(frame:RoomChat,origin:string|null,targets:readonly string[]):RoomDelivery{
 if(new Set(targets).size!==targets.length||targets.includes(origin??"")||targets.length>3)
  throw Error("Invalid recipient snapshot.");
 return {frame,origin,targets:[...targets],acked:[]};
}
export function recordRoomAck(row:RoomDelivery,senderId:string):RoomDelivery{
 if(!row.targets.includes(senderId)||row.acked.includes(senderId))return row;
 return {...row,acked:[...row.acked,senderId]};
}
export function remainingRoomRecipients(row:RoomDelivery):string[]{
 return row.targets.filter(x=>!row.acked.includes(x));
}
export function roomDeliveryProgress(row:RoomDelivery){
 return {acked:row.acked.length,total:row.targets.length,completed:row.targets.length>0&&row.acked.length===row.targets.length};
}
export type RoomDeliveryView={id:string;text:string;acked:number;total:number;hostAccepted:boolean};
export function upsertRoomReceipt(rows:readonly RoomDeliveryView[],next:RoomDeliveryView):RoomDeliveryView[]{
 const previous=rows.find(row=>row.id===next.id);
 if(previous?.hostAccepted&&(!next.hostAccepted||next.acked<previous.acked||next.total!==previous.total))
  return [...rows];
 return [...rows.filter(row=>row.id!==next.id),next].slice(-50);
}
