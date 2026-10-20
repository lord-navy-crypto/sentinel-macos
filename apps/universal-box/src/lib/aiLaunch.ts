/** Model/website launcher. This is NOT a native local inference runtime. */
export const AI_LAUNCH_PREF="universal-box-ap-ai-url-v1";
export const HF_SPACES="https://huggingface.co/spaces";
export const HF_MODELS="https://huggingface.co/models?pipeline_tag=text-generation";
export type WebsiteAIConfig={url:string};
export function validateAiWebsiteUrl(raw:string):string{
 const normalized=raw.trim();
 if(!normalized||normalized.length>500)throw Error("Enter a website URL shorter than 500 characters.");
 let url:URL;
 try{url=new URL(normalized);}catch{throw Error("Enter an absolute HTTPS URL, for example https://your-site.example/easy-local-ai");}
 if(url.protocol!=="https:"||url.username||url.password||url.port)
   throw Error("Only standard HTTPS website URLs without credentials or custom ports are accepted.");
 if(url.hostname==="localhost"||url.hostname.endsWith(".localhost")||url.hostname==="127.0.0.1")
   throw Error("This launcher is for a publicly reachable HTTPS website, not a local service.");
 if(url.search||url.hash)throw Error("Do not include URL parameters or fragments; they can transmit sensitive text.");
 const parts=url.pathname.split("/").filter(Boolean);
 if(parts.length>12)throw Error("The website path is unusually long.");
 // Select only the website origin; never attach application content or prompts to URL.
 return url.origin+"/"+parts.map(encodeURIComponent).join("/");
}
export function aiWebsiteLaunchUrl(raw:string):string{
 const parsed=new URL(validateAiWebsiteUrl(raw));
 parsed.pathname=parsed.pathname.replace(/\/$/u,"")+"/easy-local-ai";
 return parsed.toString();
}
/** Accept either the site home or the /easy-local-ai page, but never double-append. */
export function resolveAiLaunch(raw:string):string{
 const value=validateAiWebsiteUrl(raw);
 if(/\/easy-local-ai\/?$/u.test(value))return value;
 return aiWebsiteLaunchUrl(value);
}
export function safeReadAiUrl(storage:{getItem:(key:string)=>string|null}):string{
 try{const raw=storage.getItem(AI_LAUNCH_PREF);return raw?validateAiWebsiteUrl(raw):"";}
 catch{return "";}
}
