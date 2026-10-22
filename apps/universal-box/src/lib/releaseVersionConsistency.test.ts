import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

function readProjectFile(relative:string):string{
 return readFileSync(fileURLToPath(new URL(relative,import.meta.url)),"utf8");
}
type PackageVersion={name:string;version:string;packages?:Record<string,{version?:string}>};
type TauriVersion={productName:string;version:string;identifier:string};

describe("Desktop release metadata consistency",()=>{
 const pkg=JSON.parse(readProjectFile("../../package.json")) as PackageVersion;
 const lock=JSON.parse(readProjectFile("../../package-lock.json")) as PackageVersion;
 const tauri=JSON.parse(readProjectFile("../../src-tauri/tauri.conf.json")) as TauriVersion;
 const cargo=readProjectFile("../../src-tauri/Cargo.toml");
 const cargoVersion=/^version\s*=\s*"([^"]+)"/mu.exec(cargo)?.[1]??"";

 it("never mixes package.json, npm lockfile, Tauri and Rust release versions",()=>{
  expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/iu);
  expect(lock.version).toBe(pkg.version);
  expect(lock.packages?.[""]?.version).toBe(pkg.version);
  expect(tauri.version).toBe(pkg.version);
  expect(cargoVersion).toBe(pkg.version);
 });
 it("keeps the published app identity and native package name stable",()=>{
  expect(pkg.name).toBe("sentinel-box");
  expect(tauri.productName).toBe("Sentinel Box");
  expect(tauri.identifier).toBe("com.lordnavycrypto.dailydesk");
 });
});
