import {tableToCsv} from "./tableTools";

/** JSON record arrays to spreadsheet-safe CSV. Reverse CSV→JSON is in CSV Table Desk. */
export function jsonRecordsToCsv(text:string):{csv:string;rows:number;columns:number}{
  if(!text.trim()||text.length>2_000_000)throw new Error("Enter JSON within the 2 MB limit.");
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch{throw new Error("Invalid JSON. Enter an array of flat objects.");}
  if(!Array.isArray(parsed)||parsed.length<1||parsed.length>2000)throw new Error("Expected 1–2,000 records in a JSON array.");
  const names:string[]=[];
  const used=new Set<string>();
  const rows=parsed.map((row:unknown,index:number)=>{
    if(row===null||Array.isArray(row)||typeof row!=="object")throw new Error(`Record ${index+1} is not an object.`);
    const source=row as Record<string,unknown>;
    for(const [key,value] of Object.entries(source)){
      if(key.length===0||key.length>120)throw new Error("Column names must be 1–120 characters.");
      if(value!==null && !["string","number","boolean"].includes(typeof value))
        throw new Error(`Nested objects and arrays are not supported (record ${index+1}).`);
      if(typeof value==="number"&&!Number.isFinite(value))throw new Error("Records must contain finite numbers.");
      if(!used.has(key)){used.add(key);names.push(key);}
    }
    return source;
  });
  if(names.length===0||names.length>100)throw new Error("Use 1–100 columns.");
  const table={headers:names,rows:rows.map(row=>names.map(key=>{
    if(!Object.prototype.hasOwnProperty.call(row,key)||row[key]===null)return "";
    return String(row[key]);
  }))};
  return {csv:tableToCsv(table),rows:rows.length,columns:names.length};
}

/** Date and time supplied are UTC, eliminating ambiguous DST local times. */
export function parseUtcMinute(input:string):Date{
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(input);
  if(!m)throw new Error("Use YYYY-MM-DDTHH:mm in UTC.");
  const [year,month,day,hour,minute]=m.slice(1).map(Number);
  if(year<1900||year>2100||month<1||month>12||day<1||day>31||hour>23||minute>59)
    throw new Error("Invalid UTC date or time (1900–2100).");
  const d=new Date(Date.UTC(year,month-1,day,hour,minute));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day||d.getUTCHours()!==hour)
    throw new Error("Invalid calendar date.");
  return d;
}
export const MEETING_ZONES=[
  {name:"UTC",zone:"UTC"},
  {name:"Seoul",zone:"Asia/Seoul"},
  {name:"Shanghai / Beijing",zone:"Asia/Shanghai"},
  {name:"Tokyo",zone:"Asia/Tokyo"},
  {name:"London",zone:"Europe/London"},
  {name:"New York",zone:"America/New_York"},
  {name:"Los Angeles",zone:"America/Los_Angeles"},
  {name:"Sydney",zone:"Australia/Sydney"},
  {name:"Dubai",zone:"Asia/Dubai"},
  {name:"Berlin",zone:"Europe/Berlin"},
] as const;
export function timeInZone(utcMinute:string,zone:string):string{
  const d=parseUtcMinute(utcMinute);
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(d);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} (${get("weekday")})`;
}

/** CSPRNG draw with modulo-bias rejection, avoids Math.random for secrets. */
function secureIndex(max:number):number{
  if(!Number.isInteger(max)||max<1||max>256)throw new Error("Invalid random range.");
  if(!globalThis.crypto?.getRandomValues)throw new Error("Secure random numbers are unavailable.");
  const limit=256-256%max;
  const bytes=new Uint8Array(1);
  for(;;){
    globalThis.crypto.getRandomValues(bytes);
    if(bytes[0]<limit)return bytes[0]%max;
  }
}
export type PasswordConfig={
  length:number;lowercase:boolean;uppercase:boolean;digits:boolean;symbols:boolean;
};
const CHARSETS={
  lowercase:"abcdefghijkmnopqrstuvwxyz",
  uppercase:"ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits:"23456789",
  symbols:"!@#$%&*?-_",
};
export function generatePassword(options:PasswordConfig):string{
  if(!Number.isInteger(options.length)||options.length<8||options.length>64)
    throw new Error("Password length must be 8–64 characters.");
  const sets=(Object.keys(CHARSETS) as (keyof typeof CHARSETS)[])
    .filter(key=>options[key]).map(key=>CHARSETS[key]);
  if(!sets.length)throw new Error("Choose at least one character category.");
  if(options.length<sets.length)throw new Error("Increase length to include all chosen categories.");
  const result=sets.map(set=>set[secureIndex(set.length)]);
  const combined=sets.join("");
  while(result.length<options.length)result.push(combined[secureIndex(combined.length)]);
  for(let i=result.length-1;i>0;i--){
    const j=secureIndex(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result.join("");
}
export async function sha256File(bytes:ArrayBuffer):Promise<string>{
  if(bytes.byteLength<1||bytes.byteLength>20_000_000)throw new Error("Choose a file from 1 byte to 20 MB.");
  if(!globalThis.crypto?.subtle)throw new Error("Secure SHA-256 is unavailable in this WebView.");
  const hash=await globalThis.crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function normalizeExpectedHash(text:string):string{
  const s=text.trim().replace(/^sha256:/iu,"").trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/u.test(s))throw new Error("Enter 64 hexadecimal SHA-256 characters.");
  return s;
}
