/** Device-only Universal Access settings. No telemetry or privileged capabilities. */
export const ACCESS_STORAGE_KEY="universal-box-access-v1";
export type ReadingSize="standard"|"large"|"extra";
export type AccessPreferences={
  reading:ReadingSize;
  highContrast:boolean;
  simplerHome:boolean;
  reducedMotion:boolean;
};
export const DEFAULT_ACCESS:AccessPreferences={
  reading:"standard",highContrast:false,simplerHome:false,reducedMotion:false,
};
export function parseAccessPreferences(raw:string|null):AccessPreferences{
  if(raw===null||raw.length>1500)return {...DEFAULT_ACCESS};
  try{
    const data:unknown=JSON.parse(raw);
    if(typeof data!=="object"||!data||Array.isArray(data))return {...DEFAULT_ACCESS};
    const prefs=data as Record<string,unknown>;
    return {
      reading:["standard","large","extra"].includes(String(prefs.reading))
        ?prefs.reading as ReadingSize:"standard",
      highContrast:prefs.highContrast===true,
      simplerHome:prefs.simplerHome===true,
      reducedMotion:prefs.reducedMotion===true,
    };
  }catch{return {...DEFAULT_ACCESS};}
}
export function readAccessPreferences():AccessPreferences{
  try{return parseAccessPreferences(localStorage.getItem(ACCESS_STORAGE_KEY));}
  catch{return {...DEFAULT_ACCESS};}
}
export function writeAccessPreferences(value:AccessPreferences):boolean{
  try{localStorage.setItem(ACCESS_STORAGE_KEY,JSON.stringify(value));return true;}
  catch{return false;}
}
