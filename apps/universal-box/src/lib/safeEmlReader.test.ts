import {describe,it,expect} from "vitest";
import {inspectLocalEml,emlTextSummary} from "./safeEmlReader";
const encoder=new TextEncoder();
const sample=[
 "From: Alice <alice@example.org>",
 "To: Bob <bob@example.org>",
 "Subject: =?UTF-8?B?5rWL6K+V?= archive",
 "Date: Thu, 22 Oct 2026 09:00:00 +0000",
 'MIME-Version: 1.0',
 'Content-Type: multipart/mixed; boundary="mix-001"',
 "",
 "This is a MIME preamble.",
 "--mix-001",
 'Content-Type: text/plain; charset="UTF-8"',
 "Content-Transfer-Encoding: quoted-printable",
 "",
 "Hello=20world=21",
 "--mix-001",
 'Content-Type: text/html; charset="UTF-8"',
 "",
 '<html><body><script>fetch("https://untrusted.invalid/tracker")</script><img src="https://untrusted.invalid/track.gif"/>Unsafe html</body></html>',
 "--mix-001",
 'Content-Type: application/pdf; name="invoice.pdf"',
 'Content-Disposition: attachment; filename="invoice.pdf"',
 "Content-Transfer-Encoding: base64",
 "",
 "JVBERi0xLjQ=",
 "--mix-001--",
 "",
].join("\r\n");

describe("Private text-only .eml archive inspector",()=>{
 it("reads UTF-8 encoded subject, MIME quoted printable body and metadata-only attachment",()=>{
  const parsed=inspectLocalEml(encoder.encode(sample));
  expect(parsed.subject).toBe("测试 archive");
  expect(parsed.from).toBe("Alice <alice@example.org>");
  expect(parsed.to).toContain("bob@example.org");
  expect(parsed.text).toContain("Hello world!");
  expect(parsed.text).not.toContain("untrusted.invalid");
  expect(parsed.text).not.toContain("<html>");
  expect(parsed.attachmentCount).toBe(1);
  expect(parsed.attachments[0]).toEqual({
   name:"invoice.pdf",contentType:"application/pdf",encodedBytes:12,
  });
  const summary=emlTextSummary(parsed);
  expect(summary).toContain("invoice.pdf");
  expect(summary).toContain("Plain text:\nHello world!");
  expect(summary).not.toContain("<script>");
 });
 it("decodes base64 plain body without ever rendering executable markup",()=>{
  const text="你好，local email!\nLine two.";
  const base64=btoa(String.fromCharCode(...encoder.encode(text)));
  const raw="From: sender@example.org\nSubject: Notice\n"+
   "Content-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: base64\n\n"+base64;
  const parsed=inspectLocalEml(encoder.encode(raw));
  expect(parsed.text).toBe(text);
  expect(parsed.attachments).toHaveLength(0);
 });
 it("preserves an HTML-only message as metadata with no automatically shown body",()=>{
  const raw=[
   "From: x@example.org","Subject: HTML only","Content-Type: text/html; charset=UTF-8",
   "","<img src='https://untrusted.invalid/'/><script>bad()</script>",
  ].join("\n");
  const parsed=inspectLocalEml(encoder.encode(raw));
  expect(parsed.text).toBe("");
  expect(parsed.subject).toBe("HTML only");
  expect(parsed.notice).toContain("ignored");
 });
 it("rejects malformed headers, excessive size and invalid base64",()=>{
  expect(()=>inspectLocalEml(new Uint8Array(10))).toThrow(/2 MB/);
  expect(()=>inspectLocalEml(new Uint8Array(2_000_001))).toThrow(/2 MB/);
  expect(()=>inspectLocalEml(encoder.encode("Not an RFC822 email without header delimiter"))).toThrow(/header/);
  expect(()=>inspectLocalEml(encoder.encode("From: a@example.org\nSubject: bad\n\n"+
   "Content-Transfer-Encoding: base64\n\n%%%%"))).not.toThrow(); // The invalid fragment is ordinary text, not a MIME header.
  const bad="From: a@example.org\nSubject: bad\nContent-Transfer-Encoding: base64\n\n%%%%";
  expect(()=>inspectLocalEml(encoder.encode(bad))).toThrow(/base64/);
 });
 it("rejects invalid multipart and very large decoded bodies safely",()=>{
  const noBoundary="From: x@example.org\nSubject: bad\nContent-Type: multipart/mixed\n\nno pieces";
  expect(()=>inspectLocalEml(encoder.encode(noBoundary))).toThrow(/boundary/);
  const tooLarge="From: x@example.org\nSubject: long\n\n"+"a".repeat(100_050);
  expect(()=>inspectLocalEml(encoder.encode(tooLarge))).toThrow(/100,000/);
 });
});
