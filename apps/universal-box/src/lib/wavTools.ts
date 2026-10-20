/** Strict, bounded PCM16 WAV processor. Source is never modified. */
export type WavInfo={sampleRate:number;channels:number;frames:number;durationMs:number;dataOffset:number;dataBytes:number};
const MAX_WAV=20_000_000;
const u32=(v:DataView,p:number)=>v.getUint32(p,true);
const u16=(v:DataView,p:number)=>v.getUint16(p,true);
const tag=(bytes:Uint8Array,p:number)=>String.fromCharCode(...bytes.subarray(p,p+4));
export function inspectPcmWav(bytes:Uint8Array):WavInfo{
 if(bytes.byteLength<44||bytes.byteLength>MAX_WAV)throw Error("WAV input must be 44 bytes–20 MB.");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(tag(bytes,0)!=="RIFF"||tag(bytes,8)!=="WAVE")throw Error("Only RIFF WAVE files are supported (not RF64/RIFX).");
 const declared=u32(view,4)+8;
 if(declared!==bytes.byteLength)throw Error("RIFF declared length differs from actual file size.");
 let pos=12,format:undefined|{channels:number;sampleRate:number;align:number},dataOffset=-1,dataBytes=0;
 while(pos<bytes.byteLength){
   if(pos+8>bytes.byteLength)throw Error("Incomplete WAV chunk header.");
   const name=tag(bytes,pos),length=u32(view,pos+4);
   const start=pos+8,end=start+length;
   if(end>bytes.byteLength)throw Error("WAV chunk exceeds file boundaries.");
   if(name==="fmt "){
     if(format||length<16)throw Error("Invalid or duplicate fmt chunk.");
     if(u16(view,start)!==1||u16(view,start+14)!==16)throw Error("Only uncompressed signed 16-bit PCM WAV is supported.");
     const channels=u16(view,start+2),sampleRate=u32(view,start+4);
     const align=u16(view,start+12);
     if(channels<1||channels>2||sampleRate<8000||sampleRate>192000||align!==channels*2
         ||u32(view,start+8)!==sampleRate*align)
       throw Error("Unsupported WAV channel count, rate or byte alignment.");
     format={channels,sampleRate,align};
   }
   if(name==="data"){
     if(dataOffset!==-1)throw Error("Multiple WAV data chunks are unsupported.");
     dataOffset=start;dataBytes=length;
   }
   pos=end+(length%2);
   if(pos>bytes.byteLength)throw Error("Missing WAV chunk padding.");
 }
 if(!format||dataOffset<0||dataBytes===0||dataBytes%format.align)throw Error("Missing or invalid PCM audio data.");
 const frames=dataBytes/format.align;
 return {sampleRate:format.sampleRate,channels:format.channels,frames,
   durationMs:frames*1000/format.sampleRate,dataOffset,dataBytes};
}
export type WavEdit={startMs:number;endMs:number;normalize:boolean;fadeMs:number};
export function editPcmWav(input:Uint8Array,edit:WavEdit):{bytes:Uint8Array;info:WavInfo;gain:number}{
 const info=inspectPcmWav(input);
 if(!Number.isFinite(edit.startMs)||!Number.isFinite(edit.endMs)||edit.startMs<0
   ||edit.endMs<=edit.startMs||edit.endMs>info.durationMs+0.00001)
   throw Error("Trim start/end must be within the track, with end after start.");
 if(!Number.isFinite(edit.fadeMs)||edit.fadeMs<0||edit.fadeMs>1500)
   throw Error("Fade must be 0–1,500 milliseconds.");
 const first=Math.floor(edit.startMs*info.sampleRate/1000);
 const last=Math.min(info.frames,Math.ceil(edit.endMs*info.sampleRate/1000));
 const frames=last-first;
 if(frames<=0||44+frames*info.channels*2>MAX_WAV)throw Error("Edited WAV is empty or exceeds the 20 MB output limit.");
 const src=new DataView(input.buffer,input.byteOffset,input.byteLength);
 let peak=0;
 for(let i=first*info.channels;i<last*info.channels;i++)
   peak=Math.max(peak,Math.abs(src.getInt16(info.dataOffset+i*2,true))/32768);
 // Conservative gain: 0–4× and no aggressive amplification of near-silent noise.
 const gain=edit.normalize&&peak>=0.01?Math.min(4,.95/peak):1;
 const dataSize=frames*info.channels*2;
 const out=new Uint8Array(44+dataSize),view=new DataView(out.buffer);
 const writeTag=(at:number,value:string)=>{for(let i=0;i<value.length;i++)out[at+i]=value.charCodeAt(i);};
 writeTag(0,"RIFF");view.setUint32(4,36+dataSize,true);writeTag(8,"WAVE");writeTag(12,"fmt ");
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,info.channels,true);
 view.setUint32(24,info.sampleRate,true);view.setUint32(28,info.sampleRate*info.channels*2,true);
 view.setUint16(32,info.channels*2,true);view.setUint16(34,16,true);
 writeTag(36,"data");view.setUint32(40,dataSize,true);
 const fadeFrames=Math.min(Math.floor(edit.fadeMs*info.sampleRate/1000),Math.floor(frames/2));
 for(let frame=0;frame<frames;frame++){
   const fade=fadeFrames>0?Math.min(1,(frame+1)/fadeFrames,(frames-frame)/fadeFrames):1;
   for(let ch=0;ch<info.channels;ch++){
     const sourceIndex=info.dataOffset+((first+frame)*info.channels+ch)*2;
     const value=src.getInt16(sourceIndex,true);
     const rounded=Math.round(value*gain*fade);
     view.setInt16(44+(frame*info.channels+ch)*2,Math.max(-32768,Math.min(32767,rounded)),true);
   }
 }
 return {bytes:out,info,gain};
}
