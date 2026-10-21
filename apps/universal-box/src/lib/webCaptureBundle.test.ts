import {describe,expect,it} from "vitest";
import fs from "node:fs/promises";
import {createWebCaptureZip,validateCompanionManifest,WEB_CAPTURE_VERSION} from "./webCaptureBundle";
import JSZip from "jszip";

const readAsset=(name:"manifest.json"|"popup.html"|"popup.js")=>
 fs.readFile(new URL("../../public/web-capture/"+name,import.meta.url),"utf8");
describe("Bundled free Web Capture companion",()=>{
 it("uses the unmodified permission-limited MV3 release",async()=>{
  const raw=await readAsset("manifest.json");
  const manifest=JSON.parse(raw);
  expect(manifest.version).toBe(WEB_CAPTURE_VERSION);
  expect(manifest.permissions).toEqual(["activeTab","scripting","clipboardWrite"]);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.background).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(()=>validateCompanionManifest(raw)).not.toThrow();
 });
 it("makes a real installable extension ZIP with correct browser startup resources",async()=>{
  const bytes=await createWebCaptureZip(readAsset);
  const archive=await JSZip.loadAsync(bytes);
  expect(Object.keys(archive.files).sort()).toEqual(["manifest.json","popup.html","popup.js"].sort());
  const meta=JSON.parse(await archive.file("manifest.json")!.async("string"));
  expect(meta.action.default_popup).toBe("popup.html");
  expect(await archive.file("popup.js")!.async("string")).toContain("function capturePage(");
 });
 it("rejects unexpected broad host and background permissions",()=>{
  const manifest={manifest_version:3,version:WEB_CAPTURE_VERSION,permissions:["activeTab","scripting","clipboardWrite"],
    host_permissions:["<all_urls>"]};
  expect(()=>validateCompanionManifest(JSON.stringify(manifest))).toThrow(/broad/);
  delete (manifest as {host_permissions?:string[]}).host_permissions;
  expect(()=>validateCompanionManifest(JSON.stringify({...manifest,background:{service_worker:"s.js"}})))
   .toThrow(/background/);
 });
 it("refuses to export damaged or missing resources",async()=>{
  await expect(createWebCaptureZip(async name=>name==="popup.js"?"":readAsset(name))).rejects.toThrow(/Missing/);
 });
});
