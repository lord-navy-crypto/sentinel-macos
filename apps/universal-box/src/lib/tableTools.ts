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
  removeEmptyRows=false,
):DataTable {
  const width=table.headers.length;
  if(column!==null&&(column<0||column>=width))throw new Error("Invalid filter column.");
  if(sortColumn!==null&&(sortColumn<0||sortColumn>=width))throw new Error("Invalid sort column.");
  const term=filter.toLocaleLowerCase().trim();
  let rows=table.rows.filter(row=>!term||(column===null?row: [row[column]??""]).some(cell=>cell.toLocaleLowerCase().includes(term)));
  if(removeEmptyRows)rows=rows.filter(row=>row.some(cell=>cell.trim().length>0));
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
/** Literal, case-sensitive find/replace inside DATA CELLS ONLY, never raw CSV syntax or headings.
 * Returns a new table. Input table and original CSV text remain untouched.
 */
export function replaceTableCells(
  table:DataTable,find:string,replacement:string,column:number|null=null,
):{table:DataTable;matches:number;changedCells:number}{
  const width=table.headers.length;
  if(width<1||width>100||table.rows.length>2000)throw Error("Table exceeds the safe replacement limit.");
  if(!find||find.length>1000||replacement.length>10000||
    /[\u0000-\u001f\u007f]/u.test(find)||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(replacement))
    throw Error("Enter printable literal find (1–1,000) and replacement (up to 10,000) without unsafe control characters.");
  if(column!==null&&(!Number.isSafeInteger(column)||column<0||column>=width))
    throw Error("Invalid replacement column.");
  let matches=0,changedCells=0,totalChars=0;
  const rows=table.rows.map(row=>row.map((cell,i)=>{
    let next=cell;
    if(column===null||column===i){
      const count=cell.split(find).length-1;
      if(count){
        matches+=count;
        if(matches>10000)throw Error("Too many replacement matches (10,000 maximum).");
        next=cell.split(find).join(replacement);
        if(next.length>20000)throw Error("A transformed table cell exceeds 20,000 characters.");
        if(next!==cell)changedCells++;
      }
    }
    totalChars+=next.length;
    if(totalChars>2_500_000)throw Error("Transformed table exceeds the 2.5-million-character export limit.");
    return next;
  }));
  return {table:{headers:[...table.headers],rows},matches,changedCells};
}

/** Export a copy with only chosen columns, in original column order. Never alter source data. */
export function selectTableColumns(table:DataTable,selected:readonly number[]):DataTable{
  const width=table.headers.length;
  if(width<1||width>100||table.rows.length>2000)throw Error("Table exceeds supported limits.");
  if(!selected.length)throw Error("Select at least one column before exporting.");
  const unique=new Set(selected);
  if(selected.length>width||unique.size!==selected.length||
    selected.some(i=>!Number.isSafeInteger(i)||i<0||i>=width))
    throw Error("Invalid, repeated or missing table column selection.");
  const ordered=[...unique].sort((a,b)=>a-b);
  return {
    headers:ordered.map(i=>table.headers[i]),
    rows:table.rows.map(row=>ordered.map(i=>row[i]??"")),
  };
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
/** Real tab-separated export, with quoted embedded tabs/newlines and spreadsheet-safe literal cells. */
export function tableToTsv(table:DataTable):string {
  const cell=(value:string)=>{
    const text=neutralizeFormula(value);
    return /["\t\r\n]/u.test(text)?'"'+text.replace(/"/gu,'""')+'"':text;
  };
  return [table.headers,...table.rows].map(row=>row.map(cell).join("\t")).join("\r\n");
}
export function tableToJson(table:DataTable):string {
  return JSON.stringify(table.rows.map(row=>Object.fromEntries(table.headers.map((name,index)=>[name,row[index]??""]))),null,2);
}
export function tableToMarkdown(table:DataTable):string {
  const escape=(text:string)=>text.replace(/\|/gu,"\\|").replace(/[\r\n]/gu," ");
  return ["| "+table.headers.map(escape).join(" | ")+" |","| "+table.headers.map(()=>"---").join(" | ")+" |",
    ...table.rows.map(row=>"| "+row.map(escape).join(" | ")+" |")].join("\n");
}
