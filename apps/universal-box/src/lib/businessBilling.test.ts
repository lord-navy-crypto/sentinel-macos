import {describe,it,expect} from "vitest";
import {BILLING_EXAMPLE,BILLING_HEADERS,formatCents,parseBusinessBilling,pdfLatinCompatible} from "./businessBilling";
const seller={name:"Example Studio",address:"1 Main St",taxId:"REG-002",paymentDetails:"Bank transfer"};
const base=BILLING_HEADERS.join(",");
describe("Business billing planning, grouping and exact cents",()=>{
 it("groups repeated numbers and produces genuine two-document previews",()=>{
  const result=parseBusinessBilling(BILLING_EXAMPLE,seller);
  expect(result.documents).toHaveLength(2);
  expect(result.lineCount).toBe(3);
  const [invoice,quote]=result.documents;
  expect(invoice.id).toBe("INV-001");expect(invoice.lines).toHaveLength(2);
  expect(invoice.subtotalCents).toBe(32550);
  expect(invoice.taxCents).toBe(0);
  expect(quote.totalCents).toBe(24000);
  expect(result.summaryCsv).toContain("325.50");
  expect(result.summaryCsv).toContain("240.00");
  expect(pdfLatinCompatible(result,invoice)).toBe(true);
 });
 it("does arithmetic in cents and rounds tax independently per line",()=>{
  const input=base+"\nA001,invoice,One Customer,One Road,2026-10-21,2026-11-01,USD,,Small service,3,0.05,7.50";
  const one=parseBusinessBilling(input,seller).documents[0];
  expect(one.subtotalCents).toBe(15);
  expect(one.lines[0].taxBasisPoints).toBe(750);
  expect(one.taxCents).toBe(1);
  expect(one.totalCents).toBe(16);
  expect(formatCents(one.totalCents)).toBe("0.16");
 });
 it("rejects inconsistent repeated document numbers before any ZIP generation",()=>{
  const bad=BILLING_EXAMPLE.replace("Report and handoff","Report and handoff").replace(
   "INV-001,invoice,Northwind Studio,10 Market Lane,2026-10-21,2026-11-04,EUR,PO-101,Report and handoff",
   "INV-001,invoice,Another Client,10 Market Lane,2026-10-21,2026-11-04,EUR,PO-101,Report and handoff");
  expect(()=>parseBusinessBilling(bad,seller)).toThrow(/conflicting header/);
 });
 it("rejects dates, invalid decimals, duplicate columns, unsafe amounts and negative quantities",()=>{
  const row="A001,quote,Client,Street,2026-10-21,2026-11-01,EUR,,Service,1,12.00,0";
  expect(()=>parseBusinessBilling(base+"\n"+row.replace("2026-11-01","2026-02-30"),seller)).toThrow(/real YYYY-MM-DD/);
  expect(()=>parseBusinessBilling(base+"\n"+row.replace("12.00","12.001"),seller)).toThrow(/up to 2 decimal/);
  expect(()=>parseBusinessBilling(base+"\n"+row.replace(",1,12.00",",-2,12.00"),seller)).toThrow(/positive/);
  expect(()=>parseBusinessBilling(base+"\n"+row.replace(",12.00,0",",12.00,101"),seller)).toThrow(/100%/);
  expect(()=>parseBusinessBilling(base.replace("client_address","client"),seller)).toThrow(/headings/);
 });
 it("supports Chinese Unicode editable-Word data without a broken PDF",()=>{
  const cn=base+"\nCN-01,quote,北京客户,北京市,2026-10-21,2026-11-01,CNY,,软件研发,2,100.00,0";
  const batch=parseBusinessBilling(cn,{...seller,name:"中国工作室"});
  expect(batch.documents[0].totalCents).toBe(20000);
  expect(pdfLatinCompatible(batch,batch.documents[0])).toBe(false);
 });
 it("prevents spreadsheet formulas from activating in exported summary",()=>{
  const formula=base+'\nF-001,invoice,"=cmd!A0",Street,2026-10-21,2026-11-01,EUR,,Service,1,10.00,0';
  const report=parseBusinessBilling(formula,seller).summaryCsv;
  expect(report).toContain("\"'=cmd!A0\"");
 });
});
