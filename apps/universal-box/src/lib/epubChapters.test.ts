import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {inspectEpub,epubChapterCsv,epubChapterTxt} from "./epubChapters";

async function bookZip(options:{encrypted?:boolean;traversal?:boolean;missingSpine?:boolean}={}){
 const zip=new JSZip();
 zip.file("mimetype","application/epub+zip");
 zip.file("META-INF/container.xml",'<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
 const first=options.traversal?"../../../escape.xhtml":"Text/first.xhtml";
 zip.file("OEBPS/content.opf",`<?xml version="1.0"?>
  <package><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">My &amp; Book</dc:title></metadata>
  <manifest><item id="one" href="${first}" media-type="application/xhtml+xml"/>
  <item id="two" href="Text/second.xhtml" media-type="application/xhtml+xml"/></manifest>
  ${options.missingSpine?"":'<spine><itemref idref="one"/><itemref idref="two"/></spine>'}</package>`);
 zip.file("OEBPS/Text/first.xhtml",'<html><head><title>Hidden metadata</title><style>body{color:red}</style></head><body><h1>第一章</h1><p>Hello &amp; welcome</p><script>callNetwork()</script><p>Safe <b>text</b></p></body></html>');
 zip.file("OEBPS/Text/second.xhtml",'<html><body><h2>第二章</h2><p>Chapter 2 line</p><img src="https://untrusted.example/image.png"/></body></html>');
 if(options.encrypted)zip.file("META-INF/encryption.xml","<encryption/>");
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
async function read(input:Uint8Array){
 return inspectEpub({name:"sample.epub",size:input.length,arrayBuffer:async()=>Uint8Array.from(input).buffer});
}
describe("Safe offline EPUB reading",()=>{
 it("follows the actual spine, reads UTF-8 Chinese, ignores active HTML and exports plain text",async()=>{
  const result=await read(await bookZip());
  expect(result.title).toBe("My & Book");
  expect(result.chapters.map(x=>x.title)).toEqual(["第一章","第二章"]);
  expect(result.chapters.map(x=>x.path)).toEqual(["OEBPS/Text/first.xhtml","OEBPS/Text/second.xhtml"]);
  expect(result.chapters[0].text).toContain("Hello & welcome");
  expect(result.chapters[0].text).not.toContain("callNetwork");
  expect(result.chapters[0].text).not.toContain("body{color");
  expect(result.chapters[1].text).toContain("Chapter 2 line");
  expect(result.chapters[1].text).not.toContain("https://");
  expect(epubChapterTxt(result,1)).toContain("第二章\n\n第二章");
  expect(epubChapterCsv(result)).toContain('"OEBPS/Text/second.xhtml"');
  expect(()=>epubChapterTxt(result,12)).toThrow(/valid/);
 });
 it("never handles encrypted books or EPUB path escapes",async()=>{
  await expect(read(await bookZip({encrypted:true}))).rejects.toThrow(/DRM/);
  await expect(read(await bookZip({traversal:true}))).rejects.toThrow(/escapes archive/);
  await expect(read(await bookZip({missingSpine:true}))).rejects.toThrow(/reading order/);
 });
 it("validates file extension, bytes, and mimetype",async()=>{
  const data=await bookZip();
  await expect(inspectEpub({name:"file.zip",size:data.length,arrayBuffer:async()=>data.buffer})).rejects.toThrow(/Select one EPUB/);
  await expect(inspectEpub({name:"file.epub",size:12_000_001,arrayBuffer:async()=>data.buffer})).rejects.toThrow(/12 MB/);
  const broken=new JSZip();
  broken.file("other","wrong");broken.file("a","x");broken.file("b","y");
  const bytes=await broken.generateAsync({type:"uint8array"});
  await expect(read(bytes)).rejects.toThrow(/mimetype/);
 });
});
