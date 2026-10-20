/** Pure CSV table operations used by the offline Data Desk. Nothing executes spreadsheet formulas. */
export type DataTable = {headers:string[]; rows:string[][]};

export function makeDataTable(data:string[][], firstRowHeader=true):DataTable {
  if(!data.length)throw new Error("No table rows found.");
  if(data.length>2000)throw new Error("Maximum 2,000 rows.");
  const width=Math.max(...data.map(row=>row.length));
  if(width<1||width>100)throw new Error("Maximum 100 columns.");
  const first=firstRowHeader?data[0]:[];
  const names=new Map<string,number>();
  const headers=Array.from({length:width},(_,index)=>{
    const name=(first[index]??"").trim().slice(0,120)||"Column "+(index+1);
    const used=(names.get(name)??0)+1;
    names.set(name,used);
    return used===1?name:name+" ("+used+")";
  });
  const rows=(firstRowHeader?data.slice(1):data).map(row=>Array.from({length:width},(_,index)=>row[index]??""));
  return {headers,rows};
}
export function filterSortTable(
  table:DataTable,
  filter:string,
  column:number|null=null,
  sortColumn:number|null=null,
  descending=false,
  unique=false,
):DataTable {
  const width=table.headers.length;
  if(column!==null&&(column<0||column>=width))throw new Error("Invalid filter column.");
  if(sortColumn!==null&&(sortColumn<0||sortColumn>=width))throw new Error("Invalid sort column.");
  const term=filter.toLocaleLowerCase().trim();
  let rows=table.rows.filter(row=>!term||(column===null?row: [row[column]??""]).some(cell=>cell.toLocaleLowerCase().includes(term)));
  if(unique) {
    const seen=new Set<string>();
    rows=rows.filter(row=>{const id=JSON.stringify(row);if(seen.has(id))return false;seen.add(id);return true;});
  }
  if(sortColumn!==null){
    rows=[...rows].sort((a,b)=>{
      const left=a[sortColumn]??"",right=b[sortColumn]??"";
      const x=Number(left),y=Number(right);
      const comparison=left.trim()&&right.trim()&&Number.isFinite(x)&&Number.isFinite(y)
        ?x-y:left.localeCompare(right,undefined,{numeric:true,sensitivity:"base"});
      return descending?-comparison:comparison;
    });
  }
  return {headers:table.headers,rows};
}
function neutralizeFormula(cell:string):string {
  // Prevent CSV formula execution by Excel/Numbers when opening exported, untrusted text data.
  return /^[\s\uFEFF]*[=+@]/u.test(cell)||/^[\s\uFEFF]*-(?!\d+(?:\.\d+)?$)/u.test(cell)?"'"+cell:cell;
}
export function tableToCsv(table:DataTable):string {
  const cell=(value:string)=>{
    const text=neutralizeFormula(value);
    return /[",\r\n]/u.test(text)?'"'+text.replace(/"/gu,'""')+'"':text;
  };
  return [table.headers,...table.rows].map(row=>row.map(cell).join(",")).join("\r\n");
}
export function tableToJson(table:DataTable):string {
  return JSON.stringify(table.rows.map(row=>Object.fromEntries(table.headers.map((name,index)=>[name,row[index]??""]))),null,2);
}
export function tableToMarkdown(table:DataTable):string {
  const escape=(text:string)=>text.replace(/\|/gu,"\\|").replace(/[\r\n]/gu," ");
  return ["| "+table.headers.map(escape).join(" | ")+" |","| "+table.headers.map(()=>"---").join(" | ")+" |",
    ...table.rows.map(row=>"| "+row.map(escape).join(" | ")+" |")].join("\n");
}
