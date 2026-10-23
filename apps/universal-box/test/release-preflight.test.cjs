"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {parseCargoPackageVersion,validateReleaseMetadata,inspectSource}=
  require("../scripts/release-preflight.cjs");

const root=path.join(__dirname,"..");
const base=Object.freeze({
 packageJson:{name:"sentinel-box",version:"0.36.0"},
 lockJson:{version:"0.36.0",packages:{"":{version:"0.36.0"}}},
 tauriJson:{productName:"Sentinel Box",version:"0.36.0",
  identifier:"com.lordnavycrypto.dailydesk"},
 cargoToml:'[package]\nname = "daily-desk"\nversion = "0.36.0"\n\n[dependencies]\nserde = "1"\n',
});
function withChange(field,newValue){
 return {...base,[field]:newValue};
}

test("release source metadata is consistent across all four project files",()=>{
 const inspected=inspectSource(root);
 assert.equal(inspected.version,"0.36.0");
 assert.deepEqual(validateReleaseMetadata({...base,refType:"tag",refName:"sentinel-box-v0.36.0"}),
  {version:"0.36.0",refType:"tag",refName:"sentinel-box-v0.36.0"});
});
test("release tags must exactly match the actual version, including legacy prefix aliases",()=>{
 for(const prefix of ["sentinel-box","universal-box","daily-desk"]){
  assert.equal(validateReleaseMetadata({...base,refType:"tag",
   refName:prefix+"-v0.36.0"}).version,"0.36.0");
 }
 for(const refName of ["sentinel-box-v0.90.0","sentinel-box-v0.36",
   "sentinel-box-0.36.0","unknown-v0.36.0","sentinel-box-v0.36.0-extra"]){
  assert.throws(()=>validateReleaseMetadata({...base,refType:"tag",refName}),
   /Release tag/);
 }
 assert.equal(validateReleaseMetadata({...base,refType:"branch",refName:"main"}).version,
   "0.36.0");
 assert.throws(()=>validateReleaseMetadata({...base,refType:"pull_request",refName:"123"}),
  /reference type/);
});
test("rejects stale package lock, root lock package, Rust and Tauri independently",()=>{
 assert.throws(()=>validateReleaseMetadata(withChange("lockJson",
  {version:"0.35.0",packages:{"":{version:"0.36.0"}}})),/package-lock.json/);
 assert.throws(()=>validateReleaseMetadata(withChange("lockJson",
  {version:"0.36.0",packages:{"":{version:"0.35.0"}}})),/package-lock root/);
 assert.throws(()=>validateReleaseMetadata(withChange("tauriJson",
  {...base.tauriJson,version:"0.35.0"})),/tauri.conf.json/);
 assert.throws(()=>validateReleaseMetadata(withChange("cargoToml",
  base.cargoToml.replace('0.36.0','0.35.0'))),/Cargo.toml version/);
 assert.throws(()=>validateReleaseMetadata(withChange("packageJson",
  {...base.packageJson,version:"development"})),/valid release version/);
});
test("Rust [package] version parser ignores dependency versions and prevents missing metadata",()=>{
 assert.equal(parseCargoPackageVersion(base.cargoToml),"0.36.0");
 assert.throws(()=>parseCargoPackageVersion('[dependencies]\nversion = "9.0.0"\n'),
  /\[package\]/);
 assert.throws(()=>parseCargoPackageVersion("[package]\nname = \"app\"\n"),
  /no version/);
});
test("refuses identity changes to protect app bundle identifier",()=>{
 assert.throws(()=>validateReleaseMetadata(withChange("tauriJson",
  {...base.tauriJson,identifier:"com.other.app"})),/identity changed/);
});
test("real release workflow consumes the artifacts it produces and checks two DMGs",()=>{
 const workflow=fs.readFileSync(path.join(root,"..","..",".github","workflows",
  "release-daily-desk.yml"),"utf8");
 assert.match(workflow,/name:\s*SentinelBox-\$\{\{ matrix\.target \}\}/u);
 assert.match(workflow,/pattern:\s*SentinelBox-\*/u);
 assert.doesNotMatch(workflow,/pattern:\s*UniversalBox-\*/u);
 assert.match(workflow,/needs:\s*\[verify-release-source, build-macos\]/u);
 assert.match(workflow,/node scripts\/release-preflight\.cjs/u);
 assert.match(workflow,/\$\{#dmgs\[@\]\}.*-ne 2/u);
 assert.match(workflow,/sha256sum -c SHA256SUMS\.txt/u);
 assert.match(workflow,/draft:\s*true/u);
});
