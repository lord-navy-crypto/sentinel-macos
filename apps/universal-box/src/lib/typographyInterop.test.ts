import {describe,expect,it} from "vitest";
import JSZip from "jszip";
import {DEFAULT_TYPOGRAPHY,simplifySymbols,typographyText,typographyToDocx,typographyToHtml,typographyToClipboardHtml,extractOwnHtmlText} from "./typographyInterop";

describe("Offline formatted text and symbol-safe compatibility conversions",()=>{
 it("does not rewrite text or Unicode unless symbol simplification is explicitly selected",()=>{
  const source="“你好” — © ™ → ← ± ∞ ① 👩‍🔬\r\nSecond";
  expect(typographyText(source,DEFAULT_TYPOGRAPHY)).toBe(source);
  expect(simplifySymbols(source)).toBe('"你好" -- (c) (TM) -> <- +/- infinity ① 👩‍🔬\r\nSecond');
  expect(typographyText(source,{...DEFAULT_TYPOGRAPHY,asciiSymbols:true})).toBe(simplifySymbols(source));
 });
 it("escapes tags, scripts, quotes and HTML entities without adding external resources",()=>{
  const html=typographyToHtml('<script>alert("hello" & test)</script>\n你好 ™',{
   ...DEFAULT_TYPOGRAPHY,font:"Georgia",sizePt:18,bold:true,italic:true,underline:true,align:"center",
  });
  expect(html).toContain('&lt;script&gt;alert(&quot;hello&quot; &amp; test)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('font-family:"Georgia",sans-serif');
  expect(html).toContain('font-size:18pt');
  expect(html).toContain('text-align:center');
  expect(html).not.toMatch(/<link |<img |@import|fetch\(/u);
 });
 it("exports a real editable DOCX with CJK, font attributes and paragraph alignment",async()=>{
  const options={...DEFAULT_TYPOGRAPHY,font:"Times New Roman" as const,sizePt:14,bold:true,
   italic:true,underline:true,align:"right" as const};
  const bytes=await typographyToDocx("你好 World\r\nLine 2",options);
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  expect(zip.file("word/document.xml")).not.toBeNull();
  const xml=await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("你好 World");
  expect(xml).toContain("Line 2");
  expect(xml).toContain('w:sz w:val="28"');
  expect(xml).toContain('w:ascii="Times New Roman"');
  expect(xml).toMatch(/w:jc w:val="right"/u);
  expect(xml).toContain("<w:b");
  expect(xml).toContain("<w:i");
  expect(xml).toContain("<w:u");
 });
 it("reopens own exported HTML without loading or running arbitrary HTML",()=>{
  const text='<img src="https://example.invalid/track.png">\n中文 & “测试” 🚀';
  const html=typographyToHtml(text,{...DEFAULT_TYPOGRAPHY,font:"Georgia"});
  expect(extractOwnHtmlText(html)).toBe(text);
  expect(()=>extractOwnHtmlText('<html><body><p>Hello</p></body></html>'))
   .toThrow(/Only HTML previously exported/);
  expect(()=>extractOwnHtmlText(html.replace("&lt;img","<img")))
   .toThrow(/Unsupported markup/);
  expect(()=>extractOwnHtmlText(html.replace("&amp;","&madeup;")))
   .toThrow(/Unsupported markup or entity/);
 });
 it("produces a rich clipboard HTML fragment with a plain-text equivalent",()=>{
  const text='中文 <b>"Unsafe"</b> & arrow →';
  const options={...DEFAULT_TYPOGRAPHY,font:"Georgia" as const,sizePt:16,
   bold:true,italic:true,underline:true,align:"center" as const,asciiSymbols:true};
  const fragment=typographyToClipboardHtml(text,options);
  expect(fragment).toContain('font-size:16pt');
  expect(fragment).toContain('text-align:center');
  expect(fragment).toContain("&lt;b&gt;&quot;Unsafe&quot;&lt;/b&gt;");
  expect(fragment).toContain("arrow -&gt;");
  expect(fragment).not.toContain("<b>");
 });
 it("validates bad options and size/line limits before producing files",async()=>{
  const fail=async(text:string,opts=DEFAULT_TYPOGRAPHY)=>{
   await expect(typographyToDocx(text,opts)).rejects.toThrow();
  };
  await fail("");
  await fail("A".repeat(100_001));
  await fail("a\n".repeat(3000));
  await fail("hi",{...DEFAULT_TYPOGRAPHY,sizePt:7});
  await fail("hi",{...DEFAULT_TYPOGRAPHY,font:"Fake Font" as never});
 });
 it("keeps literal markup for TXT and plain symbol conversion while HTML remains escaped",()=>{
  const raw="<b>中文</b> ©\r\nLine 2";
  expect(typographyText(raw,DEFAULT_TYPOGRAPHY)).toBe(raw);
  const html=typographyToHtml(raw,{...DEFAULT_TYPOGRAPHY,asciiSymbols:true});
  expect(html).toContain("&lt;b&gt;中文&lt;/b&gt; (c)\nLine 2");
  expect(html).not.toContain("<b>中文</b>");
 });
});
