import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Sentinel Box public-brand contract",()=>{
 it("uses Sentinel Box in macOS title, DMG name and browser tab",()=>{
  const tauri=JSON.parse(read("src-tauri/tauri.conf.json")) as {
   productName:string;identifier:string;app:{windows:{title:string}[]};
   bundle:{shortDescription:string;longDescription:string};
  };
  expect(tauri.productName).toBe("Sentinel Box");
  expect(tauri.app.windows[0].title).toBe("Sentinel Box");
  expect(tauri.bundle.longDescription).toContain("Sentinel Box");
  expect(read("index.html")).toContain("<title>Sentinel Box · Free Offline Tools</title>");
 });
 it("retains the existing native bundle ID and legacy storage keys for safe upgrades",()=>{
  const tauri=JSON.parse(read("src-tauri/tauri.conf.json")) as {identifier:string};
  expect(tauri.identifier).toBe("com.lordnavycrypto.dailydesk");
  const app=read("src/App.tsx");
  expect(app).toContain('className="brand-name">Sentinel Box');
  expect(app).toContain('className="brand-mark">S</span>');
  expect(app).toContain('getItem("universal-box-theme")');
  expect(read("src/lib/nativeStorage.ts")).toContain("Daily Desk v2 workspace");
 });
 it("aligns public package/readmes and release script, preserving historical tags",()=>{
  const pkg=JSON.parse(read("package.json")) as {name:string;description:string};
  const lock=JSON.parse(read("package-lock.json")) as {name:string;packages:{"":{name:string}}};
  expect(pkg.name).toBe("sentinel-box");
  expect(lock.name).toBe("sentinel-box");
  expect(lock.packages[""].name).toBe("sentinel-box");
  expect(read("README.md")).toContain("Productivity Software — Sentinel Box:");
  const release=read("../../.github/workflows/release-daily-desk.yml");
  expect(release).toContain('APP="$MOUNT/Sentinel Box.app"');
  expect(release).toContain('      - "sentinel-box-v*"');
  expect(release).toContain('      - "universal-box-v*"');
  const ci=read("../../.github/workflows/test-daily-desk.yml");
  expect(ci).toContain('APP="$MOUNT/Sentinel Box.app"');
 });
});
