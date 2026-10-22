import {describe,it,expect} from "vitest";
import {parseBookmarkHtml,bookmarkDeduplicate,bookmarksCsv,bookmarksMarkdown,bookmarkDomainSummary,bookmarkDuplicateGroups} from "./bookmarkImport";

const exported=`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
 <DT><H3>Work</H3><DL><p>
 <DT><A HREF="https://example.com/docs?utm_source=mail&amp;id=7">Research &amp; notes</A>
 <DT><A HREF="https://example.com/docs?utm_source=mail&amp;id=7">Research &amp; notes - copy</A>
 <DT><A HREF='https://docs.example.org/start#section'>Project guide</A>
 <DT><A HREF="javascript:alert(1)">Danger</A>
 <DT><A HREF="file:///Users/private.txt">Local file</A>
 <DT><A HREF="https://user:pass@example.net/">Authenticated</A>
 </DL>
</DL>`;

describe("Browser bookmarks import is local and inert",()=>{
 it("reads exported HTML anchors, decodes entities, finds duplicate full URLs",()=>{
  const report=parseBookmarkHtml(exported);
  expect(report.items).toHaveLength(3);
  expect(report.skipped).toBe(3);
  expect(report.duplicates).toBe(1);
  expect(report.items[0].title).toBe("Research & notes");
  expect(report.items[0].url).toBe("https://example.com/docs?utm_source=mail&id=7");
  expect(report.items[2].domain).toBe("docs.example.org");
  expect(report.items[2].url).toContain("#section");
 });
 it("does not silently delete duplicates and only removes duplicates on request",()=>{
  const report=parseBookmarkHtml(exported);
  expect(report.items).toHaveLength(3);
  const groups=bookmarkDuplicateGroups(report.items);
  expect(groups).toHaveLength(1);
  expect(groups[0].count).toBe(2);
  expect(groups[0].titles).toEqual(["Research & notes","Research & notes - copy"]);
  expect(groups[0].url).toBe("https://example.com/docs?utm_source=mail&id=7");
  const unique=bookmarkDeduplicate(report.items);
  expect(unique).toHaveLength(2);
  expect(unique.map(x=>x.title)).toEqual(["Research & notes","Project guide"]);
  expect(report.items).toHaveLength(3);
  expect(bookmarkDomainSummary(report.items)[0]).toEqual({domain:"example.com",count:2});
 });
 it("produces spreadsheet-safe CSV and valid Markdown without opening links",()=>{
  const report=parseBookmarkHtml(`<DT><A HREF="https://example.com/a">=2+3</A>
  <DT><A HREF="https://example.net/b?x=1&amp;y=2">Hi, "you"</A>`);
  const csv=bookmarksCsv(report.items),markdown=bookmarksMarkdown(report.items);
  expect(csv.startsWith("\uFEFFindex,title,url,domain\r\n")).toBe(true);
  expect(csv).toContain('"\'=2+3"');
  expect(csv).toContain('"Hi, ""you"""');
  expect(markdown).toContain("- [=2+3](<https://example.com/a>)");
  expect(markdown).toContain("https://example.net/b?x=1&y=2");
 });
 it("treats malicious HTML as inert text and rejects unsupported/empty sources",()=>{
  const malicious=`<script>throw Error("DO NOT RUN")</script>
   <IMG SRC="https://remote.example/track.png">
   <A HREF="data:text/html,Hi">Bad</A>
   <A HREF="https://safe.example/">Safe</A>`;
  const report=parseBookmarkHtml(malicious);
  expect(report.items.map(x=>x.title)).toEqual(["Safe"]);
  expect(report.skipped).toBe(1);
  expect(()=>parseBookmarkHtml("<html>No anchors here</html>")).toThrow(/No HTTP/);
  expect(()=>parseBookmarkHtml("x".repeat(2_000_001))).toThrow(/2,000,000/);
  expect(()=>parseBookmarkHtml("")).toThrow(/2,000,000/);
 });
 it("rejects more than 5,000 HTTP bookmarks and prevents empty exports",()=>{
  const many=Array.from({length:5001},(_,i)=>`<A HREF="https://example.com/page-${i}">Item</A>`).join("\n");
  expect(()=>parseBookmarkHtml(many)).toThrow(/5,000/);
  expect(()=>bookmarksCsv([])).toThrow(/No valid/);
  expect(()=>bookmarksMarkdown([])).toThrow(/No valid/);
 });
});
