import {describe,it,expect} from "vitest";
import {validFormulaName,brewCommand,boundedTerminalLog,terminalPlainText,TERMINAL_PRESETS,TERMINAL_LOG_LIMIT} from "./betterTerminal";
describe("Better Terminal user-approved Homebrew operations",()=>{
 it("accepts literal formula tokens, blocks injected commands, whitespace and flags",()=>{
  for(const name of ["jq","python@3.13","wget","git-lfs","libxml2","rust"]){
   expect(validFormulaName(name)).toBe(true);
  }
  for(const name of ["","-rf","../../tmp","brew install jq; rm -rf ~","name && touch /tmp/x",
   "pkg$(id)","foo bar","foo\nbar","--force","名词"]){
   expect(validFormulaName(name)).toBe(false);
  }
 });
 it("never interpolates shell program or arbitrary flags from user input",()=>{
  expect(brewCommand("/opt/homebrew/bin/brew","install","jq")).toBe("/opt/homebrew/bin/brew install --formula jq");
  expect(brewCommand("/not/a/brew","search","python@3.13")).toBe("brew search python@3.13");
  expect(brewCommand(undefined,"info","foo;id")).toBeNull();
 });
 it("provides only visible benign presets, with explicit change preview flag",()=>{
  const ids=new Set(TERMINAL_PRESETS.map(x=>x.id));
  expect(ids.size).toBe(TERMINAL_PRESETS.length);
  expect(ids.has("brew-doctor")).toBe(true);
  expect(TERMINAL_PRESETS.find(x=>x.id==="brew-update")?.modifies).toBe(true);
  expect(TERMINAL_PRESETS.every(x=>!x.command.includes("sudo "))).toBe(true);
 });
 it("bounds temporary transcript and strips basic ANSI codes",()=>{
  expect(terminalPlainText("\x1b[32mHello\x1b[0m")).toBe("Hello");
  const result=boundedTerminalLog("x".repeat(TERMINAL_LOG_LIMIT),"hello");
  expect(result.length).toBe(TERMINAL_LOG_LIMIT);
  expect(result.endsWith("hello")).toBe(true);
 });
});
