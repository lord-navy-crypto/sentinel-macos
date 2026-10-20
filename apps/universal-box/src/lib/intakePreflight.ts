/** Pure local review of file metadata before opening file content.
 * A preflight warning is not a malware verdict.
 */
import {INSPECT_MAX_EACH,INSPECT_MAX_FILES,INSPECT_MAX_TOTAL} from "./fileIntake";

export type StagedFile={name:string;size:number};
export type IntakeIssue={code:"empty"|"duplicate-name"|"multiple-suffix"|"directional-mark"|"filename"|"size"|"limit";message:string;name?:string};
export type IntakePreflight={accepted:boolean;files:number;totalBytes:number;issues:IntakeIssue[]};

const BIDI=/[\u202a-\u202e\u2066-\u2069]/u;
const KNOWN_SUFFIXES=new Set(["pdf","png","jpg","jpeg","gif","webp","zip","docx","xlsx","pptx","wav","txt","csv","json","md","svg"]);
export function preflightFiles(files:readonly StagedFile[]):IntakePreflight{
 const issues:IntakeIssue[]=[];
 let accepted=true,totalBytes=0;
 if(files.length>INSPECT_MAX_FILES){accepted=false;issues.push({code:"limit",message:`一次最多选取 ${INSPECT_MAX_FILES} 个文件。`});}
 const seen=new Map<string,number>();
 for(const file of files){
  totalBytes+=file.size;
  const n=file.name;
  seen.set(n,(seen.get(n)??0)+1);
  if(!Number.isSafeInteger(file.size)||file.size<0||file.size>INSPECT_MAX_EACH){
   accepted=false;
   issues.push({code:"size",name:n,message:"文件大小无效或超过单文件 64 MB 限制。"});
  }else if(file.size===0)issues.push({code:"empty",name:n,message:"空文件：没有可识别的文件内容。"});
  if(!n||n.length>512||/[\u0000-\u001f\u007f]/u.test(n))
   issues.push({code:"filename",name:n,message:"文件名包含控制字符、长度异常或为空，请人工核对。"});
  if(BIDI.test(n))issues.push({code:"directional-mark",name:n,message:"文件名包含可能改变显示顺序的方向控制字符。"});
  const parts=n.split(".");
  if(parts.length>=3&&KNOWN_SUFFIXES.has(parts.at(-2)?.toLowerCase()??""))
   issues.push({code:"multiple-suffix",name:n,message:"存在多重扩展名，请确认文件来源和真实格式。"});
 }
 if(totalBytes>INSPECT_MAX_TOTAL||!Number.isSafeInteger(totalBytes)){
  accepted=false;issues.push({code:"limit",message:"单批文件总大小超过 160 MB 限制。"});
 }
 for(const [name,count] of seen){
  if(count>1)issues.push({code:"duplicate-name",name,message:`有 ${count} 个同名文件；跨设备清单比较可能产生歧义。`});
 }
 return {accepted,files:files.length,totalBytes,issues};
}
