/** User-controlled static QR payloads. No service, redirects or analytics. */
export type QrPayloadKind="text"|"wifi"|"contact";
export type WifiConfig={ssid:string;password:string;security:"WPA"|"WEP"|"nopass";hidden:boolean};
export type ContactConfig={name:string;phone:string;email:string;organization:string;url:string};
function limit(value:string,max:number,label:string):string{
 const trimmed=value.trim();
 if(!trimmed||trimmed.length>max)throw new Error(label+" must be 1–"+max+" characters.");
 if(/[\u0000-\u001F\u007F]/u.test(trimmed))throw new Error(label+" contains unsupported control characters.");
 return trimmed;
}
function wifiEscape(value:string):string{return value.replace(/[\\;,:"]/gu,"\\$&");}
export function wifiQrPayload(wifi:WifiConfig):string{
 const ssid=limit(wifi.ssid,64,"Network name");
 if(!["WPA","WEP","nopass"].includes(wifi.security))throw new Error("Invalid network security option.");
 const password=wifi.security==="nopass"?"":wifiEscape(limit(wifi.password,128,"Wi-Fi password"));
 return `WIFI:T:${wifi.security};S:${wifiEscape(ssid)};P:${password};H:${wifi.hidden?"true":"false"};;`;
}
function vcardEscape(value:string,max:number){
 if(value.length>max)throw new Error("Contact field is too long.");
 // Strip carriage returns and newlines before escaping separators.
 return value.trim().replace(/[\r\n]+/gu," ").replace(/\\/gu,"\\\\")
  .replace(/;/gu,"\\;").replace(/,/gu,"\\,");
}
export function contactQrPayload(contact:ContactConfig):string{
 const name=limit(contact.name,100,"Contact name");
 const fields=["BEGIN:VCARD","VERSION:3.0",`FN:${vcardEscape(name,100)}`];
 if(contact.phone.trim()){
   const phone=contact.phone.trim();
   if(!/^\+?[0-9() .-]{4,30}$/u.test(phone))throw new Error("Phone number has unsupported characters.");
   fields.push(`TEL:${phone}`);
 }
 if(contact.email.trim()){
   const email=contact.email.trim();
   if(email.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))throw new Error("Invalid email address.");
   fields.push(`EMAIL:${email}`);
 }
 if(contact.organization.trim())fields.push(`ORG:${vcardEscape(contact.organization,100)}`);
 if(contact.url.trim()){
   let url:URL;
   try{url=new URL(contact.url.trim());}catch{throw new Error("Contact website must be a full HTTP(S) URL.");}
   if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw new Error("Only HTTP(S) contact links are supported.");
   fields.push(`URL:${url.toString()}`);
 }
 fields.push("END:VCARD");
 return fields.join("\r\n");
}
export function staticTextQrPayload(text:string):string{return limit(text,1800,"QR content");}
export function bulkQrRows(input:string):{name:string;text:string}[]{
 if(input.length>35_000)throw new Error("Batch list must be 35,000 characters or fewer.");
 const lines=input.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);
 if(!lines.length||lines.length>40)throw new Error("Enter 1–40 lines, formatted Name | Data.");
 const names=new Set<string>();
 return lines.map((line,index)=>{
   const separator=line.indexOf("|");
   if(separator<0)throw new Error(`Line ${index+1}: add a | between file label and QR data.`);
   const name=limit(line.slice(0,separator),60,"QR filename");
   const text=staticTextQrPayload(line.slice(separator+1));
   const base=name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]/gu,"-").replace(/^\.+/u,"").slice(0,50)||"qr";
   let candidate=base,sequence=2;
   while(names.has(candidate)){candidate=base+"-"+sequence;sequence++;}
   names.add(candidate);
   return {name:candidate,text};
 });
}
export type UtcEvent={summary:string;description:string;location:string;start:string;end:string;uid:string};
function utcIcsDate(value:string):string{
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
 if(!m)throw new Error("Use UTC dates and times in YYYY-MM-DDTHH:mm format.");
 const [year,month,day,hour,minute]=m.slice(1).map(Number);
 if(year<1900||year>2100||month<1||month>12||day<1||day>31||hour>23||minute>59)
   throw new Error("Invalid UTC event time.");
 const d=new Date(Date.UTC(year,month-1,day,hour,minute));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)
   throw new Error("Invalid event calendar date.");
 return d.toISOString().replace(/[-:]/gu,"").replace(/\.\d{3}/u,""); // YYYYMMDDTHHMMSSZ
}
function icsEscape(value:string,max:number):string{
 if(value.length>max)throw new Error("Event text is too long.");
 return value.replace(/\\/gu,"\\\\").replace(/\r\n?|\n/gu,"\\n")
   .replace(/;/gu,"\\;").replace(/,/gu,"\\,");
}
function foldLine(line:string):string{
 // Fold RFC 5545 content at most 75 UTF-8 octets per physical line.
 let out="",current="",bytes=0;
 for(const ch of line){
   const size=new TextEncoder().encode(ch).length;
   if(bytes+size>75){out+=current+"\r\n ";current=ch;bytes=1+size;}
   else{current+=ch;bytes+=size;}
 }
 return out+current;
}
export function makeIcsEvent(input:UtcEvent):string{
 const summary=icsEscape(limit(input.summary,120,"Event title"),120);
 const start=utcIcsDate(input.start),end=utcIcsDate(input.end);
 if(end<=start)throw new Error("End time must be later than start time.");
 if(!/^[a-zA-Z0-9-]{6,100}@daily-desk\.local$/u.test(input.uid))
   throw new Error("Invalid local event identifier.");
 const now=new Date().toISOString().slice(0,19).replace(/[-:]/gu,"")+"Z"; // actual UTC creation stamp
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Daily Desk//Universal Box//EN",
  "CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:${input.uid}`,
  `DTSTAMP:${now}`,`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${summary}`];
 if(input.description.trim())lines.push("DESCRIPTION:"+icsEscape(input.description,2000));
 if(input.location.trim())lines.push("LOCATION:"+icsEscape(input.location,300));
 lines.push("END:VEVENT","END:VCALENDAR");
 return lines.map(foldLine).join("\r\n")+"\r\n";
}
export function generateUuidList(count:number):string[]{
 if(!Number.isInteger(count)||count<1||count>100)throw new Error("Generate 1–100 UUIDs.");
 if(!globalThis.crypto?.randomUUID)throw new Error("Cryptographic UUID generation unavailable.");
 return Array.from({length:count},()=>globalThis.crypto.randomUUID());
}
