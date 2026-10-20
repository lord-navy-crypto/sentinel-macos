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
