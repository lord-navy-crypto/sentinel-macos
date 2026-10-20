/** Literal find/replace for explicitly imported small text documents; no regex or source mutation. */
export function replaceTextLiteral(source:string,find:string,replacement:string):{text:string;count:number}{
 if(!find||find.length>1000)throw Error("Search text must be 1–1,000 characters.");
 if(source.length>200000||replacement.length>10000)throw Error("Text exceeds processing limit.");
 const count=source.split(find).length-1;
 if(count>10000)throw Error("Too many matches (maximum 10,000).");
 const text=source.split(find).join(replacement);
 if(text.length>200000)throw Error("Output exceeds 200,000 characters.");
 return {text,count};
}
export function fileNameManifest(files:readonly {name:string;size:number}[],format:"txt"|"csv"):string{
 if(files.length<1||files.length>200)throw Error("Choose 1–200 files.");
 for(const file of files){
  if(!file.name||file.name.length>255||!Number.isSafeInteger(file.size)||file.size<0)throw Error("Invalid file metadata.");
 }
 if(format==="txt")return files.map(file=>file.name).join("\n")+"\n";
 if(format!=="csv")throw Error("Unsupported manifest format.");
 const quote=(s:string)=>{
  const safe=/^[\s]*[=+@\-\t\r]/u.test(s)?"'"+s:s;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 return "filename,size_bytes\r\n"+files.map(f=>quote(f.name)+","+f.size).join("\r\n")+"\r\n";
}
