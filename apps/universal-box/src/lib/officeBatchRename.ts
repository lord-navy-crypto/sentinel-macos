/** Non-destructive office batch rename: preview first, verify collisions before reading bytes. */
export type RenameSource={name:string;size:number};
export type RenameOptions={prefix:string;find:string;replace:string;start:number};
export type RenamePlanRow={index:number;source:string;filename:string;size:number};
const RESERVED=/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
function safeOfficeName(input:string):string{
 const cleaned=input.normalize("NFC").replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/gu,"-")
   .replace(/[ .]+$/gu,"").replace(/^\.+/u,"-");
 if(!cleaned||cleaned==="."||cleaned===".."||RESERVED.test(cleaned)||
    cleaned.length>130||/[\/\\]/u.test(cleaned))
  throw Error("Invalid or reserved output filename.");
 return cleaned;
}
export function planOfficeBatchRename(inputs:readonly RenameSource[],options:RenameOptions):RenamePlanRow[]{
 if(inputs.length<1||inputs.length>50)throw Error("Select 1–50 files.");
 if(!Number.isSafeInteger(options.start)||options.start<1||options.start>99999)
  throw Error("Starting number must be a whole number between 1 and 99,999.");
 if(options.prefix.length>40||options.find.length>100||options.replace.length>100)
  throw Error("Prefix/find/replace text is too long.");
 if(/[\r\n]/u.test(options.prefix+options.find+options.replace))
  throw Error("Filename rules cannot contain line breaks.");
 let sum=0;const seen=new Set<string>();
 return inputs.map((file,index)=>{
  if(!file.name||file.name.length>255||!Number.isSafeInteger(file.size)||file.size<0)
   throw Error("Invalid selected file metadata.");
  sum+=file.size;if(sum>16_000_000)throw Error("Batch exceeds 16 MB total.");
  const i=file.name.lastIndexOf(".");
  const stem=i>0?file.name.slice(0,i):file.name;
  const ext=i>0?file.name.slice(i):"";
  const cleanedStem=options.find?stem.split(options.find).join(options.replace):stem;
  const sequence=String(options.start+index).padStart(2,"0");
  const output=safeOfficeName(options.prefix+cleanedStem+"-"+sequence+ext);
  const collisionKey=output.normalize("NFC").toLocaleLowerCase("und");
  if(seen.has(collisionKey))throw Error("Duplicate output filename: "+output);
  seen.add(collisionKey);
  return {index,source:file.name,filename:output,size:file.size};
 });
}
export function renamePlanManifest(plan:readonly RenamePlanRow[]):string{
 return JSON.stringify({kind:"sentinel-box-office-rename",version:1,
  files:plan.map(({source,filename,size})=>({originalName:source,renamedCopy:filename,size}))},null,2)+"\n";
}
