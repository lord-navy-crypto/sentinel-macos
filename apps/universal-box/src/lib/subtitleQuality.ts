/** Read-only subtitle quality report, not automatic text/timing repair. */
import {parseSubtitles,type SubtitleFormat} from "./universalLab";
import {mergedCsvExport} from "./csvMerge";
export type SubtitleWarning={cue:number;category:"overlap"|"order"|"fast"|"short"|"long"|"gap";details:string};
export type SubtitleReport={count:number;durationMs:number;averageCps:number;warnings:SubtitleWarning[]};
export function inspectSubtitleQuality(source:string,format:SubtitleFormat,cpsLimit=20,gapSeconds=10):SubtitleReport{
 if(!Number.isFinite(cpsLimit)||cpsLimit<5||cpsLimit>100||!Number.isFinite(gapSeconds)||gapSeconds<1||gapSeconds>120)
  throw Error("Subtitle QA thresholds are out of range.");
 const cues=parseSubtitles(source,format);
 const warnings:SubtitleWarning[]=[];
 const add=(cue:number,category:SubtitleWarning["category"],details:string)=>{
  if(warnings.length>=4000)throw Error("Subtitle QA report exceeds 4,000 warnings.");
  warnings.push({cue,category,details});
 };
 let characters=0,seconds=0,maxEnd=0;
 cues.forEach((cue,i)=>{
  const duration=(cue.end-cue.start)/1000;
  const count=[...cue.lines.join("").replace(/\s/gu,"")].length;
  characters+=count;seconds+=duration;maxEnd=Math.max(maxEnd,cue.end);
  if(duration<0.5)add(i+1,"short","Only "+duration.toFixed(2)+" s on screen");
  if(duration>9)add(i+1,"long","Displayed "+duration.toFixed(2)+" s");
  if(count/duration>cpsLimit)add(i+1,"fast",(count/duration).toFixed(1)+" characters/s (limit "+cpsLimit+")");
  if(i>0){
   const prev=cues[i-1];
   if(cue.start<prev.start)add(i+1,"order","Cue starts earlier than previous cue");
   if(cue.start<prev.end)add(i+1,"overlap","Overlaps previous cue by "+((prev.end-cue.start)/1000).toFixed(2)+" s");
   if(cue.start-prev.end>gapSeconds*1000)add(i+1,"gap","Gap of "+((cue.start-prev.end)/1000).toFixed(2)+" s");
  }
 });
 return {count:cues.length,durationMs:maxEnd,averageCps:seconds?Number((characters/seconds).toFixed(2)):0,warnings};
}
export function subtitleQualityCsv(result:SubtitleReport):string{
 return "\uFEFF"+mergedCsvExport({headers:["cue","category","details"],
  rows:result.warnings.map(w=>[String(w.cue),w.category,w.details])});
}
