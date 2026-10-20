/** Zero-upload convenience operations for Daily Desk Quick Tools. */
export type CleanupOptions = {
  collapseSpaces:boolean;
  removeEmptyLines:boolean;
  deduplicateLines:boolean;
  joinWrappedLines:boolean;
};
export const DEFAULT_CLEANUP:CleanupOptions={
  collapseSpaces:true,removeEmptyLines:false,deduplicateLines:false,joinWrappedLines:false,
};
export function cleanCopiedText(source:string,options:CleanupOptions=DEFAULT_CLEANUP):string {
  if(source.length>200_000)throw new Error("Text is limited to 200,000 characters.");
  let text=source.replace(/\r\n?/gu,"\n").replace(/[\u200B\u2060\uFEFF]/gu,"")
    .replace(/[\u00A0\u202F]/gu," ");
  let lines=text.split("\n").map(line=>{
    const t=line.trim();
    return options.collapseSpaces?t.replace(/[\t ]{2,}/gu," "):t;
  });
  if(options.removeEmptyLines)lines=lines.filter(Boolean);
  if(options.deduplicateLines){
    const seen=new Set<string>();
    lines=lines.filter(line=>!line||(!seen.has(line)&&!!seen.add(line)));
  }
  if(options.joinWrappedLines){
    // Explicit opt-in, since merging paragraphs could otherwise discard formatting.
    lines=lines.join(" ").replace(/\s{2,}/gu," ").trim().split("\n");
  }
  return lines.join("\n");
}
const TRACKING_KEYS=new Set([
  "fbclid","gclid","dclid","gbraid","wbraid","msclkid",
  "igshid","mc_cid","mc_eid","yclid","twclid","ttclid",
  "_hsenc","_hsmi","mkt_tok","vero_id","oly_anon_id","oly_enc_id",
]);
export function cleanTrackingUrl(value:string):{url:string;removed:string[]} {
  const raw=value.trim();
  if(!raw||raw.length>5000)throw new Error("Enter a valid URL (max 5000 characters).");
  let parsed:URL;
  try {parsed=new URL(raw);}catch{throw new Error("Enter a full http(s) URL.");}
  if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password)
    throw new Error("Only http(s) URLs without embedded credentials are allowed.");
  const removed:string[]=[];
  for(const key of Array.from(parsed.searchParams.keys())){
    const k=key.toLowerCase();
    if(k.startsWith("utm_")||TRACKING_KEYS.has(k)){
      removed.push(key);
      parsed.searchParams.delete(key);
    }
  }
  return {url:parsed.toString(),removed};
}
export function cleanUrlList(raw:string):{text:string;removed:number;count:number} {
  if(raw.length>50000)throw new Error("Input is too long.");
  const lines=raw.trim().split(/\r?\n/u).map(line=>line.trim()).filter(Boolean);
  if(!lines.length||lines.length>30)throw new Error("Enter 1–30 URLs, one per line.");
  const cleaned=lines.map(cleanTrackingUrl);
  return {text:cleaned.map(item=>item.url).join("\n"),removed:cleaned.reduce((s,item)=>s+item.removed.length,0),count:cleaned.length};
}
function getDate(input:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(input))throw new Error("Use dates in YYYY-MM-DD format.");
  const [y,m,d]=input.split("-").map(Number);
  if(y<1900||y>2100||m<1||m>12||d<1||d>31)throw new Error("Date is outside the supported range.");
  const date=new Date(0);
  date.setUTCFullYear(y,m-1,d);
  date.setUTCHours(0,0,0,0);
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)
    throw new Error("Invalid calendar date.");
  return date;
}
const DAY=86_400_000;
export function dateDifference(start:string,end:string,includeEnd=false):number {
  const a=getDate(start).getTime(),b=getDate(end).getTime();
  const delta=(b-a)/DAY;
  return delta+(includeEnd?(delta>=0?1:-1):0);
}
export function shiftDate(start:string,offset:number):string {
  if(!Number.isInteger(offset)||Math.abs(offset)>36525)throw new Error("Use an integer offset of up to 36,525 days.");
  const date=getDate(start);
  date.setUTCDate(date.getUTCDate()+offset);
  const y=date.getUTCFullYear();
  if(y<1900||y>2100)throw new Error("Result is outside 1900–2100.");
  return date.toISOString().slice(0,10);
}
export type GradeRow={label:string;weight:number;grade:number|null};
export function parseGradeRows(source:string):GradeRow[]{
  if(source.length>5000)throw new Error("Grade table is too long.");
  const lines=source.trim().split(/\r?\n/u).map(v=>v.trim()).filter(Boolean);
  if(lines.length<1||lines.length>20)throw new Error("Enter 1–20 rows.");
  return lines.map((line,index)=>{
    const parts=line.split(",");
    if(parts.length!==3)throw new Error(`Row ${index+1}: use Category,Weight,Grade or ?.`);
    const label=parts[0].trim(),weight=Number(parts[1].trim()),raw=parts[2].trim();
    const grade=raw==="?"?null:Number(raw);
    if(!label||label.length>60||!parts[1].trim()||(!raw)||!Number.isFinite(weight)||weight<0||weight>100
      ||(grade!==null&&(!Number.isFinite(grade)||grade<0||grade>100)))
      throw new Error(`Row ${index+1}: weight and grade must be 0–100; use ? for future work.`);
    return {label,weight,grade};
  });
}
export function calculateWeightedGrade(rows:GradeRow[],target:number){
  if(!Number.isFinite(target)||target<0||target>100)throw new Error("Target must be 0–100.");
  if(!rows.length||rows.length>20)throw new Error("Enter 1–20 rows.");
  if(rows.some(row=>!Number.isFinite(row.weight)||row.weight<0||row.weight>100||
    (row.grade!==null&&(!Number.isFinite(row.grade)||row.grade<0||row.grade>100))))
    throw new Error("All weights and grades must be between 0 and 100.");
  const totalWeight=rows.reduce((s,row)=>s+row.weight,0);
  if(Math.abs(totalWeight-100)>1e-6)throw new Error(`Weights must total 100% (currently ${totalWeight.toFixed(2)}%).`);
  const earned=rows.reduce((s,row)=>s+(row.grade===null?0:row.grade*row.weight/100),0);
  const completedWeight=rows.reduce((s,row)=>s+(row.grade===null?0:row.weight),0);
  const remainingWeight=100-completedWeight;
  const currentAverage=completedWeight>0?earned*100/completedWeight:null;
  const required=remainingWeight>1e-8?(target-earned)*100/remainingWeight:null;
  return {earned,completedWeight,remainingWeight,currentAverage,required,
    projectedPerfect:earned+remainingWeight,finalGrade:remainingWeight<=1e-8?earned:null};
}
