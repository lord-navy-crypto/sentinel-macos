/** Only user-selected XLSX data: read selected sheets, produce literal CSV copies and report. */
import JSZip from "jszip";
import {listXlsxWorksheets,xlsxToTable} from "./spreadsheetInterop";
import {mergedCsvExport} from "./csvMerge";
export type SheetExportResult={zip:Uint8Array;results:{index:number;name:string;rows:number;columns:number;output:string}[]};
export async function exportSelectedXlsxSheets(bytes:Uint8Array,indices:readonly number[]):Promise<SheetExportResult>{
 const list=await listXlsxWorksheets(bytes);
 const unique=new Set(indices);
 if(indices.length<1||indices.length>20||unique.size!==indices.length||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=list.length))
  throw Error("Select unique, valid worksheet numbers.");
 const zip=new JSZip(),results:SheetExportResult["results"]=[];
 for(const index of indices){
  const {table,sheetName}=await xlsxToTable(bytes,index);
  const name="worksheets/"+String(index+1).padStart(3,"0")+".csv";
  zip.file(name,"\uFEFF"+mergedCsvExport(table));
  results.push({index,name:sheetName,rows:table.rows.length,columns:table.headers.length,output:name});
 }
 zip.file("reports/manifest.json",JSON.stringify({generator:"Sentinel Box",mode:"XLSX selected sheet to formula-safe CSV",
  sheets:results,notes:"Cached cell text only. Formulas are never executed and special formatting is not preserved.",
  originalWorkbookIncluded:false},null,2));
 zip.file("reports/README.txt","Only selected XLSX worksheets are exported. Excel formulas are not recalculated. Formula-like CSV cells are escaped and all data is treated as text.\n");
 const out=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(out.length>20_000_000)throw Error("Selected worksheet ZIP exceeds the 20 MB export limit.");
 return {zip:out,results};
}
/** User-pasted snippets: no background clipboard listener or storage. */
export type BasketItem={id:number;text:string};
export function addBasketItem(current:readonly BasketItem[],text:string):BasketItem[]{
 if(current.length>=20||!text.trim()||text.length>5000||
  current.reduce((sum,x)=>sum+x.text.length,0)+text.length>40_000)
  throw Error("Clip basket supports 1–20 snippets, 5,000 chars each and 40,000 chars total.");
 return [...current,{id:current.reduce((n,x)=>Math.max(n,x.id),0)+1,text}];
}
export function moveBasketItem(current:readonly BasketItem[],index:number,direction:-1|1):BasketItem[]{
 const next=index+direction;if(index<0||next<0||index>=current.length||next>=current.length)return [...current];
 const copy=[...current];[copy[index],copy[next]]=[copy[next],copy[index]];return copy;
}
export function combineBasket(current:readonly BasketItem[],separator:string):string{
 if(!current.length||separator.length>100||current.some(x=>!x.text.trim()))throw Error("Cannot join an empty/invalid clip basket.");
 return current.map(x=>x.text).join(separator);
}
