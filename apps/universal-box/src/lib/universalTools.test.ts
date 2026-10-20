import {describe,expect,it} from "vitest";
import {
  jsonRecordsToCsv,parseUtcMinute,timeInZone,generatePassword,
  normalizeExpectedHash,sha256File,type PasswordConfig,
} from "./universalTools";

describe("Daily Desk v0.19 universal utilities",()=>{
  it("converts JSON records into quoted and injection-safe CSV",()=>{
    const result=jsonRecordsToCsv(JSON.stringify([
      {name:"Ana",score:95,notes:"Hi, all"},
      {name:"Li",score:0,notes:"=2+2",passed:true},
    ]));
    expect(result.rows).toBe(2);
    expect(result.columns).toBe(4);
    expect(result.csv).toContain('"Hi, all"');
    expect(result.csv).toContain("'=2+2");
    expect(result.csv).toContain("name,score,notes,passed");
    expect(()=>jsonRecordsToCsv('[{"nested":{"x":1}}]')).toThrow(/Nested/);
    expect(()=>jsonRecordsToCsv('{"not":"array"}')).toThrow(/array/);
    expect(()=>jsonRecordsToCsv('[{"x":1},null]')).toThrow(/object/);
  });
  it("uses precise UTC instants and observes DST correctly",()=>{
    expect(parseUtcMinute("2026-10-19T12:00").toISOString()).toBe("2026-10-19T12:00:00.000Z");
    expect(timeInZone("2026-10-19T12:00","Asia/Seoul")).toContain("21:00");
    expect(timeInZone("2026-03-08T06:30","America/New_York")).toContain("01:30");
    expect(timeInZone("2026-03-08T07:30","America/New_York")).toContain("03:30");
    expect(()=>parseUtcMinute("2026-02-30T11:00")).toThrow(/calendar/);
    expect(()=>parseUtcMinute("2026-01-01T24:00")).toThrow();
  });
  it("generates crypto-secure passwords with at least one character per group",()=>{
    const cfg:PasswordConfig={length:24,lowercase:true,uppercase:true,digits:true,symbols:true};
    const value=generatePassword(cfg);
    expect(value).toHaveLength(24);
    expect(value).toMatch(/[a-z]/u);
    expect(value).toMatch(/[A-Z]/u);
    expect(value).toMatch(/[0-9]/u);
    expect(value).toMatch(/[!@#$%&*?\-_]/u);
    expect(generatePassword({...cfg,length:8})).toHaveLength(8);
    expect(()=>generatePassword({...cfg,length:7})).toThrow(/8–64/);
    expect(()=>generatePassword({...cfg,lowercase:false,uppercase:false,digits:false,symbols:false})).toThrow(/category/);
  });
  it("computes standard SHA-256 digests and validates expected digest inputs",async()=>{
    const value=await sha256File(new TextEncoder().encode("abc").buffer);
    expect(value).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(normalizeExpectedHash("SHA256: "+value.toUpperCase())).toBe(value);
    expect(()=>normalizeExpectedHash("wrong")).toThrow(/64/);
    await expect(sha256File(new ArrayBuffer(0))).rejects.toThrow(/1 byte/);
  });
});
