import {describe,it,expect} from "vitest";
import {
 validateFeedUrl,uniqueFeedEntries,filterFeedEntries,feedDomainCounts,
 feedArchiveCsv,feedArchiveMarkdown, type FeedArchive,type FeedEntry,
} from "./offlineFeedArchive";

const entries:FeedEntry[]=[
 {title:"Release Notes",url:"https://example.org/posts?lang=en",domain:"example.org",date:"2026-10-22",summary:"Useful update"},
 {title:"Release copy",url:"https://example.org/posts?lang=en",domain:"example.org",date:"",summary:"Copy"},
 {title:"=HYPERLINK(1)",url:"https://news.example.net/archive?x=1&y=2",domain:"news.example.net",date:"",summary:"A, \"quoted\" item"},
];
const report:FeedArchive={sourceTitle:"Tech & Notes",format:"RSS",entries,duplicates:1,skipped:2};
describe("Offline exported RSS/Atom archive helpers",()=>{
 it("accepts only absolute HTTPS or HTTP links without embedded user credentials",()=>{
  expect(validateFeedUrl("https://example.org/a")).toEqual({url:"https://example.org/a",domain:"example.org"});
  expect(validateFeedUrl("http://news.example/a?x=1")).toEqual({url:"http://news.example/a?x=1",domain:"news.example"});
  for(const url of ["javascript:alert(1)","file:///etc/passwd","data:text/html,abc","/relative",
   "https://user:secret@example.org/private","ftp://example.org/archive"])
    expect(validateFeedUrl(url)).toBeNull();
  expect(validateFeedUrl("x".repeat(2100))).toBeNull();
 });
 it("never removes duplicates by default; optional unique export preserves input",()=>{
  const unique=uniqueFeedEntries(entries);
  expect(unique).toHaveLength(2);
  expect(unique[0].title).toBe("Release Notes");
  expect(entries).toHaveLength(3);
  expect(feedDomainCounts(entries)).toEqual([
   {domain:"example.org",count:2},{domain:"news.example.net",count:1},
  ]);
 });
 it("filters user-visible results by title, domain, summary or url independently of export",()=>{
  expect(filterFeedEntries(entries,"release")).toHaveLength(2);
  expect(filterFeedEntries(entries,"useful update")).toHaveLength(1);
  expect(filterFeedEntries(entries,"news.example.net")).toHaveLength(1);
  expect(filterFeedEntries(entries,"")).toHaveLength(3);
 });
 it("exports actual CSV rows with formula and quote safety, plus Markdown hyperlinks",()=>{
  const csv=feedArchiveCsv(entries);
  expect(csv.startsWith("\uFEFFindex,title,url,domain,date,summary\r\n")).toBe(true);
  expect(csv).toContain('"\'=HYPERLINK(1)"');
  expect(csv).toContain('"A, ""quoted"" item"');
  expect(csv).toContain('"https://news.example.net/archive?x=1&y=2"');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
  const md=feedArchiveMarkdown(report,uniqueFeedEntries(entries));
  expect(md).toContain("# Tech &amp; Notes");
  expect(md).toContain("[Release Notes](<https://example.org/posts?lang=en>)");
  expect(md).toContain("=HYPERLINK(1)");
  expect(md).not.toContain("Release copy");
  expect(feedArchiveCsv([])).toContain("index,title,url");
 });
 it("refuses silent export truncation when archive has too many entries",()=>{
  expect(()=>feedArchiveCsv(Array.from({length:1001},()=>entries[0]))).toThrow(/1,000/);
 });
});
