import {describe,it,expect} from "vitest";
import {EXTERNAL_TOOLS,validatedExternalUrl} from "./externalCatalog";
describe("external tools explicit safe launch",()=>{
  it("has distinct IDs and only verified-style HTTPS URLs",()=>{
    const seen=new Set<string>();
    for(const item of EXTERNAL_TOOLS){
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(validatedExternalUrl(item.url)).toBe(item.url);
      expect(item.name.trim()).not.toBe("");
      expect(item.description.trim()).not.toBe("");
      expect(item.note.trim()).not.toBe("");
    }
    expect(EXTERNAL_TOOLS.length).toBeGreaterThanOrEqual(8);
  });
  it("rejects dangerous protocols and embedded credentials",()=>{
    expect(()=>validatedExternalUrl("javascript:alert(1)")).toThrow(/HTTPS/);
    expect(()=>validatedExternalUrl("http://example.org")).toThrow(/HTTPS/);
    expect(()=>validatedExternalUrl("https://user:pass@example.org")).toThrow(/HTTPS/);
  });
});
