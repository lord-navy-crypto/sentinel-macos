import { describe,expect,it } from "vitest";
import {makeDataTable,filterSortTable,tableToCsv,tableToTsv,tableToJson,tableToMarkdown} from "./tableTools";

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
  it("rejects excessive columns",()=>{
    expect(()=>makeDataTable([Array.from({length:101},()=>"" )])).toThrow(/100 columns/);
  });
});