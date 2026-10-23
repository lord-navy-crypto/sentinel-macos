import {compile} from "mathjs";
/** A small bounded x/f(x) calculator table with safe numeric CSV output. */
export function functionTable(expression:string,start:number,step:number,count:number){
 if(!expression.trim()||expression.length>160)throw Error("Enter a function expression up to 160 characters.");
 if(!Number.isInteger(count)||count<2||count>50)throw Error("Rows must be between 2 and 50.");
 if(!Number.isFinite(start)||!Number.isFinite(step)||step===0||
  Math.abs(start)>1e6||Math.abs(step)>1e6)
  throw Error("Start and nonzero step must be finite and within ±1,000,000.");
 const fn=compile(expression);
 const rows=Array.from({length:count},(_,i)=>{
  const x=start+i*step;
  if(!Number.isFinite(x))throw Error("Non-finite x value.");
  let raw:unknown;
  try{raw=fn.evaluate({x});}catch{raw=null;}
  const y=typeof raw==="number"&&Number.isFinite(raw)?raw:null;
  return {x,y};
 });
 const csv="x,f(x)\r\n"+rows.map(v=>[String(v.x),v.y===null?"":String(v.y)].join(",")).join("\r\n")+"\r\n";
 const display="x\tf(x)\n"+rows.map(v=>String(v.x)+"\t"+(v.y===null?"undefined":String(v.y))).join("\n");
 return {rows,csv,display};
}
