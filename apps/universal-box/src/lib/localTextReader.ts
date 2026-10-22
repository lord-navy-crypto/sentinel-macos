/** The Web Speech API may expose remote voices; only accept verified localService voices. */
export const READER_MAX_CHARS=5000;
export type LocalReaderVoice={name:string;lang:string;voiceURI:string;localService:boolean};
export function availableLocalReaderVoices<T extends LocalReaderVoice>(voices:readonly T[]):T[]{
 return voices.filter(voice=>voice.localService===true&&
   !!voice.name.trim()&&!!voice.lang.trim()&&!!voice.voiceURI.trim())
   .sort((a,b)=>a.lang.localeCompare(b.lang)||a.name.localeCompare(b.name));
}
export function validateReaderText(input:string):string{
 if(typeof input!=="string"||!input.trim())throw Error("Paste some text to read aloud.");
 if(input.length>READER_MAX_CHARS)throw Error("Text exceeds the 5,000-character local reading limit.");
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input))
  throw Error("Reader text contains unsupported control characters.");
 return input.trim();
}
export function validateReaderRate(value:number):number{
 if(!Number.isFinite(value)||value<0.7||value>1.5)
  throw Error("Reading speed must be between 0.7x and 1.5x.");
 return value;
}
