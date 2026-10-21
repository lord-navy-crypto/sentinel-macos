/** Captions from REAL Apple Speech timecoded segments: no invented timestamps. */
export type SpeechTiming={text:string;start:number;duration:number;confidence:number};
export type TimedCue={start:number;end:number;text:string;confidence:number};
export function speechCues(segments:readonly SpeechTiming[],maxChars=48,maxSeconds=5):TimedCue[]{
 if(!Number.isSafeInteger(maxChars)||maxChars<15||maxChars>100||!Number.isFinite(maxSeconds)||maxSeconds<1||maxSeconds>10)
  throw Error("Caption line length and duration are out of range.");
 if(segments.length<1||segments.length>5000)throw Error("No timed speech segments were provided by the recognizer.");
 const ordered=[...segments];
 if(ordered.some(s=>!s.text.trim()||s.text.length>500||!Number.isFinite(s.start)||!Number.isFinite(s.duration)||
  s.start<0||s.duration<=0||s.start+s.duration>95||!Number.isFinite(s.confidence)))
  throw Error("Speech timing data is invalid; caption times cannot be guessed.");
 for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].start)
  throw Error("Speech segments are out of timestamp order.");
 let current:TimedCue|null=null;
 const cues:TimedCue[]=[];
 const push=()=>{if(current){cues.push(current);current=null;}};
 function join(left:string,right:string):string{
  const a=left.trim(),b=right.trim();
  if(!a)return b;
  if(/^[,.;!?，。！？、；：）\]】]/u.test(b))return a+b;
  if(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(a)||
     /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(b))return a+b;
  return a+" "+b;
 }
 for(const seg of ordered){
  const value=seg.text.trim().replace(/[\r\n\t]+/gu," ");
  if(!value)continue;
  const end=seg.start+seg.duration;
  if(current&&(seg.start-current.end>0.85||end-current.start>maxSeconds||
     join(current.text,value).length>maxChars))push();
  if(!current)current={start:seg.start,end,text:value,confidence:seg.confidence};
  else{current.end=Math.max(current.end,end);current.text=join(current.text,value);
   current.confidence=Math.min(current.confidence,seg.confidence);}
 }
 push();
 if(!cues.length)throw Error("No usable timed speech segments.");
 // Prevent invalid time ranges even if recognizer returns overlapping fragments.
 for(let i=0;i<cues.length;i++){
  const start=i>0?Math.max(cues[i].start,cues[i-1].end):cues[i].start;
  const end=Math.max(start+0.04,cues[i].end);
  cues[i]={...cues[i],start,end};
 }
 return cues;
}
function clock(seconds:number,separator:"."|","){
 const ms=Math.round(seconds*1000),hh=Math.floor(ms/3_600_000),mm=Math.floor(ms%3_600_000/60_000),
 ss=Math.floor(ms%60_000/1000),fraction=ms%1000,pad=(v:number,width=2)=>String(v).padStart(width,"0");
 return pad(hh)+":"+pad(mm)+":"+pad(ss)+separator+pad(fraction,3);
}
export function exportTimedCaptions(cues:readonly TimedCue[],kind:"srt"|"vtt"):string{
 if(!["srt","vtt"].includes(kind)||cues.length<1||cues.length>5000)throw Error("Invalid caption format or cue count.");
 let previous=-1;
 const parts=cues.map((c,i)=>{
  if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||
    c.start<previous||c.end>95||!c.text.trim()||c.text.length>100)
   throw Error("Cue timing or text is invalid.");
  previous=c.end;
  const text=c.text.replace(/[\r\n]+/gu," ").replace(/-->/gu,"→")
    .replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;");
  const timing=clock(c.start,kind==="srt"?",":".")+" --> "+clock(c.end,kind==="srt"?",":".");
  return (kind==="srt"?(i+1)+"\n":"")+timing+"\n"+text+"\n";
 });
 return (kind==="vtt"?"WEBVTT\n\n":"")+parts.join("\n");
}
