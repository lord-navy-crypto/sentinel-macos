import {describe,it,expect} from "vitest";
import {wifiQrPayload,contactQrPayload,bulkQrRows,staticTextQrPayload,makeIcsEvent,generateUuidList} from "./universalBox";

describe("Universal Box no-subscription QR and office generators",()=>{
  it("encodes open and password-protected Wi-Fi QR data, escaping special characters",()=>{
    expect(wifiQrPayload({ssid:"Library",password:"",security:"nopass",hidden:false}))
      .toBe("WIFI:T:nopass;S:Library;P:;H:false;;");
    const data=wifiQrPayload({ssid:"A;B",password:"X:Y,\\Z",security:"WPA",hidden:true});
    expect(data).toContain("S:A\\;B;");
    expect(data).toContain("P:X\\:Y\\,\\\\Z;");
    expect(data).toContain("H:true;;");
    expect(()=>wifiQrPayload({ssid:"",password:"12345678",security:"WPA",hidden:false})).toThrow();
  });
  it("produces RFC-style vCard contacts without CRLF injection",()=>{
    const text=contactQrPayload({
      name:"Ada; Lovelace",phone:"+1 (212) 555 0100",email:"ada@example.org",
      organization:"Computing, Inc",url:"https://example.org/",
    });
    expect(text).toContain("BEGIN:VCARD\r\nVERSION:3.0");
    expect(text).toContain("FN:Ada\\; Lovelace");
    expect(text).toContain("ORG:Computing\\, Inc");
    expect(text).toContain("END:VCARD");
    expect(()=>contactQrPayload({name:"Test",phone:"",email:"bad",organization:"",url:""})).toThrow(/email/);
    expect(()=>contactQrPayload({name:"Test",phone:"",email:"",organization:"",url:"javascript:alert(1)"})).toThrow(/HTTP/);
    expect(()=>staticTextQrPayload("")).toThrow();
  });
  it("parses batch QR labels safely and prevents filename collisions",()=>{
    const items=bulkQrRows("Classwork | https://example.org/1\nClasswork | https://example.org/2");
    expect(items).toEqual([{name:"Classwork",text:"https://example.org/1"},{name:"Classwork-2",text:"https://example.org/2"}]);
    expect(()=>bulkQrRows("missing separator")).toThrow(/\|/);
    expect(()=>bulkQrRows(Array.from({length:41},(_,i)=>"Label"+i+"|hello").join("\n"))).toThrow(/1–40/);
    expect(()=>bulkQrRows("bad | ")).toThrow();
  });
  it("creates calendar events in UTC and escapes injected/Unicode content",()=>{
    const result=makeIcsEvent({
      summary:"Physics; class",description:"Bring notes\nDiscuss formulas",location:"Room, 3",
      start:"2026-10-19T12:00",end:"2026-10-19T13:00",
      uid:"9e967cef-7fb8-4ddc-9a5b-b7d37c486a01@daily-desk.local",
    });
    expect(result).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(result).toContain("DTSTART:20261019T120000Z");
    expect(result).toContain("DTEND:20261019T130000Z");
    expect(result).toContain("SUMMARY:Physics\\; class");
    expect(result).toContain("DESCRIPTION:Bring notes\\nDiscuss formulas");
    expect(result).toContain("LOCATION:Room\\, 3");
    expect(result).toContain("END:VCALENDAR\r\n");
    expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/u);
    const folded=makeIcsEvent({
      summary:"数学".repeat(50),description:"",location:"",
      start:"2026-10-19T12:00",end:"2026-10-19T13:00",
      uid:"9e967cef-7fb8-4ddc-9a5b-b7d37c486a01@daily-desk.local",
    });
    for(const line of folded.split("\r\n"))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(()=>makeIcsEvent({
      summary:"Bad",description:"",location:"",
      start:"2026-10-19T13:00",end:"2026-10-19T12:00",
      uid:"9e967cef-7fb8-4ddc-9a5b-b7d37c486a01@daily-desk.local",
    })).toThrow(/later/);
  });
  it("creates random UUID v4 identifiers with explicit limits",()=>{
    const ids=generateUuidList(15);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    ids.forEach(id=>expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu));
    expect(()=>generateUuidList(0)).toThrow();
    expect(()=>generateUuidList(101)).toThrow();
  });
});
