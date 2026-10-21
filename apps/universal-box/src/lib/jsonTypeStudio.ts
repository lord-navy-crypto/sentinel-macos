/** Local JSON type generator. Inference only; never evaluates or runs input code. */
export type JsonAudit={typeScript:string;paths:string;valueCount:number;arrayCount:number;objectCount:number;maxDepth:number};
type Tracker={values:number;arrays:number;objects:number;depth:number;paths:string[]};
const identifier=/^[A-Za-z_$][\w$]*$/u;
const prop=(key:string)=>identifier.test(key)&&!["__proto__","prototype","constructor"].includes(key)?key:JSON.stringify(key);
function inspect(node:unknown,path:string,depth:number,ctx:Tracker):string{
 if(depth>11)throw Error("JSON nesting exceeds 11 levels.");
 if(++ctx.values>4000)throw Error("JSON contains too many nodes.");
 ctx.depth=Math.max(ctx.depth,depth);
 if(node===null){ctx.paths.push(path+"\tnull");return "null";}
 if(typeof node==="string"){ctx.paths.push(path+"\tstring");return "string";}
 if(typeof node==="number"){ctx.paths.push(path+"\tnumber");return "number";}
 if(typeof node==="boolean"){ctx.paths.push(path+"\tboolean");return "boolean";}
 if(Array.isArray(node)){
  ctx.arrays++;ctx.paths.push(path+"\tarray["+node.length+"]");
  if(node.length>500)throw Error("Array length exceeds 500.");
  if(node.length===0)return "unknown[]";
  // Keep all object members in inferred type; mark absent keys as optional.
  if(node.every(x=>typeof x==="object"&&x!==null&&!Array.isArray(x))){
   const objects=node as Record<string,unknown>[];
   const keys=Array.from(new Set(objects.flatMap(x=>Object.keys(x))));
   if(keys.length>100)throw Error("Array object has too many fields.");
   const parts=keys.map(k=>{
    const present=objects.filter(x=>Object.prototype.hasOwnProperty.call(x,k));
    const options=new Set<string>();
    for(const [idx,object] of objects.entries()){
     if(Object.prototype.hasOwnProperty.call(object,k)){
      const type=inspect(object[k],path+"["+idx+"]."+k,depth+2,ctx);
      options.add(type);
     }
    }
    return "  "+prop(k)+(present.length<objects.length?"?":"")+": "+union([...options])+";";
   });
   ctx.objects+=objects.length;
   return "({\n"+parts.join("\n")+"\n"+indent(depth)+"})[]";
  }
  const found=new Set<string>();
  for(const [i,v] of node.entries())found.add(inspect(v,path+"["+i+"]",depth+1,ctx));
  const types=[...found];
  return types.length===1?parenthesize(types[0])+"[]":"("+union(types)+")[]";
 }
 if(typeof node==="object"){
  ctx.objects++;
  const keys=Object.keys(node as Record<string,unknown>);
  if(keys.length>100)throw Error("Object has too many fields.");
  ctx.paths.push(path+"\tobject{"+keys.length+"}");
  if(!keys.length)return "Record<string, never>";
  const parts=keys.map(key=>{
   const child=inspect((node as Record<string,unknown>)[key],path+"."+key,depth+1,ctx);
   return indent(depth+1)+prop(key)+": "+child+";";
  });
  return "{\n"+parts.join("\n")+"\n"+indent(depth)+"}";
 }
 throw Error("Unsupported JSON value.");
}
const indent=(depth:number)=>"  ".repeat(Math.min(depth,12));
const union=(parts:string[])=>parts.length===0?"unknown":parts.join(" | ");
const parenthesize=(s:string)=>s.includes(" | ")?"("+s+")":s;
/** Generates a readable TS type and an auditable TSV of inferred JSON paths. */
export function auditJsonToTypescript(source:string):JsonAudit{
 if(source.length<1||source.length>150_000)throw Error("JSON input must contain 1–150,000 characters.");
 let parsed:unknown;
 try{parsed=JSON.parse(source) as unknown;}catch(e){
  throw Error("Invalid JSON: "+(e instanceof Error?e.message:String(e)));
 }
 const ctx:Tracker={values:0,arrays:0,objects:0,depth:0,paths:[]};
 const type=inspect(parsed,"$",0,ctx);
 const typeScript="// Generated locally by Universal Box. Inferred types, not a runtime validator.\n"+
  "export type Root = "+type+";\n";
 if(typeScript.length>500_000)throw Error("Generated TypeScript exceeds the output limit.");
 return {typeScript,paths:"path\ttype\n"+ctx.paths.join("\n")+"\n",valueCount:ctx.values,
  arrayCount:ctx.arrays,objectCount:ctx.objects,maxDepth:ctx.depth};
}
