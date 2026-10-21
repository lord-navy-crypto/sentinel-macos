/** Accurate sample-peak and RMS statistics for bounded PCM16 WAV; NOT EBU R128 LUFS. */
import {inspectPcmWav} from "./wavTools";
export type WavWindow={startMs:number;endMs:number;peakDbfs:number|null;rmsDbfs:number|null};
export type WavLevels={sampleRate:number;channels:number;durationMs:number;frames:number;peakDbfs:number|null;rmsDbfs:number|null;
 dcOffsetPercent:number;clippedSamples:number;crestDb:number|null;windows:WavWindow[]};
const asDb=(x:number):number|null=>x>0?Number((20*Math.log10(x)).toFixed(2)):null;
export function analyzeWavLevels(input:Uint8Array):WavLevels{
 const info=inspectPcmWav(input);
 const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
 let peak=0,sum=0,sumSquares=0,clippedSamples=0;
 const windowFrames=Math.max(1,Math.ceil(info.frames/80));
 const windows:WavWindow[]=[];
 for(let first=0;first<info.frames;first+=windowFrames){
  const end=Math.min(info.frames,first+windowFrames);
  let windowPeak=0,windowSquares=0;
  for(let frame=first;frame<end;frame++)for(let channel=0;channel<info.channels;channel++){
   const value=view.getInt16(info.dataOffset+(frame*info.channels+channel)*2,true);
   const normalized=value/32768,amplitude=Math.abs(normalized);
   sum+=normalized;sumSquares+=normalized*normalized;windowSquares+=normalized*normalized;
   peak=Math.max(peak,amplitude);windowPeak=Math.max(windowPeak,amplitude);
   if(value===32767||value===-32768)clippedSamples++;
  }
  const n=(end-first)*info.channels;
  windows.push({startMs:Number((first*1000/info.sampleRate).toFixed(2)),
   endMs:Number((end*1000/info.sampleRate).toFixed(2)),
   peakDbfs:asDb(windowPeak),rmsDbfs:asDb(Math.sqrt(windowSquares/n))});
 }
 const samples=info.frames*info.channels,rms=Math.sqrt(sumSquares/samples);
 return {sampleRate:info.sampleRate,channels:info.channels,durationMs:info.durationMs,
  frames:info.frames,peakDbfs:asDb(peak),rmsDbfs:asDb(rms),
  dcOffsetPercent:Number((100*sum/samples).toFixed(4)),clippedSamples,
  crestDb:peak>0&&rms>0?Number((20*Math.log10(peak/rms)).toFixed(2)):null,windows};
}
export function wavLevelsCsv(report:WavLevels):string{
 const c=(v:string)=>'"'+v.replace(/"/gu,'""')+'"';
 return "\uFEFF"+[["start_ms","end_ms","peak_dbfs","rms_dbfs"],
 ...report.windows.map(w=>[String(w.startMs),String(w.endMs),w.peakDbfs===null?"-inf":String(w.peakDbfs),w.rmsDbfs===null?"-inf":String(w.rmsDbfs)])]
 .map(row=>row.map(c).join(",")).join("\r\n")+"\r\n";
}
