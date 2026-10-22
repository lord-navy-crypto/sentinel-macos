/** Read user-selected vCard 3.0/4.0 files offline; no OS contacts or URL fetching.
 * RFC 6350: https://www.rfc-editor.org/rfc/rfc6350.html
 * Intentionally limited to common text properties; binary/photo/key entries are ignored.
 */
export const VCF_MAX_BYTES=500_000;
export const VCF_MAX_CONTACTS=300;
export type VcfContact={
 name:string;phones:string[];emails:string[];organization:string;website:string;title:string;
};
export type VcfReport={contacts:VcfContact[];versions:string[];ignoredProperties:number};

function unescapeVcard(value:string):string{
 // Unfold physical lines BEFORE interpreting vCard text escapes.
 return value.replace(/\\([nN,;\\])/gu,(_match,character:string)=>{
  if(character==="n"||character==="N")return "\n";
  return character;
 }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,"").trim();
}
function bounded(value:string,field:string,max=300):string{
 if(value.length>max)throw Error("VCF "+field+" exceeds "+max+" characters.");
 return value;
}
function addUnique(list:string[],value:string,field:string):void{
 if(!value)return;
 if(value.length>500)throw Error("VCF "+field+" exceeds 500 characters.");
 if(!list.includes(value)){
  if(list.length>=20)throw Error("One contact has more than 20 "+field+" fields.");
  list.push(value);
 }
}
function logicalLines(source:string):string[]{
 const physical=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split("\n");
 const result:string[]=[];
 for(const line of physical){
  if(line.startsWith(" ")||line.startsWith("\t")){
   if(!result.length)throw Error("VCF continuation line has no parent.");
   result[result.length-1]+=line.slice(1);
  }else if(line!==""||result.length){
   result.push(line);
  }
  if(result.length>15_000)throw Error("VCF contains too many lines.");
 }
 while(result.length&&result[result.length-1]==="")result.pop();
 return result;
}
export function parseLocalVcf(source:string,byteLength:number):VcfReport{
 if(!Number.isSafeInteger(byteLength)||byteLength<24||byteLength>VCF_MAX_BYTES||
    typeof source!=="string"||!source||source.length>VCF_MAX_BYTES||
    /\u0000/u.test(source))
  throw Error("Select a valid UTF-8 .vcf file between 24 bytes and 500 KB.");
 const lines=logicalLines(source);
 const contacts:VcfContact[]=[],versions=new Set<string>();
 let ignoredProperties=0;
 let current:VcfContact|null=null;
 let version="",inCard=false,headerSeen=false;
 for(const raw of lines){
  if(raw==="BEGIN:VCARD"){
   if(inCard)throw Error("Nested BEGIN:VCARD is not supported.");
   if(contacts.length>=VCF_MAX_CONTACTS)throw Error("VCF exceeds the 300-contact limit.");
   inCard=true;headerSeen=false;version="";
   current={name:"",phones:[],emails:[],organization:"",website:"",title:""};
   continue;
  }
  if(raw==="END:VCARD"){
   if(!inCard||!current||!version||!current.name)throw Error("VCF contact is missing VERSION or FN.");
   contacts.push(current);versions.add(version);
   inCard=false;current=null;version="";
   continue;
  }
  if(!inCard||!current)throw Error("VCF data appears outside BEGIN/END boundaries.");
  if(raw.length>12_000)throw Error("VCF field is too large.");
  const colon=raw.indexOf(":");
  if(colon<1)throw Error("VCF contains a malformed property.");
  const header=raw.slice(0,colon),value=raw.slice(colon+1);
  const props=header.split(";");
  const key=(props[0].split(".").at(-1)??"").toUpperCase();
  if(!/^[A-Z0-9-]+$/u.test(key))throw Error("VCF property name is invalid.");
  const parameters=props.slice(1).join(";").toUpperCase();
  if(/(?:^|;)ENCODING=|(?:^|;)CHARSET=(?!UTF-8(?:;|$))/u.test(parameters))
   throw Error("VCF legacy encodings are unsupported; export UTF-8 vCard 3.0 or 4.0.");
  if(key==="VERSION"){
   if(headerSeen||version||!["3.0","4.0"].includes(value.trim()))
    throw Error("Only vCard 3.0 and 4.0 with one VERSION field are supported.");
   version=value.trim();headerSeen=true;continue;
  }
  if(!headerSeen)throw Error("VERSION must be the first property after BEGIN:VCARD.");
  const clean=()=>unescapeVcard(value);
  switch(key){
   case "FN": if(current.name)throw Error("Multiple FN names in a single contact are unsupported.");
     current.name=bounded(clean(),"FN");break;
   case "N": // Structured name is not needed if a formatted name exists.
     break;
   case "TEL": {
     const phone=clean();
     addUnique(current.phones,/^tel:/iu.test(phone)?phone.slice(4):phone,"telephone");
     break;
   }
   case "EMAIL":addUnique(current.emails,clean(),"email");break;
   case "ORG":
     current.organization=bounded(unescapeVcard(value.replace(/(?<!\\);/gu," / ")),"ORG",400);break;
   case "URL": {
     const site=clean();
     if(site.length>2048)throw Error("VCF website exceeds 2048 characters.");
     try{
      const parsed=new URL(site);
      if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)
       throw Error("Unsafe URL.");
      if(!current.website)current.website=parsed.href;
     }catch{ignoredProperties++;}
     break;
   }
   case "TITLE":current.title=bounded(clean(),"TITLE");break;
   default:ignoredProperties++;
  }
 }
 if(inCard)throw Error("VCF is incomplete (missing END:VCARD).");
 if(!contacts.length)throw Error("No vCard 3.0/4.0 contacts found.");
 return {contacts,versions:[...versions].sort(),ignoredProperties};
}
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function vcfToCsv(report:VcfReport):string{
 if(report.contacts.length<1||report.contacts.length>VCF_MAX_CONTACTS)
  throw Error("Only 1–300 contacts can be exported.");
 return "\uFEFFName,Phone,Email,Organization,Website,Title\r\n"+
  report.contacts.map(contact=>[
   contact.name,contact.phones.join(" | "),contact.emails.join(" | "),
   contact.organization,contact.website,contact.title,
  ].map(csvCell).join(",")).join("\r\n")+"\r\n";
}
