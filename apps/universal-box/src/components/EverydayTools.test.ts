import { describe, expect, it } from "vitest";
import { csvRows, markdownTable } from "./EverydayTools";
import { parseWorkspace } from "../lib/workspace";

describe("web tool equivalents", () => {
  it("parses quoted CSV cells including commas and double quotes", () => {
    expect(csvRows('Name,Note\n"Ada","one,two"\n"Lin","say ""hello"""')).toEqual([
      ["Name", "Note"],
      ["Ada", "one,two"],
      ["Lin", 'say "hello"'],
    ]);
  });

  it("optionally retains physical blank CSV rows without inventing a row after final newline",()=>{
    const input='name,notes\r\n甲,"第一行\n第二行"\r\n\r\n \t \r\n乙,last\r\n';
    expect(csvRows(input,",").length).toBe(3);
    const preserved=csvRows(input,",",true);
    expect(preserved).toEqual([
      ["name","notes"],["甲","第一行\n第二行"],[""],[" \t "],["乙","last"],
    ]);
    expect(csvRows("a,b\n",",",true)).toEqual([["a","b"]]);
    expect(csvRows("\n",",",true)).toEqual([[""]]);
    expect(csvRows("",",",true)).toEqual([]);
    expect(csvRows("x\ty\n\nz\t1\n","\t",true)).toEqual([["x","y"],[""],["z","1"]]);
    // Existing call sites still get their prior skip-blank behavior by default.
    expect(csvRows("x\n\nz\n")).toEqual([["x"],["z"]]);
  });

  it("rejects malformed and oversized CSV instead of silently losing rows", () => {
    expect(() => csvRows('"unclosed')).toThrow(/unmatched/i);
    expect(() => csvRows("h\n" + "x\n".repeat(2001))).toThrow(/2,000/);
  });

  it("escapes Markdown table pipes and supports no-header mode", () => {
    expect(markdownTable([["a", "b"], ["foo|bar", "baz"]])).toContain("foo\\|bar");
    expect(markdownTable([["one", "two"]], false)).toContain("Column 1");
  });

  it("preserves version-two study extras in local backups", () => {
    const workspace = parseWorkspace({
      version: 2,
      tasks: [],
      cards: [],
      notes: "hello",
      exams: [{id:"e1",name:"Physics exam",date:"2026-12-08"}],
      mistakes: [{id:"m1",topic:"RC circuit",correction:"Check time constant"}],
      snippets: [{id:"s1",title:"Python",code:"print(1)"}],
      documentMarkdown: "# Notes",
    });
    expect(workspace.exams?.[0].date).toBe("2026-12-08");
    expect(workspace.mistakes).toHaveLength(1);
    expect(workspace.snippets?.[0].code).toBe("print(1)");
    expect(workspace.documentMarkdown).toBe("# Notes");
  });
});
