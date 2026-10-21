/** Build a user-exportable Chromium extension from assets shipped in Universal Box.
 * No remote downloads or browser installation, no new permissions.
 */
import JSZip from "jszip";
export const WEB_CAPTURE_VERSION="0.3.1";
export const WEB_CAPTURE_FILES=["manifest.json","popup.html","popup.js"] as const;
type AssetName=typeof WEB_CAPTURE_FILES[number];

export function validateCompanionManifest(raw:string):void{
 const m=JSON.parse(raw) as {
   manifest_version?:unknown;version?:unknown;permissions?:unknown;host_permissions?:unknown;
   background?:unknown;content_scripts?:unknown;
 };
 if(m.manifest_version!==3||m.version!==WEB_CAPTURE_VERSION)
   throw Error("Bundled Web Capture version is inconsistent with Universal Box.");
 const permissions=m.permissions;
 if(!Array.isArray(permissions)||permissions.length!==3||
    !["activeTab","scripting","clipboardWrite"].every(x=>permissions.includes(x))||
    permissions.some((x:unknown)=>!["activeTab","scripting","clipboardWrite"].includes(String(x))))
   throw Error("Unexpected browser extension permissions; refusing to package.");
 if(m.host_permissions||m.background||m.content_scripts)
   throw Error("Unexpected background or broad website access in bundled extension.");
}
export async function createWebCaptureZip(loader:(name:AssetName)=>Promise<string>):Promise<Uint8Array>{
 const files=new Map<AssetName,string>();
 for(const name of WEB_CAPTURE_FILES){
  const text=await loader(name);
  if(!text||text.length>100_000)throw Error("Missing or unusually large bundled Web Capture asset: "+name);
  files.set(name,text);
 }
 validateCompanionManifest(files.get("manifest.json")!);
 const html=files.get("popup.html")!;
 if(!html.includes('src="popup.js"')||!html.includes('id="tableSelect"'))
  throw Error("The companion popup is incomplete.");
 const script=files.get("popup.js")!;
 if(!script.includes("function capturePage(")||!script.includes("async function perform("))
  throw Error("The embedded browser capture engine is incomplete.");
 const zip=new JSZip();
 for(const [name,text] of files)zip.file(name,text);
 return zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
}
export async function createOfflineCompanionBundle():Promise<Uint8Array>{
 return createWebCaptureZip(async name=>{
  const response=await fetch("/web-capture/"+name,{cache:"no-store"});
  if(!response.ok)throw Error("Local Web Capture asset is missing: "+name);
  return response.text();
 });
}
