"use strict";
/** Fail closed before publishing an installer. No GitHub API, npm downloads or network. */
const fs=require("node:fs");
const path=require("node:path");

const RELEASE_TAG=/^(?:daily-desk|universal-box|sentinel-box)-v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/u;
const SEMVER=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

function parseCargoPackageVersion(content){
 const section=/^\[package\]\s*$([\s\S]*?)(?=^\[|\s*$)/mu.exec(content);
 if(!section)throw Error("Cargo.toml has no [package] section.");
 const m=/^version\s*=\s*"([^"]+)"\s*$/mu.exec(section[1]);
 if(!m)throw Error("Cargo.toml [package] has no version.");
 return m[1];
}
function validateReleaseMetadata({packageJson,lockJson,tauriJson,cargoToml,refType="",refName=""}){
 const version=packageJson?.version;
 if(typeof version!=="string"||!SEMVER.test(version))
  throw Error("package.json has no valid release version.");
 const actual=[
  ["package-lock.json",lockJson?.version],
  ["package-lock root",lockJson?.packages?.[""]?.version],
  ["tauri.conf.json",tauriJson?.version],
  ["Cargo.toml",parseCargoPackageVersion(cargoToml)],
 ];
 for(const [name,candidate] of actual){
  if(candidate!==version)throw Error(name+" version "+String(candidate)+" must equal "+version+".");
 }
 if(packageJson.name!=="sentinel-box"||tauriJson.productName!=="Sentinel Box"||
    tauriJson.identifier!=="com.lordnavycrypto.dailydesk")
  throw Error("Release application identity changed unexpectedly.");
 if(refType==="tag"){
  const found=RELEASE_TAG.exec(refName);
  if(!found)throw Error("Release tag is malformed or has an unsupported prefix: "+refName);
  if(found[1]!==version)
   throw Error("Release tag "+refName+" does not match package version "+version+".");
 }else if(refType!==""&&refType!=="branch"){
  throw Error("Unexpected release reference type: "+refType);
 }
 return {version,refType,refName};
}
function inspectSource(root,{refType="",refName=""}={}){
 const readJson=(name)=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
 return validateReleaseMetadata({
  packageJson:readJson("package.json"),
  lockJson:readJson("package-lock.json"),
  tauriJson:readJson("src-tauri/tauri.conf.json"),
  cargoToml:fs.readFileSync(path.join(root,"src-tauri/Cargo.toml"),"utf8"),
  refType,refName,
 });
}
if(require.main===module){
 try{
  const result=inspectSource(path.resolve(__dirname,".."),{
   refType:process.env.GITHUB_REF_TYPE||"",
   refName:process.env.GITHUB_REF_NAME||"",
  });
  process.stdout.write("Release preflight: OK; version "+result.version+
   (result.refType==="tag"?", tag "+result.refName:"; no release tag requested")+"\n");
 }catch(error){
  process.stderr.write("Release preflight: FAILED — "+String(error instanceof Error?error.message:error)+"\n");
  process.exitCode=1;
 }
}
module.exports={parseCargoPackageVersion,validateReleaseMetadata,inspectSource};
