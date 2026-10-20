import { describe,expect,it } from "vitest";
import {makeDataTable,filterSortTable,tableToCsv,tableToJson,tableToMarkdown} from "./tableTools";

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
  it("rejects excessive columns",()=>{
    expect(()=>makeDataTable([Array.from({length:101},()=>"" )])).toThrow(/100 columns/);
  });
});