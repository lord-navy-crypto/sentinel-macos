import JSZip from "jszip";

/** Offline team handoff, not a network chat, account system, or sync protocol. */
export const COMMONS_SCHEMA = "universal-commons/v1";
export const MAX_FILE_BYTES = 8_000_000;
export const MAX_TOTAL_BYTES = 24_000_000;
const MAX_PACKET_BYTES = 30_000_000;
const MAX_MESSAGES = 500;
const MAX_TASKS = 200;
const MAX_FILES = 30;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,70}$/;

export type CommonsMessage = {id:string; author:string; text:string; createdAt:string};
export type CommonsTask = {id:string; title:string; assignee:string; done:boolean; updatedAt:string};
export type CommonsFile = {id:string; name:string; size:number; sha256:string; addedBy:string; createdAt:string};
export type CommonsRoom = {
  schema:typeof COMMONS_SCHEMA; id:string; name:string; members:string[];
  messages:CommonsMessage[]; tasks:CommonsTask[]; files:CommonsFile[];
};
export type CommonsAttachment = {id:string; bytes:Uint8Array};
export type CommonsPacket = {room:CommonsRoom; attachments:CommonsAttachment[]};

function fail(message:string):never {throw new Error(message);}
function plain(v:unknown):v is Record<string,unknown>{
 return v !== null && typeof v === "object" && !Array.isArray(v);
}
function goodName(text:string,max:number):string{
 const s=text.trim();
 if(s.length===0||s.length>max||/[\u0000-\u001f\u007f]/.test(s)) fail("Please use a shorter printable name.");
 return s;
}
export function safeAttachmentName(text:string):string{
 const name=goodName(text,140).replace(/[\\/<>:"|?*\u0000-\u001f]/g,"_").replace(/^\.+/,"_");
 return name || "file";
}
export function commonsId():string{
 return "c_"+crypto.randomUUID().replace(/-/g,"");
}
export function createCommonsRoom(name:string,owner:string):CommonsRoom{
 return {schema:COMMONS_SCHEMA,id:commonsId(),name:goodName(name,100),
  members:[goodName(owner,60)],messages:[],tasks:[],files:[]};
}
export function commonsMessage(room:CommonsRoom,author:string,text:string):CommonsRoom{
 if(room.messages.length>=MAX_MESSAGES)fail("Message limit reached; export an archive.");
 const message:CommonsMessage={id:commonsId(),author:goodName(author,60),
  text:goodName(text,4000),createdAt:new Date().toISOString()};
 return {...room,messages:[...room.messages,message]};
}
export function commonsTask(room:CommonsRoom,title:string,assignee:string):CommonsRoom{
 if(room.tasks.length>=MAX_TASKS)fail("Task limit reached.");
 const task:CommonsTask={id:commonsId(),title:goodName(title,200),assignee:goodName(assignee,60),
  done:false,updatedAt:new Date().toISOString()};
 return {...room,tasks:[...room.tasks,task]};
}
export function commonsToggleTask(room:CommonsRoom,id:string):CommonsRoom{
 return {...room,tasks:room.tasks.map(t=>t.id===id?{...t,done:!t.done,updatedAt:new Date().toISOString()}:t)};
}
async function sha256(bytes:Uint8Array):Promise<string>{
 const raw=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,"0")).join("");
}
export async function commonsFile(room:CommonsRoom,name:string,addedBy:string,bytes:Uint8Array):
 Promise<{room:CommonsRoom;attachment:CommonsAttachment}>{
 if(room.files.length>=MAX_FILES)fail("At most 30 attachments per team packet.");
 if(bytes.byteLength===0||bytes.byteLength>MAX_FILE_BYTES)fail("Each attachment must be 1 byte–8 MB.");
 if(room.files.reduce((n,f)=>n+f.size,0)+bytes.byteLength>MAX_TOTAL_BYTES)fail("Team attachments exceed the 24 MB limit.");
 const id=commonsId();
 const file:CommonsFile={id,name:safeAttachmentName(name),size:bytes.byteLength,
  sha256:await sha256(bytes),addedBy:goodName(addedBy,60),createdAt:new Date().toISOString()};
 return {room:{...room,files:[...room.files,file]},attachment:{id,bytes}};
}
function iso(value:unknown):value is string{
 return typeof value==="string"&&value.length<=45&&Number.isFinite(Date.parse(value));
}
function validateRoom(value:unknown):CommonsRoom{
 if(!plain(value)||value.schema!==COMMONS_SCHEMA||!ID_PATTERN.test(String(value.id)))fail("Unsupported or invalid Commons workspace.");
 if(typeof value.name!=="string")fail("Room name missing.");
 goodName(value.name,100);
 if(!Array.isArray(value.members)||value.members.length<1||value.members.length>50
   ||value.members.some(m=>typeof m!=="string"||m.trim().length<1||m.length>60))fail("Invalid member list.");
 if(!Array.isArray(value.messages)||value.messages.length>MAX_MESSAGES
   ||!Array.isArray(value.tasks)||value.tasks.length>MAX_TASKS
   ||!Array.isArray(value.files)||value.files.length>MAX_FILES)fail("Team packet count exceeds limits.");
 const ids=new Set<string>();
 for(const msg of value.messages){
  if(!plain(msg)||!ID_PATTERN.test(String(msg.id))||typeof msg.author!=="string"||typeof msg.text!=="string"||!iso(msg.createdAt)
   ||msg.author.length>60||msg.text.length>4000||!msg.text.trim())fail("Invalid message in team packet.");
  if(ids.has(msg.id as string))fail("Duplicate message ID.");ids.add(msg.id as string);
 }
 ids.clear();
 for(const task of value.tasks){
  if(!plain(task)||!ID_PATTERN.test(String(task.id))||typeof task.title!=="string"
   ||typeof task.assignee!=="string"||typeof task.done!=="boolean"||!iso(task.updatedAt)
   ||task.title.length>200||task.assignee.length>60)fail("Invalid task in team packet.");
  if(ids.has(task.id as string))fail("Duplicate task ID.");ids.add(task.id as string);
 }
 ids.clear();
 let total=0;
 for(const file of value.files){
  if(!plain(file)||!ID_PATTERN.test(String(file.id))||typeof file.name!=="string"
   ||file.name!==safeAttachmentName(file.name)||typeof file.sha256!=="string"
   ||!/^[a-f0-9]{64}$/.test(file.sha256)||typeof file.size!=="number"
   ||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_FILE_BYTES
   ||typeof file.addedBy!=="string"||file.addedBy.length>60||!iso(file.createdAt))fail("Invalid file metadata.");
  if(ids.has(file.id as string))fail("Duplicate file ID.");
  ids.add(file.id as string);total+=file.size;
 }
 if(total>MAX_TOTAL_BYTES)fail("Packet attachments exceed the size limit.");
 return value as CommonsRoom;
}
function attachmentMap(room:CommonsRoom,files:CommonsAttachment[]):Map<string,Uint8Array>{
 const found=new Map<string,Uint8Array>();
 for(const item of files){
  if(found.has(item.id))fail("Duplicate attached binary.");
  found.set(item.id,item.bytes);
 }
 if(found.size!==room.files.length||room.files.some(f=>!found.has(f.id)))fail("Every listed attachment must have its bytes.");
 return found;
}
export async function exportCommonsPacket(packet:CommonsPacket,stable=false):Promise<Uint8Array>{
 const room=validateRoom(packet.room), attachments=attachmentMap(room,packet.attachments);
 const zip=new JSZip();
 // Deterministic timestamps are essential for resuming across separately started
 // v2 shares. Otherwise JSZip uses "now" and changes the archive SHA-256.
 const options=stable?{date:new Date(1980,0,1)}:undefined;
 zip.file("commons.json",JSON.stringify(room,null,2),options);
 for(const item of room.files){
  const bytes=attachments.get(item.id)!;
  if(bytes.length!==item.size||await sha256(bytes)!==item.sha256)fail("Attachment integrity mismatch: "+item.name);
  zip.file("files/"+item.id+".bin",bytes,options);
 }
 const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(bytes.byteLength>MAX_PACKET_BYTES)fail("Export exceeds 30 MB.");
 return bytes;
}
/** Check the declared uncompressed length *before* inflating untrusted archives. */
function archivedLength(entry:JSZip.JSZipObject):number{
 const z=entry as JSZip.JSZipObject&{_data?:{uncompressedSize?:number}};
 const size=z._data?.uncompressedSize;
 if(typeof size!=="number"||!Number.isSafeInteger(size)||size<0)fail("Archive lacks safe size metadata.");
 return size;
}
export async function importCommonsPacket(bytes:Uint8Array):Promise<CommonsPacket>{
 if(bytes.length===0||bytes.length>MAX_PACKET_BYTES)fail("ZIP must be at most 30 MB.");
 const zip=await JSZip.loadAsync(bytes,{createFolders:false,checkCRC32:false});
 const keys=Object.keys(zip.files).filter(k=>!zip.files[k].dir);
 if(keys.length>MAX_FILES+1||!zip.file("commons.json"))fail("Not a valid Commons team package.");
 const manifest=zip.file("commons.json")!;
 if(archivedLength(manifest)>400_000)fail("Team metadata is too large.");
 const room=validateRoom(JSON.parse(await manifest.async("string")) as unknown);
 if(keys.length!==room.files.length+1)fail("Unexpected ZIP entries; packet rejected.");
 let total=0;
 const attachments:CommonsAttachment[]=[];
 for(const file of room.files){
  const path="files/"+file.id+".bin";
  const entry=zip.file(path);
  if(!entry||archivedLength(entry)!==file.size)fail("Missing or invalid attachment: "+file.name);
  total+=file.size;if(total>MAX_TOTAL_BYTES)fail("Attachment limit exceeded.");
  const data=await entry.async("uint8array");
  if(data.byteLength!==file.size||await sha256(data)!==file.sha256)fail("Attachment hash mismatch: "+file.name);
  attachments.push({id:file.id,bytes:data});
 }
 if(keys.some(path=>path!=="commons.json"&&!room.files.some(f=>path==="files/"+f.id+".bin")))fail("Unexpected ZIP entry.");
 return {room,attachments};
}
/** Combine two exported copies of the same room, rejecting conflicts rather than losing edits. */
export function mergeCommonsPackets(local:CommonsPacket,incoming:CommonsPacket):CommonsPacket{
 const a=validateRoom(local.room),b=validateRoom(incoming.room);
 if(a.id!==b.id)fail("Different teams. Import as a separate room instead.");
 const mergeEntries=<T extends {id:string}>(left:T[],right:T[],kind:string):T[]=>{
  const map=new Map(left.map(item=>[item.id,item] as const));
  for(const item of right){
   const old=map.get(item.id);
   if(old&&JSON.stringify(old)!==JSON.stringify(item)){
    // Task completion updates are common; latest timestamp wins, except ties.
    if(kind==="task"){
     const current=old as T&{updatedAt:string},next=item as T&{updatedAt:string};
     if(current.updatedAt!==next.updatedAt){
      if(next.updatedAt>current.updatedAt)map.set(item.id,item);
      continue;
     }
    }
    fail("Conflicting "+kind+" ID; neither copy was overwritten.");
   }
   if(!old)map.set(item.id,item);
  }
  return [...map.values()];
 };
 const room:CommonsRoom={
  ...a,members:[...new Set([...a.members,...b.members])].slice(0,50),
  messages:mergeEntries(a.messages,b.messages,"message").sort((x,y)=>x.createdAt.localeCompare(y.createdAt)),
  tasks:mergeEntries(a.tasks,b.tasks,"task"),
  files:mergeEntries(a.files,b.files,"file")
 };
 validateRoom(room);
 const joined=new Map([...local.attachments,...incoming.attachments].map(v=>[v.id,v.bytes] as const));
 const attachments=room.files.map(f=>({id:f.id,bytes:joined.get(f.id)??fail("Missing merged attachment.")}));
 return {room,attachments};
}
