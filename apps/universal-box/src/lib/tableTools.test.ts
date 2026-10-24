import { describe,expect,it } from "vitest";
import {makeDataTable,filterSortTable,replaceTableCells,tableToCsv,tableToTsv,tableToJson,tableToMarkdown} from "./tableTools";

describe("offline table workbench",()=>{
  const table=makeDataTable([["Name","Score","Name"],["Ada","10","A"],["Bob","2","B"],["Ada","10","A"]]);
  it("normalizes duplicate headers and preserves rows",()=>{
    expect(table.headers).toEqual(["Name","Score","Name (2)"]);
    expect(table.rows).toHaveLength(3);
  });
  it("filters, sorts numeric cells and deduplicates",()=>{
    const s=filterSortTable(table,"",null,1,false,true);
    expect(s.rows).toEqual([["Bob","2","B"],["Ada","10","A"]]);
    expect(filterSortTable(table,"ADA",0).rows).toHaveLength(2);
  });
  it("writes valid JSON and protects spreadsheet formula cells",()=>{
    const data=makeDataTable([["name"],["=1+2"],["+CMD"],["-42"]]);
    expect(tableToCsv(data)).toContain("'=1+2");
    expect(tableToCsv(data)).toContain("\r\n-42");
    expect(JSON.parse(tableToJson(data))).toEqual([{name:"=1+2"},{name:"+CMD"},{name:"-42"}]);
  });
  it("escapes pipes in Markdown",()=>{
    expect(tableToMarkdown(makeDataTable([["Item"],["a|b"]]))).toContain("a\\|b");
  });
  it("filters only truly empty cells when explicitly requested, preserving original rows",()=>{
    const data=makeDataTable([
      ["Name","Value"],["甲","1"],[" ","\t"],["乙","0"],["",""],["丙",""],
    ]);
    expect(filterSortTable(data,"").rows).toHaveLength(5);
    const filtered=filterSortTable(data,"",null,null,false,false,true);
    expect(filtered.rows).toEqual([["甲","1"],["乙","0"],["丙",""]]);
    expect(data.rows).toHaveLength(5);
    expect(filterSortTable(data,"",null,1,false,false,true).rows).toEqual([["丙",""],["乙","0"],["甲","1"]]);
  });
  it("exports real TSV with quoted embedded tab, quote and newline while blocking formulas",()=>{
    const data=makeDataTable([
      ["Name","备注","Value"],["甲","第一行\n第二行","=2+3"],
      ["乙",'literal\t"quoted"',"@DANGEROUS"],["丙","normal","-42"],
    ]);
    const out=tableToTsv(data);
    expect(out).toContain('"第一行\n第二行"');
    expect(out).toContain('"literal\t""quoted"""');
    expect(out).toContain("\t'=2+3");
    expect(out).toContain("\t'@DANGEROUS");
    expect(out).toContain("\t-42");
    expect(out.startsWith("Name\t备注\tValue\r\n")).toBe(true);
    expect(out).not.toContain("\ufeff");
    expect(data.rows[0][2]).toBe("=2+3");
  });
  it("replaces only cells in the selected column; preserves headings and originals",()=>{
    const table=makeDataTable([
      ["Department","Notes","Value"],
      ["销售","销售, 销售", "=SUM(1)"],["销售","销售\n后续", "-42"],
    ]);
    const originals=JSON.stringify(table);
    const a=replaceTableCells(table,"销售","市场",1);
    expect(a.matches).toBe(3);
    expect(a.changedCells).toBe(2);
    expect(a.table.headers).toEqual(["Department","Notes","Value"]);
    expect(a.table.rows).toEqual([
      ["销售","市场, 市场","=SUM(1)"],["销售","市场\n后续","-42"],
    ]);
    expect(JSON.stringify(table)).toBe(originals);
    const all=replaceTableCells(table,"销售","",null);
    expect(all.matches).toBe(5);
    expect(all.changedCells).toBe(4);
    expect(all.table.rows[0][0]).toBe("");
    expect(all.table.rows[0][1]).toBe(", ");
    expect(table.rows[0][0]).toBe("销售");
  });
  it("can safely replace a cell with CSV/TSV delimiters and formula-like values",()=>{
    const source=makeDataTable([["Label","Number"],["old","2"],["old","-5"]]);
    const {table,changedCells,matches}=replaceTableCells(source,"old",'=1+2\t"test"');
    expect(changedCells).toBe(2);
    expect(matches).toBe(2);
    expect(tableToCsv(table)).toContain('"\'=1+2\t""test"""');
    expect(tableToTsv(table)).toContain('"\'=1+2\t""test"""');
    expect(source.rows[0][0]).toBe("old");
  });
  it("limits invalid column indexes, control chars, oversized output and excessive matches",()=>{
    const src=makeDataTable([["A","B"],["value","other"]]);
    expect(()=>replaceTableCells(src,"", "x")).toThrow(/printable literal/);
    expect(()=>replaceTableCells(src,"v\n", "x")).toThrow(/printable literal/);
    expect(()=>replaceTableCells(src,"value", "x",2)).toThrow(/Invalid replacement column/);
    expect(()=>replaceTableCells(src,"value", "x",-1)).toThrow(/Invalid replacement column/);
    expect(()=>replaceTableCells(src,"value", "a".repeat(20001))).toThrow(/printable literal/);
    const repeated=makeDataTable([["X"],["x".repeat(12000)]]);
    expect(()=>replaceTableCells(repeated,"x","y")).toThrow(/Too many replacement matches/);
    const bigCell=makeDataTable([["X"],["x".repeat(11000)]]);
    expect(()=>replaceTableCells(bigCell,"x","aa")).toThrow(/Too many replacement matches/);
    const oversized=makeDataTable([["X"],["x".repeat(9000)]]);
    expect(()=>replaceTableCells(oversized,"x","aaa")).toThrow(/A transformed table cell/);
    const manyRows:typeof src={headers:["X"],rows:Array.from({length:1500},()=>["x"])};
    expect(()=>replaceTableCells(manyRows,"x","m".repeat(2000))).toThrow(/2.5-million-character/);
    const unchanged=replaceTableCells(src,"value","value");
    expect(unchanged.matches).toBe(1);
    expect(unchanged.changedCells).toBe(0);
    expect(unchanged.table.rows).toEqual(src.rows);
  });
  it("rejects excessive columns",()=>{
    expect(()=>makeDataTable([Array.from({length:101},()=>"" )])).toThrow(/100 columns/);
  });
});