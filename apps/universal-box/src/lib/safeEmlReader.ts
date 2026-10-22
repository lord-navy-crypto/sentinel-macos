/** RFC822/MIME subset: local, bounded email archive reading. Nothing is executed or fetched. */
export const EML_MAX_BYTES=2_000_000;
export const EML_MAX_PARTS=40;
export type EmlAttachment={name:string;contentType:string;encodedBytes:number};
export type EmlRecord={
 subject:string;from:string;to:string;date:string;text:string;
 attachmentCount:number;attachments:EmlAttachment[];notice:string;
};
type HeaderBlock={headers:Map<string,string>;body:string};
const error=(message:string):never=>{throw Error(message);};
function splitHeaders(input:string):HeaderBlock{
 const pos=input.indexOf("\n\n");
 if(pos<0||pos>32768)error("Email is missing a bounded RFC822 header block.");
 const source=input.slice(0,pos),body=input.slice(pos+2);
 const lines=source.split("\n");
 if(lines.length>250)error("Email contains too many header lines.");
 const headers=new Map<string,string>();
 let current="";
 for(const line of lines){
  if(line.length>4096)error("Email header line exceeds 4 KB.");
  if(/^[ \t]/u.test(line)){
   if(!current)error("Email header fold has no parent field.");
   headers.set(current,(headers.get(current)||"")+" "+line.trim());
   continue;
  }
  const match=/^([a-z0-9!#$%&'*+.^_`|~-]+):\s*(.*)$/iu.exec(line);
  if(!match)error("Email contains an invalid header line.");
  current=match[1].toLowerCase();
  if(!headers.has(current))headers.set(current,match[2]);
 }
 return {headers,body};
}
function get(headers:Map<string,string>,name:string):string{return headers.get(name.toLowerCase())||"";}
function parameter(header:string,key:string):string{
 const match=new RegExp("(?:^|;)\\s*"+key+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^;\\s]+))","iu").exec(header);
 return (match?.[1]??match?.[2]??match?.[3]??"").trim().slice(0,160);
}
function charsetDecode(bytes:Uint8Array,charset:string):string{
 const supported:Record<string,string>={"utf-8":"utf-8","utf8":"utf-8","us-ascii":"utf-8",
  "iso-8859-1":"windows-1252","windows-1252":"windows-1252","gb18030":"gb18030"};
 const codec=supported[charset.toLowerCase()]||"";
 if(!codec)error("Email uses an unsupported character set: "+charset.slice(0,40));
 return new TextDecoder(codec,{fatal:true}).decode(bytes);
}
function quotedPrintable(body:string,headerMode=false):Uint8Array{
 const cleaned=body.replace(/=\n/gu,"");
 const output:number[]=[];
 for(let i=0;i<cleaned.length;){
  if(cleaned[i]==="="&&/^[0-9a-f]{2}$/iu.test(cleaned.slice(i+1,i+3))){
   output.push(Number.parseInt(cleaned.slice(i+1,i+3),16));i+=3;
  }else if(headerMode&&cleaned[i]==="_"){output.push(32);i++;}
  else{
   const point=cleaned.codePointAt(i)!;
   if(point>127){
    output.push(...new TextEncoder().encode(String.fromCodePoint(point)));
    i+=point>65535?2:1;
   }else{output.push(point);i++;}
  }
  if(output.length>EML_MAX_BYTES)error("Decoded MIME text exceeds the 2 MB limit.");
 }
 return new Uint8Array(output);
}
function base64Decode(encoded:string):Uint8Array{
 const compact=encoded.replace(/[\r\n \t]/gu,"");
 if(compact.length>EML_MAX_BYTES*2||compact.length%4!==0||
    !/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu.test(compact))
  error("Malformed or excessive MIME base64 payload.");
 const binary=atob(compact);
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function decodeHeader(value:string):string{
 const decoded=value.replace(/=\?([^?\s]{1,60})\?([bq])\?([^?]{1,1000})\?=/giu,
  (_whole,charset:string,method:string,payload:string)=>{
   const bytes=method.toLowerCase()==="b"?base64Decode(payload):quotedPrintable(payload,true);
   return charsetDecode(bytes,charset);
  });
 return decoded.replace(/[\u0000-\u001f\u007f]/gu," ").replace(/\s+/gu," ").trim().slice(0,500);
}
function decodedPart(body:string,headers:Map<string,string>):Uint8Array{
 const method=get(headers,"content-transfer-encoding").toLowerCase().trim();
 if(method==="base64")return base64Decode(body);
 if(method==="quoted-printable")return quotedPrintable(body);
 if(method===""||method==="7bit"||method==="8bit"||method==="binary")return new TextEncoder().encode(body);
 error("Unsupported MIME transfer encoding: "+method.slice(0,50));
}
export function inspectLocalEml(bytes:Uint8Array):EmlRecord{
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<25||bytes.byteLength>EML_MAX_BYTES)
  error("Select an EML file between 25 bytes and 2 MB.");
 const normalized=new TextDecoder("utf-8",{fatal:false}).decode(bytes).replace(/\r\n?/gu,"\n");
 const root=splitHeaders(normalized);
 if(!get(root.headers,"from")&&!get(root.headers,"subject"))
  error("EML is missing both From and Subject headers.");
 const texts:string[]=[],attachments:EmlAttachment[]=[];
 let parts=0,characters=0;
 function walk(part:HeaderBlock,depth:number):void{
  if(depth>4)error("Nested MIME content exceeds the safe depth limit.");
  parts++;
  if(parts>EML_MAX_PARTS)error("Email has more than 40 MIME parts.");
  const contentType=get(part.headers,"content-type")||"text/plain; charset=utf-8";
  const type=contentType.split(";")[0].toLowerCase().trim();
  const disposition=get(part.headers,"content-disposition");
  const filename=parameter(disposition,"filename")||parameter(contentType,"name");
  if(type.startsWith("multipart/")){
   const boundary=parameter(contentType,"boundary");
   if(!boundary||boundary.length>100||/[\r\n]/u.test(boundary))
    error("Multipart EML has no safe MIME boundary.");
   const divider="--"+boundary;
   const lines=part.body.split("\n");
   let collecting=false,piece:string[]=[];
   const children:string[]=[];
   for(const line of lines){
    if(line===divider||line===divider+"--"){
     if(collecting&&piece.length)children.push(piece.join("\n"));
     piece=[];collecting=line===divider;
     if(line===divider+"--")break;
    }else if(collecting)piece.push(line);
   }
   if(!children.length)error("Multipart EML has no readable MIME sections.");
   for(const child of children)walk(splitHeaders(child.replace(/^\n+/u,"")),depth+1);
   return;
  }
  if(filename||/\battachment\b/iu.test(disposition)){
   const safeName=decodeHeader(filename||"unnamed-attachment").replace(/[\\/]/gu,"_").slice(0,150);
   attachments.push({name:safeName,contentType:type||"application/octet-stream",
    encodedBytes:new TextEncoder().encode(part.body).byteLength});
   return;
  }
  if(type!=="text/plain")return; // HTML/image and remote links are NEVER rendered.
  const encoded=decodedPart(part.body,part.headers);
  const charset=parameter(contentType,"charset")||"utf-8";
  const decoded=charsetDecode(encoded,charset).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,"");
  characters+=decoded.length;
  if(characters>100000)error("EML plain text exceeds the 100,000-character display limit.");
  if(decoded.trim())texts.push(decoded.trim());
 }
 walk(root,0);
 return {
  subject:decodeHeader(get(root.headers,"subject"))||"(no subject)",
  from:decodeHeader(get(root.headers,"from"))||"(unknown sender)",
  to:decodeHeader(get(root.headers,"to"))||"(not specified)",
  date:decodeHeader(get(root.headers,"date"))||"(not specified)",
  text:texts.join("\n\n---\n\n"),
  attachments,attachmentCount:attachments.length,
  notice:"Only local text/plain parts are shown. HTML/remote images/active content are ignored; attachments are listed but not opened.",
 };
}
export function emlTextSummary(record:EmlRecord):string{
 return ["Sentinel Box · Local EML text-only summary",
  "Subject: "+record.subject,"From: "+record.from,"To: "+record.to,"Date: "+record.date,
  "Attachment count: "+record.attachmentCount,"",
  "Plain text:",record.text||"(no text/plain body)","",
  "Attachments (metadata only):",
  ...record.attachments.map(x=>x.name+" · "+x.contentType+" · "+x.encodedBytes+" encoded bytes"),
  "","Source EML was not modified."].join("\n")+"\n";
}
