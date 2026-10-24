import {describe,it,expect} from "vitest";
import {DEFAULT_LOG_PRIVACY,scrubDiagnosticText} from "./logPrivacy";
describe("local diagnostic privacy cleaner",()=>{
 it("removes Sentinel session tokens, bearer tokens, cookies and embedded URL credentials",()=>{
  const text=[
   "X-Sentinel-Token: abcdef12345",
   "Authorization: Bearer abc.def",
   '{ "Authorization": "Bearer secretBearer42" }',
   'password="very-secret"',
   "Cookie: sid=abc; x=def",
   "http://127.0.0.1:3241/#token=abc123",
  ].join("\n");
  const x=scrubDiagnosticText(text);
  for(const secret of ["abcdef12345","abc.def","secretBearer42","very-secret","sid=abc","token=abc123"]){
   expect(x.text).not.toContain(secret);
  }
  expect(x.replacements).toBeGreaterThanOrEqual(5);
 });
 it("hides home usernames and emails by default and keeps IPv4 on opt-in",()=>{
  const before="See /Users/jane/report.json and jane@example.org from 192.168.1.8";
  const out=scrubDiagnosticText(before);
  expect(out.text).not.toContain("jane@example.org");
  expect(out.text).toContain("/Users/[USER]/report.json");
  expect(out.text).toContain("192.168.1.8");
  expect(scrubDiagnosticText(before,{...DEFAULT_LOG_PRIVACY,ipv4:true}).text).toContain("[IPV4]");
 });
 it("leaves plain diagnostics untouched when no sensitive patterns exist",()=>{
  expect(scrubDiagnosticText("CPU usage: 10%\nDisk: 60 GB").replacements).toBe(0);
 });
 it("rejects large input before processing",()=>{
  expect(()=>scrubDiagnosticText("x".repeat(200001))).toThrow();
 });
 it("erases multi-line private key blocks",()=>{
  const secret="-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
  expect(scrubDiagnosticText(secret).text).toEqual("[PRIVATE KEY REMOVED]");
 });
});
