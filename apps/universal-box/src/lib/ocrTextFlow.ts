/** Present a native OCR result without fabricating text, truncating source or hiding errors. */
export type NativeOcrLine={text:string;confidence:number};
export function normalizeOcrLines(value:unknown):{lines:NativeOcrLine[];text:string}{
 if(!Array.isArray(value)||value.length>5000)throw Error("Invalid or excessive OCR result lines.");
 const lines:NativeOcrLine[]=[];
 for(const item of value){
  if(!item||typeof item!=="object")throw Error("Invalid OCR line result.");
  const line=item as Record<string,unknown>;
  if(typeof line.text!=="string"||line.text.length>10000||typeof line.confidence!=="number"||
   !Number.isFinite(line.confidence)||line.confidence<0||line.confidence>1)
   throw Error("Invalid OCR text or confidence from native recognizer.");
  lines.push({text:line.text,confidence:line.confidence});
 }
 const text=lines.map(x=>x.text).join("\n");
 if(text.length>200_000)throw Error("OCR text exceeds 200,000 characters.");
 return {lines,text};
}

/** Advisory only: OCR confidence varies with language, image and Apple Vision revision. */
export function countUncertainOcrLines(lines:readonly NativeOcrLine[],threshold=0.65):number{
 if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw Error("Invalid OCR threshold.");
 return lines.filter(line=>{
  if(typeof line.confidence!=="number"||!Number.isFinite(line.confidence)||
     line.confidence<0||line.confidence>1)
    throw Error("Invalid native OCR confidence.");
  return line.text.trim().length>0&&line.confidence<threshold;
 }).length;
}
