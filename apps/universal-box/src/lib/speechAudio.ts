/** Audio from a user-picked file or consented mic stream, decoded and normalized into PCM16 mono/16k WAV.
 * No network, cloud ASR, FFmpeg, or broad media library access.
 */
export const SPEECH_SAMPLE_RATE=16_000;
export const SPEECH_MAX_SECONDS=90;
export const SPEECH_MAX_INPUT=12_000_000;
export const AUDIO_IMPORT_EXTENSIONS=/\.(?:wav|wave|mp3|m4a|mp4|aac|webm|ogg|opus|flac|aif|aiff|caf)$/iu;
/** Preflight user-selected audio. Actual codec support is checked by the local decoder. */
export function validateAudioImport(file:{name:string;size:number}):void{
 if(!AUDIO_IMPORT_EXTENSIONS.test(file.name))
  throw Error("Choose a recognizable audio file (WAV, MP3, M4A, WebM, OGG, or similar).");
 if(!Number.isSafeInteger(file.size)||file.size<44||file.size>SPEECH_MAX_INPUT)
  throw Error("Audio file must be 44 bytes–12 MB.");
}

export function encodeMonoWav16(samples:Float32Array,sampleRate=SPEECH_SAMPLE_RATE):Uint8Array{
 if(sampleRate!==SPEECH_SAMPLE_RATE||samples.length<1||samples.length>SPEECH_SAMPLE_RATE*SPEECH_MAX_SECONDS)
  throw Error("Speech audio must be mono 16kHz PCM of 1–90 seconds.");
 const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
 const tag=(i:number,s:string)=>{for(const ch of s)bytes[i++]=ch.charCodeAt(0);};
 tag(0,"RIFF");view.setUint32(4,bytes.length-8,true);
 tag(8,"WAVE");tag(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 tag(36,"data");view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const n=Number.isFinite(samples[i])?Math.min(1,Math.max(-1,samples[i])):0;
  view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(n*32767))),true);
 }
 return bytes;
}
export function sampleMono16k(channels:readonly Float32Array[],originalRate:number):Float32Array{
 if(channels.length<1||channels.length>2||!Number.isFinite(originalRate)||originalRate<8000||originalRate>192000)
  throw Error("Audio sample rate or channel count is unsupported.");
 const length=channels[0].length;
 if(!Number.isSafeInteger(length)||length<1||channels.some(c=>c.length!==length))
  throw Error("Audio channels have inconsistent samples.");
 const duration=length/originalRate;
 if(duration<=0||duration>SPEECH_MAX_SECONDS)throw Error("Use audio clips no longer than 90 seconds.");
 const size=Math.min(Math.ceil(duration*SPEECH_SAMPLE_RATE),SPEECH_SAMPLE_RATE*SPEECH_MAX_SECONDS);
 const mono=new Float32Array(size);
 for(let i=0;i<size;i++){
  const position=i*originalRate/SPEECH_SAMPLE_RATE;
  const base=Math.min(length-1,Math.floor(position)),end=Math.min(length-1,base+1),blend=position-base;
  let value=0;
  for(const ch of channels)value+=ch[base]+(ch[end]-ch[base])*blend;
  mono[i]=value/channels.length;
 }
 return mono;
}
export async function decodeAudioToWav(input:ArrayBuffer):Promise<{wav:Uint8Array;seconds:number}>{
 if(input.byteLength<44||input.byteLength>SPEECH_MAX_INPUT)throw Error("Audio input must be 44 bytes–12 MB.");
 const Ctx=window.AudioContext;
 if(!Ctx)throw Error("WebView does not provide the Web Audio decoder for this file.");
 const ctx=new Ctx();
 try{
  const audio=await ctx.decodeAudioData(input.slice(0));
  if(audio.duration>SPEECH_MAX_SECONDS||audio.numberOfChannels<1||audio.numberOfChannels>2)
   throw Error("Use supported mono/stereo audio up to 90 seconds.");
  const normalized=sampleMono16k(Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i)),audio.sampleRate);
  return {wav:encodeMonoWav16(normalized),seconds:normalized.length/SPEECH_SAMPLE_RATE};
 }catch(error){
  if(error instanceof Error&&/(90 seconds|mono|sample|unsupported)/i.test(error.message))throw error;
  throw Error("This browser/WebView cannot decode that audio format. Try a normal WAV, MP3 or M4A supported by your device.");
 }finally{await ctx.close();}
}
