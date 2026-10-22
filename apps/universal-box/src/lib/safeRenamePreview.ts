/** Bounded, predictable rename planning before touching a single file byte. */
export type RenameSource={name:string;size:number};
export type RenameConfig={prefix:string;find:string;replace:string;start:number};
export type RenameTarget<T extends RenameSource>={file:T;filename:string;originalName:string};

const MAX_FILES=50,MAX_INPUT=16_000_000,MAX_NAME=130;

function safePart(s:string):string{
 return s.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu,"-");
}
export function planSafeRenames<T extends RenameSource>(
 files:readonly T[],config:RenameConfig,
):RenameTarget<T>[]{
 if(files.length<1||files.length>MAX_FILES)throw Error("Select 1–50 files.");
 if(!Number.isSafeInteger(config.start)||config.start<0||config.start>999999)
   throw Error("Start number must be an integer from 0 to 999999.");
 if(config.prefix.length>100||config.find.length>150||config.replace.length>150)
   throw Error("Prefix and find/replace text are too long.");
 let total=0;
 const used=new Set<string>();
 return files.map((file,index)=>{
   if(!file.name||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_INPUT)
     throw Error("Invalid source file name or size.");
   total+=file.size;
   if(total>MAX_INPUT)throw Error("Total source file size exceeds 16 MB.");
   const dot=file.name.lastIndexOf(".");
   const ext=dot>0?file.name.slice(dot):"";
   const originalBase=dot>0?file.name.slice(0,dot):file.name;
   const safeExt=safePart(ext);
   if(safeExt.length>32)throw Error("File extension is too long to preserve safely.");
   const numbered="-"+String(config.start+index).padStart(2,"0");
   const base=safePart(config.prefix+(config.find?originalBase.split(config.find).join(config.replace):originalBase))
     .replace(/^[.\s]+/u,"").replace(/[.\s]+$/u,"");
   const budget=MAX_NAME-numbered.length-safeExt.length;
   if(budget<1)throw Error("Not enough room to preserve the file extension.");
   const safeBase=base.slice(0,budget).replace(/[.\s]+$/u,"");
   if(!safeBase)throw Error("Renamed file would have an empty base name.");
   const filename=safeBase+numbered+safeExt;
   const folded=filename.normalize("NFC").toLocaleLowerCase("en-US");
   if(used.has(folded))throw Error("Renamed filename collision: "+filename);
   used.add(folded);
   return {file,filename,originalName:file.name};
 });
}

/** CSV is friendly to spreadsheet viewers; guard cells against formula execution. */
function csvCell(value:string):string{
 const safe=/^[\s\uFEFF\u200B]*[=+@-]/u.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/gu,'""')+'"';
}
export function buildRenameMappingCsv<T extends RenameSource>(items:readonly RenameTarget<T>[]):string{
 if(!items.length||items.length>50)throw Error("Mapping requires 1–50 validated renames.");
 const header="index,original_name,new_name,size_bytes";
 const rows=items.map((item,index)=>{
  if(!item.originalName||!item.filename||!Number.isSafeInteger(item.file.size))
   throw Error("Renaming map contains invalid entries.");
  return [String(index+1),csvCell(item.originalName),csvCell(item.filename),String(item.file.size)].join(",");
 });
 return "\uFEFF"+[header,...rows].join("\r\n")+"\r\n";
}
export function buildRenameMappingJson<T extends RenameSource>(items:readonly RenameTarget<T>[]):string{
 if(!items.length||items.length>50)throw Error("Mapping requires 1–50 validated renames.");
 return JSON.stringify({
  generator:"Sentinel Box",
  operation:"Locally created renamed copies; source files unchanged",
  files:items.map((item,index)=>({
   index:index+1,originalName:item.originalName,newName:item.filename,originalBytes:item.file.size,
  })),
 },null,2);
}
