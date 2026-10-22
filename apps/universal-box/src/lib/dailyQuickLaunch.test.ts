import {describe,it,expect} from "vitest";
import {chooseDailyShortcuts,DEFAULT_DAILY_SHORTCUTS} from "./dailyQuickLaunch";

const tools=[...DEFAULT_DAILY_SHORTCUTS.map(id=>({id,view:"local",module:id})),{id:"special",view:"local",module:"special"}];

describe("Favorite-first everyday tool quick launch",()=>{
 it("shows six useful defaults when no tools have been starred",()=>{
  expect(chooseDailyShortcuts(tools,[]).map(x=>x.id)).toEqual([...DEFAULT_DAILY_SHORTCUTS]);
 });
 it("prioritizes saved favorites, fills the remaining row with nonduplicated defaults",()=>{
  const ids=chooseDailyShortcuts(tools,["special","quick-clean-text"]).map(x=>x.id);
  expect(ids.slice(0,2)).toEqual(["special","quick-clean-text"]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBe(6);
 });
 it("skips stale and duplicated favorites safely",()=>{
  const ids=chooseDailyShortcuts(tools,["gone","special","special"]).map(x=>x.id);
  expect(ids[0]).toBe("special");
  expect(ids).not.toContain("gone");
  expect(ids.filter(x=>x==="special")).toHaveLength(1);
 });
 it("respects bounded quick row length and leaves catalog records untouched",()=>{
  expect(chooseDailyShortcuts(tools,[],3)).toHaveLength(3);
  expect(tools[0].id).toBe("quick-clean-text");
  expect(()=>chooseDailyShortcuts(tools,[],0)).toThrow(/1–12/);
  expect(()=>chooseDailyShortcuts(tools,[],13)).toThrow(/1–12/);
 });
});
