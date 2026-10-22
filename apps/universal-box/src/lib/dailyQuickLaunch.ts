/** Small offline catalog shortcuts; selecting them only launches existing tools. */
export const DEFAULT_DAILY_SHORTCUTS=[
 "quick-clean-text","target-photo-compressor","pdf","rename",
 "quick-multi-copy","mac-native-vision-ocr",
] as const;
export function chooseDailyShortcuts<T extends {id:string}>(
 tools:readonly T[],favorites:readonly string[],max=6,
):T[]{
 if(!Number.isSafeInteger(max)||max<1||max>12)throw Error("Quick launch limit must be 1–12.");
 const found=new Map(tools.map(tool=>[tool.id,tool]));
 const used=new Set<string>(),result:T[]=[];
 for(const id of [...favorites,...DEFAULT_DAILY_SHORTCUTS]){
  if(used.has(id))continue;
  used.add(id);
  const tool=found.get(id);
  if(tool)result.push(tool);
  if(result.length>=max)break;
 }
 return result;
}
