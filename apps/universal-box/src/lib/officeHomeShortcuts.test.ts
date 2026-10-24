import {describe,expect,it} from "vitest";
import {OFFICE_MAIN_SHORTCUTS,OFFICE_FAST_ACTIONS} from "./officeHomeShortcuts";

describe("office-first real-workflow shortcuts",()=>{
  it("has six unique core tasks that cross PDF, images, text, Finder, OCR and Word/PPT",()=>{
    expect(OFFICE_MAIN_SHORTCUTS).toHaveLength(6);
    expect(OFFICE_MAIN_SHORTCUTS.map(x=>x.id)).toEqual([
      "home-office-pdf","home-office-image","home-office-text",
      "home-office-rename","home-office-ocr","home-office-word",
    ]);
    expect(new Set(OFFICE_MAIN_SHORTCUTS.map(x=>x.id)).size).toBe(6);
    expect(new Set(OFFICE_MAIN_SHORTCUTS.map(x=>x.view)).size).toBe(5);
    expect(OFFICE_MAIN_SHORTCUTS.find(x=>x.id==="home-office-word"))
      .toMatchObject({view:"creative-studio",module:"word"});
  });
  it("links four real size/conversion/document/package actions, without duplicated routes or vague names",()=>{
    expect(OFFICE_FAST_ACTIONS).toHaveLength(4);
    const all=[...OFFICE_MAIN_SHORTCUTS,...OFFICE_FAST_ACTIONS];
    expect(new Set(all.map(x=>x.id)).size).toBe(all.length);
    expect(new Set(all.map(x=>x.view+":"+x.module)).size).toBe(all.length);
    for(const item of all){
      expect(item.title.trim().length).toBeGreaterThan(4);
      expect(item.hint.trim().length).toBeGreaterThan(6);
      expect(item.module).toBeTruthy();
      expect(item.view).toBeTruthy();
    }
    expect(OFFICE_FAST_ACTIONS.find(x=>x.id==="home-fast-pdf-size"))
      .toMatchObject({view:"pdf-mini",module:"optimize"});
    expect(OFFICE_FAST_ACTIONS.find(x=>x.id==="home-fast-photo-kb"))
      .toMatchObject({view:"media-files",module:"photo-target"});
  });
});
