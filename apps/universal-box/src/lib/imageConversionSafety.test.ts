import {describe,expect,it} from "vitest";
import {sniffImageMime,verifyImageSource,verifyImageOutput,validateImageCanvas} from "./imageConversionSafety";
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13]);
const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70]);
const webp=(animated=false)=>{
 const b=new Uint8Array(30);
 b.set([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88],0);
 b[20]=animated?2:0;
 return b;
};
describe("Real input and output image format compatibility gates",()=>{
 it("recognizes actual magic bytes, rejects file signature spoofing and unknown formats",()=>{
  expect(sniffImageMime(png)).toBe("image/png");
  expect(sniffImageMime(jpeg)).toBe("image/jpeg");
  expect(sniffImageMime(webp())).toBe("image/webp");
  expect(sniffImageMime(new TextEncoder().encode("<svg></svg>"))).toBe(null);
  expect(verifyImageSource("sample.png","image/png",png)).toBe("image/png");
  expect(verifyImageSource("sample.JPEG","image/jpeg",jpeg)).toBe("image/jpeg");
  expect(()=>verifyImageSource("photo.jpg","image/jpeg",png)).toThrow(/signature/);
  expect(()=>verifyImageSource("fake.webp","image/png",webp())).toThrow(/MIME/);
  expect(()=>verifyImageSource("photo.gif","image/gif",png)).toThrow(/Unsupported/);
 });
 it("rejects animated WebP and refuses output with the wrong encoding",()=>{
  expect(()=>verifyImageSource("clip.webp","image/webp",webp(true))).toThrow(/Animated WebP/);
  expect(verifyImageSource("still.webp","image/webp",webp())).toBe("image/webp");
  expect(()=>verifyImageOutput("image/jpeg",png)).toThrow(/requested image format/);
  expect(()=>verifyImageOutput("image/webp",jpeg)).toThrow(/requested image format/);
  expect(()=>verifyImageOutput("image/png",png)).not.toThrow();
 });
 it("rejects unsafe dimensions before creating large canvas",()=>{
  expect(()=>validateImageCanvas(4000,4000)).not.toThrow();
  expect(()=>validateImageCanvas(4001,4000)).toThrow(/16 million/);
  expect(()=>validateImageCanvas(0,120)).toThrow(/Invalid/);
  expect(()=>validateImageCanvas(1.5,100)).toThrow(/Invalid/);
 });
});
