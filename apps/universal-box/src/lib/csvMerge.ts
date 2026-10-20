/** Merge explicit CSV documents by header name, preserving all cell data as literal strings. */
export type CsvSource={name:string;rows:string[][]};
export type MergedCsv={headers:string[];rows:string[][]};
export function mergeCsvSources(sources:readonly CsvSource[]):MergedCsv{
  if(sources.length<2||sources.length>12)throw Error("Choose 2–12 CSV files.");
  const headers:string[]=["source_file"],seen=new Set<string>(["source_file"]);
  let count=0;
  for(const item of sources){
    if(!item.name||item.name.length>255||item.rows.length<2)throw Error("Every CSV must have a header and a data row.");
    const h=item.rows[0];
    if(!h.length||h.length>100)throw Error("A CSV has an invalid number of columns.");
    const local=new Set<string>();
    for(const raw of h){
      const name=raw.trim();
      if(!name||name==="source_file"||local.has(name))throw Error("Missing, reserved or duplicate header: "+name);
      local.add(name);
      if(!seen.has(name)){seen.add(name);headers.push(name);}
    }
    count+=item.rows.length-1;
    if(count>4000||headers.length>101)throw Error("Combined table exceeds 4,000 rows or 100 columns.");
  }
  const result:string[][]=[];
  for(const item of sources){
    const map=new Map(item.rows[0].map((name,i)=>[name.trim(),i] as const));
    for(const row of item.rows.slice(1)){
      if(row.length>item.rows[0].length)throw Error("Row has more cells than the source header: "+item.name);
      result.push([item.name,...headers.slice(1).map(name=>row[map.get(name)??-1]??"")]);
    }
  }
  return {headers,rows:result};
}
export function mergedCsvExport(data:MergedCsv):string{
  const quote=(value:string)=>{
    let s=value.replace(/\u0000/g,"");
    if(/^[\s]*[=+@\-]/u.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return [data.headers,...data.rows].map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n";
}
