/** Offline CSV workshop: RFC4180-style quoted-field parsing and spreadsheet-safe export.
 * No imports, server calls, hidden network access, or automatic file modifications.
 */
export type CsvReview={
 columns:number;
 inputRows:number;
 blankRows:number;
 duplicateRows:number;
 heading:string[];
};
export type CsvCleanupOptions={trimCells:boolean;removeBlankRows:boolean;removeDuplicateRows:boolean;protectFormulas:boolean};
export const DEFAULT_CSV_CLEANUP:CsvCleanupOptions={
 trimCells:true,removeBlankRows:true,removeDuplicateRows:true,protectFormulas:true,
};
const MAX_INPUT_CHARS=2_000_000;
const MAX_RECORDS=10000;
const MAX_COLUMNS=100;
const MAX_CELL_CHARS=20000;
const MAX_OUTPUT_CHARS=2_500_000;
function assertInput(text:string){
 if(!text.trim())throw Error("CSV is empty.");
 if(text.length>MAX_INPUT_CHARS)throw Error("CSV exceeds 2 million characters; split large datasets before importing.");
 if(text.includes("\u0000"))throw Error("CSV contains null characters and cannot be safely parsed.");
}
export function parseWorkspaceCsv(raw:string):string[][]{
 assertInput(raw);
 const text=raw.charCodeAt(0)===0xfeff?raw.slice(1):raw;
 let field="",row:string[]=[],inQuotes=false,closedQuote=false,atFieldStart=true;
 const result:string[][]=[];
 function finishField(){
  if(field.length>MAX_CELL_CHARS)throw Error("CSV contains a cell larger than 20,000 characters.");
  row.push(field);
  if(row.length>MAX_COLUMNS)throw Error("CSV has more than 100 columns.");
  field="";atFieldStart=true;closedQuote=false;
 }
 function finishRow(){
  finishField();
  result.push(row);
  if(result.length>MAX_RECORDS)throw Error("CSV has more than 10,000 rows.");
  row=[];
 }
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(inQuotes){
   if(c==='"'){
    if(text[i+1]==='"'){field+='"';i++;}
    else{inQuotes=false;closedQuote=true;}
   }else{field+=c;}
  }else if(c==='"'&&atFieldStart){inQuotes=true;atFieldStart=false;}
  else if(c==="," ){finishField();}
  else if(c==="\n"||c==="\r"){
   finishRow();
   if(c==="\r"&&text[i+1]==="\n")i++;
  }else {
   if(closedQuote)throw Error("Unexpected content after closing CSV quote.");
   if(c==='"')throw Error("Misplaced quote in CSV cell.");
   field+=c;atFieldStart=false;
  }
  if(field.length>MAX_CELL_CHARS)throw Error("CSV contains a cell larger than 20,000 characters.");
 }
 if(inQuotes)throw Error("CSV has an unclosed quoted field.");
 // Trailing record separators do not create an extra empty row.
 if(field.length||row.length||!(/[\r\n]$/.test(text)))finishRow();
 return result;
}
function meaningful(row:string[]):boolean{return row.some(cell=>cell.trim().length>0);}
function keyOf(row:string[]):string{return JSON.stringify(row);}
export function inspectWorkspaceCsv(text:string):CsvReview{
 const rows=parseWorkspaceCsv(text);
 const seen=new Set<string>();
 let duplicates=0,blank=0;
 for(let i=1;i<rows.length;i++){
  if(!meaningful(rows[i]))blank++;
  const key=keyOf(rows[i]);
  if(seen.has(key))duplicates++;
  else seen.add(key);
 }
 return {
  columns:rows[0]?.length??0,
  inputRows:Math.max(0,rows.length-1),
  blankRows:blank,duplicateRows:duplicates,
  heading:rows[0]?.slice(0,10)??[],
 };
}
function encodeCell(value:string,protect:boolean):string{
 let input=value;
 // Leading whitespace/control characters can disguise spreadsheet formulas.
 if(protect&&/^[\s\u0001-\u001f]*[=+\-@]/u.test(input))input="'"+input;
 return '"'+input.replace(/"/g,'""')+'"';
}
export function cleanWorkspaceCsv(text:string,opts:CsvCleanupOptions):{
 csv:string;review:CsvReview;keptRows:number;removedRows:number;
}{
 const rows=parseWorkspaceCsv(text),review=inspectWorkspaceCsv(text);
 const out:string[][]=[];
 const seen=new Set<string>();
 let removed=0;
 for(let i=0;i<rows.length;i++){
  const row=opts.trimCells?rows[i].map(x=>x.trim()):[...rows[i]];
  if(i>0&&opts.removeBlankRows&&!meaningful(row)){removed++;continue;}
  if(i>0&&opts.removeDuplicateRows){
   const key=keyOf(row);
   if(seen.has(key)){removed++;continue;}
   seen.add(key);
  }
  out.push(row);
 }
 let total=0;
 const lines=out.map(row=>{
  const line=row.map(x=>encodeCell(x,opts.protectFormulas)).join(",");
  total+=line.length+2;
  if(total>MAX_OUTPUT_CHARS)throw Error("Processed CSV exceeds the maximum safe export size.");
  return line;
 });
 return {csv:lines.join("\r\n")+"\r\n",review,keptRows:Math.max(0,out.length-1),removedRows:removed};
}
