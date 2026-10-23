/** Restricted, offline math.js calculator. No assignment, arbitrary scope, imports or remote operations. */
import {parse} from "mathjs";
export type Calculation={expression:string;result:string};
export const CALCULATION_HISTORY_LIMIT=20;
const ALLOWED_FUNCTIONS=new Set([
 "abs","sqrt","cbrt","sin","cos","tan","asin","acos","atan",
 "sinh","cosh","tanh","asinh","acosh","atanh",
 "log","log10","log2","exp","pow","round","ceil","floor","sign",
 "min","max","sum","mean","median","std","variance","factorial",
 "det","inv","transpose","trace","norm","dot","cross",
 "gcd","lcm","mod","hypot","atan2",
]);
const ALLOWED_SYMBOLS=new Set([
 "pi","e","tau","phi","i","true","false","Infinity","Ans","ans",
 ...ALLOWED_FUNCTIONS,
]);
const ALLOWED_NODES=new Set([
 "ConstantNode","OperatorNode","ParenthesisNode","SymbolNode",
 "FunctionNode","ArrayNode",
]);
function checkValue(value:unknown):void{
 if(typeof value==="number"){if(!Number.isFinite(value))throw Error("Result is not finite.");return;}
 if(typeof value==="string"||typeof value==="boolean"||typeof value==="function"||value===undefined||value===null)
  throw Error("Only numeric or matrix results are supported.");
 if(typeof value==="bigint")return;
 if(Array.isArray(value)){for(const item of value)checkValue(item);return;}
 if(typeof value==="object"){
  const v=value as Record<string,unknown>;
  if(typeof v.re==="number"&&typeof v.im==="number"){
   if(!Number.isFinite(v.re)||!Number.isFinite(v.im))throw Error("Complex result is not finite.");
   return;
  }
  if(typeof v.toArray==="function"){checkValue((v.toArray as ()=>unknown)());return;}
  if(typeof v.toNumber==="function"){
   const n=(v.toNumber as ()=>unknown)();
   checkValue(n);
   return;
  }
 }
 throw Error("Unsupported calculation result.");
}
/** Ans is the last real finite scalar result. Formatted output is not rounded. */
export function calculateExpression(source:string,lastAns:number|null=null):{
 result:string;numericAns:number|null;
}{
 const expression=source.trim();
 if(!expression||expression.length>180||/[\n\r;]/u.test(expression))
  throw Error("Enter one calculator expression (1–180 characters).");
 const ast=parse(expression);
 ast.traverse(node=>{
  if(!ALLOWED_NODES.has(node.type))
   throw Error("Unsupported calculation syntax: "+node.type+".");
  if(node.type==="SymbolNode"&&!ALLOWED_SYMBOLS.has((node as {name:string}).name))
   throw Error("Unknown or restricted variable: "+(node as {name:string}).name+".");
  if(node.type==="FunctionNode"){
   const n=(node as {fn?:{name?:string}}).fn?.name;
   if(!n||!ALLOWED_FUNCTIONS.has(n))
    throw Error("Function is not available in this calculator.");
  }
 });
 const scope={Ans:lastAns??0,ans:lastAns??0};
 const result:unknown=ast.compile().evaluate(scope);
 checkValue(result);
 const output=String(result);
 if(!output||output.length>2000)throw Error("Result is too large to display.");
 const nextAns=typeof result==="number"&&Number.isFinite(result)?result:lastAns;
 return {result:output,numericAns:nextAns};
}
export function appendCalculation(history:Calculation[],entry:Calculation):Calculation[]{
 if(!entry.expression.trim()||!entry.result.trim())throw Error("Incomplete calculation.");
 return [...history,entry].slice(-CALCULATION_HISTORY_LIMIT);
}
export function calculatorHistoryText(history:Calculation[]):string{
 return history.map(item=>item.expression+" = "+item.result).join("\n")+"\n";
}
