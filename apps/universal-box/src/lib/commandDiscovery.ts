/** Keyboard-first command search for existing Sentinel Box tools; no network or file indexing. */
export type PaletteCommand={id:string;name:string;description:string;view:string;module?:string};
const ALIASES:Record<string,string[]>={
 "tool-scan-pdf-compress":["compress pdf","reduce pdf","pdf扫描压缩","扫描件压缩","压缩pdf"],
 "tool-pdf-measured-optimize":["pdf size","smaller pdf","pdf大小","优化pdf","压缩pdf"],
 "tool-screen-frame-capture":["screen capture","screenshot ocr","截图识字","屏幕识字","截图复制"],
 "tool-target-photo-compressor":["photo compress","jpeg compress","heic convert","heic转jpg","图片压缩","图片转换"],
 "tool-business-billing":["invoice","quotation","billing","发票","报价","报价单","客户账单"],
 "tool-word-count":["character count","count words","字数统计","字符统计","字母计数"],
 "tool-mac-offline-voice-to-text":["transcribe","speech text","录音转文字","语音识别","音频转文字"],
 "tool-csv-docx-mail-merge":["mail merge","bulk word","邮件合并","批量word"],
 "tool-multi-file-literal-replace":["find replace","batch replace","查找替换","批量替换"],
 "tool-pdf-converters":["images to pdf","pdf to images","图片转pdf"],
 "view-all-tools":["find tool","所有工具","全部工具"],
 "view-file-intake":["import file","file inspect","文件导入"],
 "view-workflows":["workflow","批量处理","工作流"],
};
const DEFAULT_IDS=["tool-scan-pdf-compress","tool-pdf-measured-optimize","tool-target-photo-compressor",
 "tool-business-billing","view-workflows","view-vision-workflows","view-file-intake",
 "view-all-tools","view-pdf-mini","view-free-formats","view-charts","view-system-health"];
export function sanitizePaletteHistory(input:unknown,validIds:ReadonlySet<string>,limit=12):string[]{
 if(!Array.isArray(input))return [];
 const seen=new Set<string>(),out:string[]=[];
 for(const item of input){
  if(typeof item!=="string"||!validIds.has(item)||seen.has(item))continue;
  seen.add(item);out.push(item);
  if(out.length>=limit)break;
 }
 return out;
}
export function addPaletteRecent(recent:readonly string[],id:string,validIds:ReadonlySet<string>):string[]{
 return validIds.has(id)?sanitizePaletteHistory([id,...recent],validIds,12):sanitizePaletteHistory(recent,validIds,12);
}
const normal=(value:string)=>value.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/gu," ");
function scoreCommand(item:PaletteCommand,term:string):number{
 const name=normal(item.name),id=normal(item.id),description=normal(item.description);
 const aliases=(ALIASES[item.id]??[]).map(normal);
 const all=name+" "+id+" "+description+" "+aliases.join(" ");
 if(!term)return 1;
 const tokens=term.split(" ");
 if(!tokens.every(t=>all.includes(t)))return 0;
 if(name===term)return 110;
 if(name.startsWith(term))return 95;
 if(aliases.includes(term))return 92;
 if(aliases.some(x=>x.startsWith(term)))return 82;
 if(name.includes(term))return 70;
 if(id.includes(term))return 58;
 if(description.includes(term))return 42;
 return 28;
}
export function searchPalette(
 items:readonly PaletteCommand[],query:string,
 pinned:readonly string[]=[],recent:readonly string[]=[],limit=12,
):PaletteCommand[]{
 const term=normal(query).slice(0,120);
 const pins=new Set(pinned),last=new Map(recent.map((id,index)=>[id,index]));
 const pool=items.map((item,index)=>{
  let score=scoreCommand(item,term);
  if(!term){
   const defaultIndex=DEFAULT_IDS.indexOf(item.id);
   const recentIndex=last.get(item.id);
   if(pins.has(item.id))score+=500;
   else if(recentIndex!==undefined)score+=400-recentIndex;
   else if(defaultIndex!==-1)score+=250-defaultIndex;
   else score=0;
  }else{
   if(score>0&&pins.has(item.id))score+=8;
   if(score>0&&last.has(item.id))score+=5;
  }
  return {item,score,index};
 }).filter(x=>x.score>0);
 return pool.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(x=>x.item);
}
