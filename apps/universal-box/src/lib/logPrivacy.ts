/** Local-only preview redaction. Not a guarantee of anonymity: review output before sharing. */
export type LogPrivacyOptions={secrets:boolean;userPaths:boolean;emails:boolean;ipv4:boolean};
export const DEFAULT_LOG_PRIVACY:LogPrivacyOptions={secrets:true,userPaths:true,emails:true,ipv4:false};
export type PrivacyPreview={text:string;replacements:number;categories:string[]};
export function scrubDiagnosticText(source:string,opts:LogPrivacyOptions=DEFAULT_LOG_PRIVACY):PrivacyPreview{
 if(source.length>200_000)throw Error("Diagnostic text exceeds the 200,000 character limit");
 let text=source;
 let replacements=0;
 const categories:string[]=[];
 const apply=(name:string,pattern:RegExp,rewrite:(...matches:string[])=>string)=>{
  let count=0;
  text=text.replace(pattern,(whole,...args)=>{
   count++;return rewrite(whole,...args);
  });
  if(count){replacements+=count;categories.push(name);}
 };
 if(opts.secrets){
  apply("private keys",/-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/gi,
   ()=>"[PRIVATE KEY REMOVED]");
  apply("authorization headers",/(\b(?:authorization|proxy-authorization)\s*:\s*)[^\r\n]+/gi,(_whole,prefix)=>prefix+"[REDACTED]");
  apply("credentials",/((?:["']?)(?:x-sentinel-token|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)(?:["']?)\s*[:=]\s*)("[^"\r\n]{1,500}"|'[^'\r\n]{1,500}'|[^\s,}\]\r\n]{1,500})/gi,
   (_whole,prefix,value)=>prefix+(value.startsWith('"')?'"[REDACTED]"':value.startsWith("'")?"'[REDACTED]'":"[REDACTED]"));
  apply("cookies",/(\b(?:set-cookie|cookie)\s*:\s*)[^\r\n]+/gi,(_whole,prefix)=>prefix+"[REDACTED]");
  apply("URL credentials",/([?&#](?:token|session|access_token|refresh_token|api_key|apikey|auth|password)=)[^&#\s"'<>]+/gi,(_whole,prefix)=>prefix+"[REDACTED]");
 }
 if(opts.userPaths){
  apply("home paths",/\/(?:Users|home)\/(?!\[USER\]\/)[^/\s"'<>]{1,100}\//g,
   (whole)=>whole.startsWith("/Users/")?"/Users/[USER]/":"/home/[USER]/");
 }
 if(opts.emails){
  apply("email addresses",/\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,200}\.[A-Z]{2,24}\b/gi,()=>"[EMAIL]");
 }
 if(opts.ipv4){
  apply("IPv4 addresses",/\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g,()=>"[IPV4]");
 }
 return {text,replacements,categories};
}
