/** Plan explicit user-selected files for a bounded new ZIP. Never reads folders recursively. */
export function planQuickZip(files:readonly {name:string;size:number}[]){
 if(files.length<1||files.length>50)throw Error("Select 1–50 files.");
 let total=0;const used=new Set<string>();
 return files.map((f,i)=>{
  if(!Number.isSafeInteger(f.size)||f.size<0)throw Error("Invalid file size.");
  total+=f.size;if(total>16_000_000)throw Error("Selected files exceed the 16 MB input budget.");
  const name=f.name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001F]/gu,"_").replace(/^\.+/u,"_").slice(0,120);
  if(!name||name==="."||name==="..")throw Error("Invalid filename.");
  const output=String(i+1).padStart(3,"0")+"-"+name;
  const key=output.toLocaleLowerCase();
  if(used.has(key))throw Error("Duplicate output filename.");used.add(key);
  return {source:f.name,output,size:f.size,index:i};
 });
}
